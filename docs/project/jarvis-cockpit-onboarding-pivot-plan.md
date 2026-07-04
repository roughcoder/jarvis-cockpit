# Plan: Jarvis Cockpit Onboarding Pivot

Date: 2026-07-04

Status: in progress — the cockpit-mode copy pivot, synthetic `Start Jarvis work`
anchor, and manual `Describe work` start path landed on 2026-07-04; see the
progress log and current-state doc.

Scope: replace upstream T3's local-project onboarding with a Jarvis-first
operator flow for starting and continuing engineering work through Stevie/Jarvis.
This is a product and UI-navigation plan only; it does not change the Jarvis
execution contract.

## Requirements Summary

The current "Add project" flow still teaches the upstream T3 model: choose a
local folder or clone a repository, then let T3 own the project, branch,
worktree, and provider session. That conflicts with the cockpit authority model.
In `jarvis-cockpit`, the primary path should be "Start work": describe or select
work, let Jarvis choose or validate worker/engine/repo policy, dispatch through
Jarvis, then land on the run/session timeline.

Core requirements:

- Replace normal user-facing `Add project` language with `Start work` or
  `New run`.
- Treat "project" as a compatibility projection of Jarvis `OrchestrationRun`,
  not as the user-facing object for cockpit onboarding.
- Do not show local folder, local branch, local worktree, or local provider
  setup in the default Jarvis cockpit start flow.
- Keep all Jarvis-managed writes going through Jarvis APIs, especially
  `/v1/work/start` and `/v1/work/resume`.
- Preserve local T3 project creation only as an explicit legacy/debug path if
  the fork still needs it.
- Use Jarvis catalog, worker registry, health, engine support, and repository
  metadata for selectors.
- Make missing Jarvis-side onboarding contracts explicit rather than inventing
  a client-only source registry.

## Current-State Evidence

- The command palette now labels the primary cockpit action `Start work` when
  `jarvisCockpit` capability is present.
- The default cockpit work-source list exposes Jarvis choices instead of local
  folder/clone choices.
- `Describe work` creates a draft thread anchored to a synthetic
  `Start Jarvis work` project, then routes first send to Jarvis `/v1/work/start`.
- The synthetic `Start Jarvis work` anchor remains visible when there are no
  runs and when previous runs are terminal.
- `JarvisDispatch` accepts asynchronous successful start receipts without an
  immediate `session_ref`; polling reconciles the created run/session.
- Real-fleet dogfood proved the path with Jarvis run
  `run_1783161652_4f57bcca` and session `sessref_b4NDM8c61wuB4Uir`.
- Remaining wizard work is selector depth: repository, worker, engine, source,
  branch policy, and landing policy controls.

## Product Decision

Decision: make `Start work` the primary cockpit onboarding path.

Drivers:

- Jarvis owns orchestration, workers, provider state, repo execution, branches,
  artifacts, approvals, and authority.
- Cockpit users should reach the first value moment by describing work and
  seeing a Jarvis run/session timeline, not by selecting a filesystem folder.
- T3 local project concepts are still useful internally as projection plumbing,
  but misleading as primary user language in the cockpit.

Rejected default path:

- Keep upstream T3 `Add project` as the first onboarding action. This teaches
  users that T3 owns local workspace setup and conflicts with the Jarvis
  authority boundary.

Permitted exception:

- A clearly labelled `Local T3 project` or `Legacy local mode` affordance may
  remain behind a debug flag or advanced menu if local T3 development is still
  needed for testing the fork itself.

## Target Onboarding Model

Primary entry point:

- `Start work`

Primary options:

1. `Describe work`
   - Freeform objective and prompt.
   - Example: "Update the worker sessions API docs and raise a PR."
   - Submits to `/v1/work/start`.

2. `GitHub issue or PR`
   - Paste or select an issue/PR reference.
   - Jarvis resolves repo/context and dispatches work.
   - Requires Jarvis-side source resolution or a clearly documented missing-spec
     packet.

3. `Linear ticket`
   - Paste or select a ticket.
   - Jarvis resolves repo/context and dispatches work.
   - Requires Jarvis-side source resolution or a clearly documented missing-spec
     packet.

