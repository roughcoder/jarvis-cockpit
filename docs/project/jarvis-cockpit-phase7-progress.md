# Jarvis Cockpit Phase 7 Progress

Last updated: 2026-07-04

## Goal

Adapt this T3 fork into the operator cockpit for Jarvis-managed engineering work.
Jarvis remains the orchestration source of truth. T3 renders and controls Jarvis
`OrchestrationRun`, `WorkerSession`, and `SessionEvent` resources instead of
spawning Codex or Claude directly for Jarvis-managed work.

## Plan And Spec Sources

- [Project docs index](./README.md)
- [Current state and end goal](./jarvis-cockpit-current-state-and-end-goal.md)
- [Phase 7 plan](./jarvis-cockpit-phase7-plan.md)
- [Phase 7 PRD](./jarvis-cockpit-phase7-prd.md)
- [Phase 7 test spec](./jarvis-cockpit-phase7-test-spec.md)
- [Deep-interview spec](./jarvis-cockpit-phase7-deep-interview-spec.md)
- [Worker-session pivot](./agentic-worker-session-pivot.md)
- [Worker sessions API reference](../reference/jarvis-worker-sessions-api.md)

## Implemented foundation slice

- Added shared Jarvis contracts in `packages/contracts/src/jarvis.ts`.
- Added a server-side Jarvis client in `apps/server/src/jarvis/JarvisClient.ts`.
- Added projection mappers from Jarvis runs, sessions, and events into T3
  orchestration read models.
- Added fixture mode with `JARVIS_FIXTURE_MODE=true` for local UI and test work.
- Added real API mode with `JARVIS_API_BASE_URL`; cockpit mode is now the fork
  default and can be disabled with `JARVIS_COCKPIT_ENABLED=false`.
- Wired HTTP `/api/orchestration/snapshot` and WebSocket `subscribeShell` /
  `subscribeThread` read paths to Jarvis when cockpit reads are enabled.
- Added a web guard so Jarvis-managed thread ids do not trigger T3-local branch
  sync mutations.
- Added transport-level tests proving Jarvis fixture reads bypass native T3
  projection storage.

## Onboarding pivot slice (2026-07-04)

Implements slice 1 and the manual `Describe work` entry of
[the onboarding pivot plan](./jarvis-cockpit-onboarding-pivot-plan.md):

- Added a `jarvisCockpit` capability to `ExecutionEnvironmentCapabilities`
  (`packages/contracts/src/environment.ts`), populated by the server from
  `shouldUseJarvisCockpitReads` (`apps/server/src/environment/ServerEnvironment.ts`),
  so clients detect cockpit mode per environment.
- Added web cockpit-mode helpers in `apps/web/src/jarvisCockpit.ts`.
- Command palette (`apps/web/src/components/CommandPalette.tsx`): in cockpit
  mode the root CTA is `Start work` (keeps "add project" search aliases) and
  opens the Jarvis work-source view built from
  `apps/web/src/components/startWork.logic.ts`:
  - `Describe work`: creates a draft thread anchored to the synthetic
    `Start Jarvis work` project; the first composer send promotes it through
    `thread.turn.start` bootstrap, which `JarvisDispatch` routes to
    `POST /v1/work/start`.
  - `Continue run` (enabled when a Jarvis session thread exists): reopens the
    latest Jarvis session timeline.
  - `GitHub issue or PR`, `Linear ticket`, `Register repository`: visible but
    disabled, naming the missing Jarvis source-resolver/repo-registry contract.
  - Local folder, Git URL, provider clone rows, the WSL folder row, and
    root filesystem-path browsing are unreachable in cockpit mode.
- Sidebar: add button/tooltip says `Start work`, empty state says `No runs
yet` in cockpit mode. `NoActiveThreadState` uses session language.
- The synthetic `Start Jarvis work` project remains visible whenever Jarvis
  reports workers, including zero-run and historical terminal-run states.
- Tests: `apps/web/src/components/startWork.logic.test.ts` (source rows,
  no local/clone/worktree affordances), `apps/web/src/jarvisCockpit.test.ts`,
  and a `ServerEnvironment` test proving the capability follows
  `JARVIS_COCKPIT_ENABLED`/`JARVIS_FIXTURE_MODE`.

Follow-ups for the next slice:

