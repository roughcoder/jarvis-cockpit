# Design Note: Repo Access And Worker Provisioning

Date: 2026-07-06

Status: agreed direction (Neil + coordinator discussion); Jarvis-side work not yet specced in
roughcoder/jarvis. Amends the repo/worker framing in `jarvis-first-cockpit-plan.md`
(Phases 3 and 6).

## Problem

The as-built model treats "repos on a worker's disk" as the capability boundary: workers
report startable repos, and start-work compatibility blocks on repo presence
(`workerCanStartRepo`). That conflates **provisioning state** with **authorization**. Repos
are associated at the project level (by users, MCPs, chats), and the real question when
dispatching is whether the work *can get* the repo — not whether it already has it.

## Model

Every dispatch involves two identities, and they must not be merged:

1. **Dispatching principal** — the Jarvis user (mapped from cockpit auth). Governs what
   Jarvis permits: projects, capabilities, deny-by-default gates.
2. **Worker git identity** — GitHub credentials held BY THE DEVICE/worker, not by the brain.
   Governs what that worker can fetch and push. Different workers can (and will) have
   different GitHub identities — e.g. a family member's laptop worker runs under their
   GitHub, not the fleet owner's.

Three planes, kept separate:

| Plane | Question | Owner |
|---|---|---|
| Access | Can worker W's git identity read repo R (or is R public)? | Worker-held credentials |
| Project | Which repos does this project operate on? Which is default? | Jarvis project registry |
| Execution | Can W materialize R: git, disk, network, capacity? | Worker runtime |

**Repo presence on disk is a warm cache.** It affects first-run latency (clone vs reuse),
never eligibility.

### Eligibility predicate

```
canStart(principal, project, repo, worker) =
    jarvisPermits(principal, project)
  ∧ repoBelongsToProject(repo, project)
  ∧ (isPublic(repo) ∨ workerGitIdentityCanAccess(worker, repo))
  ∧ workerCanMaterialize(worker)          # git present, disk, capacity
```

Note the shape matches the shipped `workerCanStartRepo` — the fix is replacing the
disk-presence predicate with an access predicate, not restructuring the flow.

### Access checking ("blocking to see if it can pull")

- `POST /v1/work/validate` grows an access probe: the brain asks the candidate worker (or a
  cached per-worker access catalog) whether its identity can read the repo —
  `git ls-remote`-class check or GitHub API lookup, cached with a TTL.
- Block only when NO worker has access; warn when the selected worker lacks access but
  another has it.
- Failed access gets guided remediation, not a bare block: "Connect GitHub on this worker",
  "Request access to <org>/<repo>", "Repo is private — choose a worker signed in as an
  identity with access".

### Provisioning pipeline (worktree-first)

On dispatch of repo R to worker W where R is not cached:

```
resolve access → clone/fetch into designated location (bare mirror preferred)
             → create worktree per work item (branch_strategy from Jarvis)
             → run engine in the worktree
```

Each phase is observable: dispatch progress must report `resolving-access`, `cloning`,
`creating-worktree`, `running`, plus terminal states. The 2026-07-06 dogfood failure
(`fatal: cannot lock ref 'refs/heads/jarvis/...'`, 502 provider_unavailable) is exactly a
provisioning-phase failure that today is invisible until a server log is read.

### Worker card / readiness implications (Phase 6 reframe)

Worker cards lead with capability and hygiene, not a repo listing:

- Git identity: which GitHub account/app this worker is signed in as, auth freshness, scopes.
- Access summary: N repos accessible via this identity (+ public), last catalog refresh.
- Warm checkouts: repos already materialized (cache detail, not the headline).
- **Worktree inventory: count, disk usage, stale/orphaned worktrees** — cleanup insight;
  later a prune affordance.
- Capacity/queue, engines, last failure, last seen (unchanged from the plan).

Readiness rows change accordingly: "repo checkout valid" → "can materialize worktrees" +
per-repo cache state; add "git credentials valid / identity connected".

### Provenance and consent (open policy questions)

- Pushes from a worker are authored via the WORKER's git identity. The start-work summary
  should display which identity will fetch/push before dispatch.
- Cross-user dispatch (Neil's work onto Noah's laptop) needs worker-owner consent policy:
  which principals' work a worker accepts, and audit of which identity performed each fetch
  and push.
- Repo access catalogs reported to the brain reveal a worker owner's repo list to the fleet;
  acceptable within a family fleet, but should be stated.

## Division of work

Jarvis-side (roughcoder/jarvis — needs a spec/issue there):

- Per-worker git identity + access catalog (or on-demand access probe) in the worker
  protocol and snapshot.
- `work/validate` access-probe semantics and remediation reason codes.
- Provision-on-dispatch (accept any accessible repo, not just present ones) with
  progress phases.
- Worktree inventory (count/size/stale) in worker snapshot.

Cockpit-side (this repo):

- **One repo-picker source of truth.** Every UI surface that shows or selects a repo (chat
  composer repo selector, start-work palette, project settings, worker cards) draws from the
  same catalog module: project repos ∩ union of worker access catalogs, annotated with which
  workers can take the repo and whether it is warm.
- **Cache semantics on that source**: stale-while-revalidate — render the cached catalog
  instantly, label it with freshness ("stale, refreshing…" / last-fetched), refresh in the
  background on use. Access probes cached per worker × repo with a TTL. Pickers must feel
  instant; correctness catches up.
- **Search everywhere.** Any repo list is type-to-filter; the chat composer repo selector
  gets a filter input like the command palette. No unsearchable repo dropdowns.
- Compatibility copy: block on access/capability; presence shown as "will clone on
  dispatch" latency hint.
- Worker cards + readiness rows per the reframe above (Phase 6).
- Start-work summary shows the git identity that will push.

## Interim state

Until Jarvis exposes access catalogs and provision-on-dispatch, the worker-reported repo
list remains the only dispatchable set. Cockpit should render it as "warm checkouts" and
keep the current blocking behaviour, clearly labelled as a temporary presence-based check.