4. `Continue run`
   - Resume latest run or choose an existing run.
   - Submits to `/v1/work/resume`.

5. `Register repository`
   - Make a repository available to Jarvis.
   - Does not create a local T3 project or start local work.
   - Requires a Jarvis repository/catalog contract if worker repository metadata
     is insufficient.

Secondary or advanced entry point:

- `Local T3 project`
  - Hidden by default in Jarvis cockpit mode.
  - Explicitly says it bypasses Jarvis and uses local T3 project/worktree
    behavior.

## Wizard Shape

The wizard should be short and operational. It should not become a long setup
tutorial.

### Step 1: Objective

Fields:

- Objective/title.
- Prompt/detail.
- Optional verification expectation.

Defaults:

- `start: true`
- `source: manual`
- `branch_strategy: auto`
- `metadata.surface: jarvis-cockpit`

### Step 2: Source

Modes:

- Manual.
- Repository.
- GitHub issue/PR.
- Linear ticket.
- Existing run.

Behavior:

- For manual work, source can be skipped.
- For repository-based work, show Jarvis-known repositories and allow paste by
  repo slug only if Jarvis can validate it.
- For GitHub/Linear, validate through Jarvis or show "source resolver not
  available" with the missing endpoint requirement.

### Step 3: Worker

Choices:

- `Auto`.
- Available workers from Jarvis worker registry.

Display:

- status, health, capacity, supported engines, useful public metadata.
- No private worker URLs, local absolute paths, tokens, or secret-derived
  fields.

### Step 4: Engine

Choices:

- `Auto`.
- Engines supported by the selected worker or Jarvis catalog, for example
  Codex/Claude.

Behavior:

- Disable incompatible engine/worker combinations.
- If worker is `Auto`, show catalog-level engine choices.

### Step 5: Dispatch Summary

Show:

- objective
- source/repo/ticket
- worker policy
- engine policy
- branch policy
- expected artifact outputs

Primary action:

- `Start with Jarvis`

Result:

- If Jarvis returns a session, navigate to the canonical Jarvis session thread.
- If Jarvis returns a queued run without a session, navigate to the run detail
  or show queued state only if the API gives a stable run target.
- If Jarvis rejects the request, show the Jarvis validation message and keep the
  draft form editable.

## UI And Routing Plan

1. Rename primary labels.
   - Change `Add project` entry points to `Start work` in cockpit mode.
   - Keep command search aliases for "add project" for discoverability, but make
     the visible action `Start work`.

2. Replace the add-project source list in cockpit mode.
   - Replace `Local folder`, `Git URL`, and provider clone rows with the five
     Jarvis work-source choices above.
   - Move upstream add-project sources behind `Local T3 project` if enabled.

3. Add a start-work draft state.
   - Track objective/source/worker/engine/branch policy as wizard state.
   - Do not reuse local project draft state for Jarvis start wizard truth.

4. Add server-backed selector data.
   - Worker and engine options should come from Jarvis snapshot/catalog data.
   - Repository options should come from worker repository metadata or a new
     Jarvis repo registry endpoint.

5. Submit via existing Jarvis dispatch path.
   - Prefer a direct start-work client command if one is added.
   - If reusing draft `thread.turn.start`, keep bootstrap dispatch routed to
     Jarvis. If Jarvis returns `session_ref`, promote immediately; otherwise
     accept the write receipt and let polling reconcile the new run/session.

6. Land on the right surface.
   - Created session: navigate to session timeline.
   - Queued run: navigate to run detail/dashboard row when supported.
   - Missing contract: show explicit missing-spec UI, not local fallback.

7. Gate local-only controls.
   - Jarvis rows must not show local branch setup, local folder setup, project
     scripts, or local provider setup as part of onboarding.
   - Local controls can remain only for explicit non-Jarvis/local mode.

## API Contract Needs

Already available in cockpit contracts:

- `POST /v1/work/start`
- `POST /v1/work/resume`
- worker profiles and engine support from the cockpit snapshot/catalog
- `JarvisStartWorkInput`
- `JarvisResumeWorkInput`

Likely required or to confirm with Jarvis:

- Repository registry/list endpoint, unless `WorkerProfile.repositories` is the
  intended first-pass source of repository choices.
- GitHub issue/PR resolver endpoint that turns a reference into a run source.
- Linear ticket resolver endpoint that turns a reference into a run source.
- Queued-run response semantics for `/v1/work/start` when no session is created
  immediately.
- Catalog source capabilities so the UI knows whether GitHub, Linear, repository
  registry, resume, and manual start are enabled.

Missing-spec packet template:

```text
Cockpit needs <capability> to implement Start work source <source>.
Required endpoint or field:
- method/path:
- request:
- response:
- error states:
- idempotency semantics:
- whether Jarvis or worker owns validation:
```

## Implementation Steps

1. Cockpit-mode detection and vocabulary pass.
   - Add a single web helper for whether the environment is in Jarvis cockpit
     mode.
   - Use it to switch visible labels from `Add project` to `Start work`.
   - Keep local T3 labels unchanged outside cockpit mode.

2. Command palette start-work view.
   - Replace the add-project source rows with Jarvis start-work source rows when
     cockpit mode is active.
   - Add a guarded advanced path for `Local T3 project` only if local mode stays
     supported.

3. Start-work wizard state and screens.
   - Build the five-step wizard with defaults.
   - Use existing command palette/submenu mechanics where practical, but avoid a
     filesystem-source mental model.

4. Worker and engine selectors.
   - Read worker/engine options from Jarvis snapshot/catalog data.
   - Show health/capacity and disable invalid choices.

5. Source adapters.
   - Manual source can ship first.
   - Repository/GitHub/Linear rows should be enabled only when Jarvis exposes
     validation/resolution data.
   - Disabled rows should say what Jarvis API is missing.

6. Dispatch and navigation.
   - Submit manual start to Jarvis `/v1/work/start`.
   - Navigate to returned session timeline.
   - Add queued-run handling only once Jarvis returns a stable run target for
     queued work.

7. Empty states.
   - Replace `No projects yet` onboarding in cockpit mode with `No runs yet`.
   - Primary CTA: `Start work`.
   - Secondary CTA: `Check workers` when no healthy workers are available.

8. Legacy/local mode guardrails.
   - Ensure local folder, clone, branch, and worktree setup remain unreachable
     from normal cockpit onboarding.
   - Add tests proving Jarvis cockpit mode does not dispatch `project.create`.

## Acceptance Criteria

1. In Jarvis cockpit mode, the primary empty-state and command-palette CTA is
   `Start work`, not `Add project`.
2. In Jarvis cockpit mode, the default start flow does not show `Local folder`,
   `Git URL`, provider clone rows, local branch selection, or local worktree
   setup.
3. A user can choose `Describe work`, enter an objective/prompt, leave worker
   and engine as `Auto`, submit, and send a `JarvisStartWorkInput` to Jarvis.
4. The start payload includes `metadata.surface: jarvis-cockpit`,
   `branch_strategy: auto`, and an idempotency key.
5. If Jarvis returns a `session_ref`, the UI navigates to the canonical Jarvis
   session route and finalizes any temporary draft state.
6. If Jarvis accepts the start asynchronously without `session_ref`, the UI does
   not surface a dispatch failure; polling reconciles the created run/session.
7. If Jarvis rejects the start request, the UI displays the Jarvis error and
   keeps the wizard editable.
8. If Jarvis cannot support a selected source type, the UI displays a clear
   missing-contract state and does not fall back to local T3 project creation.
9. Worker selector options are sourced from Jarvis worker/capability data, not
   from T3 provider instances.
10. Engine selector options are constrained by Jarvis catalog/worker support.
11. Local T3 project creation remains available only through an explicit
    legacy/debug affordance, if supported at all.
11. Unit tests prove cockpit start-work does not dispatch `project.create`.
12. Browser smoke verifies a new user can reach a Jarvis run/session timeline
    without seeing local-folder onboarding.

## Verification Plan

Unit/component tests:

- Command palette builds Jarvis work-source rows in cockpit mode.
- Command palette keeps upstream local project rows outside cockpit mode.
- Start-work wizard serializes manual work into `JarvisStartWorkInput`.
- Invalid or unavailable source types render missing-contract UI.
- Worker/engine selector disables unsupported combinations.
- No cockpit-mode start path dispatches `project.create`.

