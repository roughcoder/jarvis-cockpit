# Jarvis Cockpit Phase 7 Progress

Last updated: 2026-06-30

## Goal

Adapt this T3 fork into the operator cockpit for Jarvis-managed engineering work.
Jarvis remains the orchestration source of truth. T3 renders and controls Jarvis
`OrchestrationRun`, `WorkerSession`, and `SessionEvent` resources instead of
spawning Codex or Claude directly for Jarvis-managed work.

## Implemented slice

- Added shared Jarvis contracts in `packages/contracts/src/jarvis.ts`.
- Added a server-side Jarvis client in `apps/server/src/jarvis/JarvisClient.ts`.
- Added projection mappers from Jarvis runs, sessions, and events into T3
  orchestration read models.
- Added fixture mode with `JARVIS_FIXTURE_MODE=true` for local UI and test work.
- Wired HTTP `/api/orchestration/snapshot` and WebSocket `subscribeShell` /
  `subscribeThread` read paths to Jarvis when cockpit reads are enabled.
- Added a web guard so Jarvis-managed thread ids do not trigger T3-local branch
  sync mutations.
- Added transport-level tests proving Jarvis fixture reads bypass native T3
  projection storage.

## Current schema alignment

The connector is aligned with
`/Users/neilbarton/Development/jarvis-worker-sessions/docs/WORKER_SESSIONS_API.md`
as of 2026-06-30:

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

The first slice still synthesizes a run snapshot from worker-local sessions when
only `/sessions` exists. A future Jarvis aggregate API should replace that
synthesis.

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

## Verification run

Latest successful targeted checks:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/contracts typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/contracts test -- jarvis
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 exec vitest run src/jarvis/JarvisClient.test.ts src/jarvis/JarvisProjectionMapper.test.ts src/jarvis/JarvisOrchestrationReadModel.test.ts src/cli/config.test.ts src/server.test.ts -t "jarvis|Jarvis|orchestration (shell snapshots|thread details|snapshots) from Jarvis fixtures"
```

Earlier successful broader checks before the final formatting pass:

```bash
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter @t3tools/web typecheck
volta run --node 24.13.1 --pnpm 10.24.0 pnpm --filter t3 build:bundle
```

Dogfood summary from the latest focused browser pass:

- Paired a fresh browser profile with the local dev server using a one-time token
  issued against the dev state namespace.
- Verified the dashboard renders the Jarvis fixture project and worker session.
- Opened the Jarvis-managed session detail route for
  `jarvis-session_sess_fixture_codex`.
- Verified the detail timeline renders `Work Log` and `Session created`.
- Checked browser errors after refresh; no current errors were reported after
  the authenticated session was established.

## Remaining Jarvis-side gaps

The worker-session API now covers live session reads, pending requests,
checkpoint restore, input, approval, interrupt, and stop. The remaining blocker
for a full cockpit is the aggregate orchestration layer:

- List runs across all workers.
- List worker registry and health across workers.
- Return artifacts/evidence/branch/PR metadata for runs.
- Start work from a high-level `WorkCommand` into an `OrchestrationRun` plus one
  or more `WorkerSession` records.
- Resume an `OrchestrationRun` or session with documented semantics.
- Provide polling cursor, SSE, or WebSocket updates for aggregate changes.

Until those exist, this fork should keep using worker-session fixture or
worker-local compatibility reads and should not invent a durable project model.