- Worker/engine selectors are not built; manual start uses `Auto`-style defaults
  through `JarvisDispatch` (`branch_strategy: auto`, engine from model
  selection when set).
- Repository defaults now come from Jarvis catalog/worker projections rather
  than a cockpit-side env bridge. Full visible repository selectors are still a
  follow-up.
- Source-specific starts for GitHub and Linear are enabled or disabled from
  Jarvis catalog source metadata.

## Current schema alignment

The connector is aligned with the current Jarvis cockpit API shape used in live
testing plus the tracked worker-session reference:

- `GET /v1/cockpit/catalog`
- `GET /v1/cockpit/snapshot?sync=none|fast|probe`
- `GET /v1/cockpit/events?after=`
- `GET /v1/runs`
- `GET /v1/runs/:run_id`
- `GET /v1/runs/:run_id/events`
- `GET /v1/runs/:run_id/artifacts`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/events?after=&limit=`
- `GET /sessions/requests`
- `GET /sessions/:id/requests`
- `GET /sessions/:id/checkpoints`
- `POST /sessions`
- `POST /sessions/:id/turns`
- `POST /sessions/:id/input`
- `POST /sessions/:id/approval`
- `POST /sessions/:id/checkpoints/restore`
- `POST /sessions/:id/interrupt`
- `POST /sessions/:id/stop`
- `POST /v1/work/validate`
- `POST /v1/work/start`
- `POST /v1/work/resume`

The contract accepts live public-safe projection values currently emitted by
Jarvis, including `run.status: "active"`, empty public artifact strings, empty
event correlation ids on non-message events, catalog `start_options`, worker
repositories with `is_default`/`can_start_work`, and aggregate snapshot
`requests`/`checkpoints`.

## How to run locally

Use Volta-pinned commands:

```bash
JARVIS_FIXTURE_MODE=true volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
```

Open `http://localhost:5733/`, pair with the local environment, and select the
fixture worker session. The detail route should look like:

```text
/5a90644a-790f-4245-82d7-e0018830cd9e/jarvis-session_sess_fixture_codex
```

Real fleet mode:

```bash
JARVIS_API_BASE_URL=http://127.0.0.1:8791 \
volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
```

Jarvis cockpit mode is the default in this fork. Use
`JARVIS_COCKPIT_ENABLED=false` only when intentionally testing legacy upstream
T3 local orchestration behavior.

## Verification run

Latest successful checks:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --dir apps/server exec vitest run src/jarvis/JarvisProjectionMapper.test.ts src/jarvis/JarvisClient.test.ts src/jarvis/JarvisDispatch.test.ts src/cli/config.test.ts src/environment/ServerEnvironment.test.ts src/bin.test.ts
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/contracts test -- src/jarvis.test.ts
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/web typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/contracts typecheck
git diff --check
```

Dogfood summary from the latest real-fleet browser pass:

- Ran cockpit against a real Jarvis fleet API via `JARVIS_API_BASE_URL`.
- Verified `macbook-worker` projected as healthy with Codex and Claude engines.
- Started a real `Describe work` request from the cockpit UI.
- Jarvis created run `run_1783161652_4f57bcca` and session
  `sessref_b4NDM8c61wuB4Uir`.
- The laptop Codex worker completed the smoke command and emitted
  `JARVIS_COCKPIT_DOGFOOD`.
- Re-paired a clean browser session and verified the completed Jarvis session
  rendered in the T3 detail view with `Work Log`, `Session created`, and the
  assistant output.

Dogfood evidence is ignored by git and stored locally under:

```text
dogfood-output/jarvis-cockpit-fleet-2026-07-04/
```

## Remaining Jarvis-side gaps

The incoming live API is enough for a minimal start-work loop plus validation.
Remaining implementation work is mostly cockpit-side:

- Render the full start-work wizard from catalog defaults and worker
  repositories.
- Proxy `/v1/cockpit/events` through the server-side auth boundary; this branch
  keeps polling snapshots as the fallback live-update path.
- Add richer request/checkpoint/artifact controls using aggregate snapshot data.
- Fully document provider event aliases as they are adopted by the UI.

Until these exist, the fork should continue to treat Jarvis as authoritative and
avoid inventing durable project, repository, worker, or session truth in the UI.