Server tests:

- Start-work dispatch reaches `JarvisClient.startWork`.
- Jarvis start rejection returns a visible dispatch error.
- Queued run without session is handled according to the documented API
  response once that response is finalized.

Browser/dogfood:

- Start dev stack with Volta-pinned Node/pnpm.
- Pair a fresh browser session.
- Verify empty state says `No runs yet` or equivalent.
- Open `Start work`.
- Submit `Describe work` with `Auto` worker/engine against fixture or local
  Jarvis.
- Confirm navigation to Jarvis session timeline or queued-run target.
- Confirm local folder/clone UI is absent from default cockpit flow.

Quality gates:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/web typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --dir apps/web exec vitest run <changed web tests>
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --dir apps/server exec vitest run <changed server tests>
git diff --check
```

Avoid broad `vpcheck` unless specifically requested; previous runs are slow for
this fork.

## Risks And Mitigations

Risk: the UI hides local onboarding before Jarvis can start work reliably.

- Mitigation: ship `Describe work` first against `/v1/work/start`; keep
  unsupported sources visibly disabled with missing-contract detail.

Risk: the command palette still routes some aliases to upstream `project.create`.

- Mitigation: add tests around cockpit-mode command groups and dispatch payloads.

Risk: GitHub/Linear source rows imply support before Jarvis has resolvers.

- Mitigation: disable these rows unless catalog/source capability says they are
  available.

Risk: local/debug users still need upstream T3 project creation.

- Mitigation: keep `Local T3 project` behind a clearly labelled advanced/debug
  path, never as the primary cockpit onboarding path.

Risk: "project" remains embedded in route/model names.

- Mitigation: treat code-level T3 project names as internal compatibility
  plumbing; user-facing copy should say run/work/session.

## Suggested Slices

1. Copy-only pivot.
   - Rename visible cockpit-mode CTA and empty-state copy.
   - Add tests for visible labels and hidden local sources.

2. Manual start-work path.
   - Add `Describe work` wizard with `Auto` worker/engine.
   - Submit to Jarvis and navigate to returned session.

3. Worker/engine selection.
   - Wire catalog/worker data into selectors.
   - Add health/capacity indicators.

4. Source expansion.
   - Repository registry first if Jarvis can expose it.
   - GitHub/Linear after Jarvis source resolvers are available.

5. Legacy/local cleanup.
   - Decide whether local T3 project creation is debug-only or removed.
   - Remove remaining misleading local project copy from cockpit-mode surfaces.

## ADR

Decision: replace default upstream T3 project onboarding with a Jarvis-first
`Start work` onboarding flow in cockpit mode.

Drivers:

- Jarvis owns orchestration and execution authority.
- Users need to start engineering work, not configure local folders.
- Local project affordances cause confusion and can route users toward blocked
  or unsafe authority paths.

Alternatives considered:

- Keep upstream add-project flow and patch errors as they occur. Rejected
  because the default mental model remains wrong.
- Remove all local T3 support immediately. Deferred because the fork may still
  need local mode for debugging and comparison.
- Build a separate Jarvis dashboard outside T3 navigation. Rejected for now
  because Phase 7 intentionally maps Jarvis state into T3 shell/thread plumbing.

Why chosen:

- A `Start work` flow aligns user language with the Jarvis API and the authority
  model already enforced by `JarvisDispatch`.

Consequences:

- Some upstream T3 copy and command-palette assumptions must become
  cockpit-mode conditional.
- Source connectors become Jarvis capabilities, not local clone providers.
- Jarvis may need additional repository/source resolver APIs before all source
  rows can be enabled.

Follow-ups:

- Confirm whether `WorkerProfile.repositories` is enough for first-pass
  repository selection.
- Ask Jarvis for source capability metadata in `/v1/cockpit/catalog` if not
  already present.
- Replace `JARVIS_DEFAULT_REPO` with Jarvis-owned repo/default-repo projection
  data.
- Prefer returning `session_ref` from `/v1/work/start` whenever Jarvis creates a
  session synchronously.
