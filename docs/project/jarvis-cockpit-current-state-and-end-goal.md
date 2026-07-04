# Jarvis Cockpit Current State And End Goal

Last updated: 2026-07-04

## Purpose

`jarvis-cockpit` is the T3 Code fork that acts as the operator UI for
Jarvis-managed engineering work.

The core boundary is unchanged:

- Jarvis owns orchestration, workers, authority, provider sessions, branches,
  artifacts, approvals, checkpoints, and durable run/session state.
- The cockpit renders Jarvis projections and sends operator intents.
- The cockpit must not become a second scheduler, worker registry, project
  database, or provider-session owner for Jarvis-managed work.

## Current Live State

The current branch can run against a real Jarvis fleet API and start work through
Jarvis into a Codex worker session.

Verified live on 2026-07-04:

- Cockpit server connected to a real fleet API through `JARVIS_API_BASE_URL`.
- Fleet API projected a healthy `macbook-worker` with Codex and Claude engines.
- The cockpit displayed a stable `Start Jarvis work` anchor even before any
  active run existed.
- `Start work -> Describe work` created a draft thread in the cockpit.
- First composer send routed to Jarvis `/v1/work/start`, not native T3 provider
  orchestration.
- Jarvis created a real run and Codex session on the laptop worker.
- The session completed and rendered in the T3 UI with the provider output.

Verified run/session:

- Run: `run_1783161652_4f57bcca`
- Session: `sessref_b4NDM8c61wuB4Uir`
- Output included `JARVIS_COCKPIT_DOGFOOD`.

Evidence is recorded in the ignored dogfood folder:

- `dogfood-output/jarvis-cockpit-fleet-2026-07-04/report.md`
- `dogfood-output/jarvis-cockpit-fleet-2026-07-04/screenshots/live-fleet-final-session-detail.png`

## Implemented Capabilities

### Jarvis Connector

- `JARVIS_COCKPIT_ENABLED=true` switches reads/writes into Jarvis cockpit mode.
- `JARVIS_API_BASE_URL` points the T3 server at the Jarvis cockpit API.
- `JARVIS_API_TOKEN` is supported for bearer auth when configured.
- `JARVIS_FIXTURE_MODE=true` provides deterministic fixture data for local UI
  work without a real Jarvis API.
- `JARVIS_DEFAULT_REPO` is a temporary cockpit-side bridge for manual start-work
  flows until Jarvis exposes a repo registry/default repo projection.

### Read Projection

The server maps Jarvis cockpit projections into T3's existing environment,
project, thread, message, activity, checkpoint, and session read models.

Current mapped Jarvis objects:

- `OrchestrationRun` -> T3 project shell/detail compatibility row.
- `WorkerSession` -> T3 thread shell/detail compatibility row.
- `SessionEvent[]` -> T3 work-log activities and assistant/user messages.
- Jarvis artifacts -> branch/report/evidence presentation data where available.
- Worker registry/health -> cockpit capability and start-work availability.

### Start Work

The primary cockpit onboarding action is `Start work`, not upstream T3
`Add project`.

Current start path:

1. User selects `Start work`.
2. User selects `Describe work`.
3. Cockpit opens a draft thread anchored to the synthetic `Start Jarvis work`
   project.
4. First send becomes `thread.turn.start` with bootstrap metadata.
5. `JarvisDispatch` routes that command to `POST /v1/work/start`.
6. If Jarvis returns a session immediately, the draft can be promoted to the
   Jarvis session thread.
7. If Jarvis accepts the start asynchronously, cockpit returns a successful
   dispatch receipt and polling reconciles the new run/session.

The synthetic `Start Jarvis work` anchor remains visible whenever Jarvis reports
workers, including when old runs are terminal.

### Live Contract Compatibility

The cockpit accepts the live v1 projection values currently emitted by Jarvis,
including:

- `run.status: "active"`
- terminal runs with empty public `repo` and `branch` strings
- branch artifacts with empty `summary`, `url`, and `commit_sha`
- session events with empty `turn_id` or `message_id` where those correlation
  ids do not apply
- unknown future event types with valid envelopes

## How To Run

Fixture mode:

```bash
JARVIS_FIXTURE_MODE=true volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
```

Real fleet mode:

```bash
JARVIS_COCKPIT_ENABLED=true \
JARVIS_API_BASE_URL=http://127.0.0.1:8791 \
JARVIS_DEFAULT_REPO=roughcoder/jarvis-cockpit \
volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
```

`JARVIS_DEFAULT_REPO` is only for the current manual start-work bridge. Remove it
when Jarvis provides repo/default-repo data in its cockpit projections.

## Current Known Gaps

### Jarvis API Gaps

These are not cockpit authority gaps; they are places where Cockpit currently
has to use temporary bridging or polling.

- Jarvis should expose a repo registry/default repo projection so cockpit does
  not need `JARVIS_DEFAULT_REPO`.
- `/v1/work/start` should return `session_ref` when it creates a session
  synchronously.
- Jarvis should document live projection values that now exist in practice:
  `active` run status, empty public strings, empty event correlation ids, and
  provider-specific event aliases.
- `/v1/work/start` would benefit from a dry-run/validation mode for wizard
  preflight.
- `/v1/cockpit/catalog` should eventually include start-work defaults and
  required fields for the current operator context.

### Cockpit Product Gaps

- Start-work is still a minimal `Describe work` path, not the full wizard.
- Worker, engine, source, repository, branch policy, and landing policy selectors
  are not complete.
- Approval/input/interrupt/stop/resume controls need full UI treatment on top of
  the existing Jarvis write paths.
- Artifact surfaces are basic; reports, verification evidence, branches, PRs,
  and status comments need richer run-level presentation.
- SSE/WebSocket live updates should replace polling once Jarvis event streaming
  is stable enough for the cockpit.

## End Goal

The end goal is a Jarvis-owned engineering cockpit:

- A dashboard shows all active, waiting, completed, failed, and archived Jarvis
  runs across the fleet.
- A run detail view shows objectives, phase, status, child sessions, artifacts,
  branches, PRs, verification evidence, reports, and terminal reasons.
- A session detail view shows the canonical event timeline, assistant messages,
  tool calls/results, approvals, input requests, checkpoints, interrupts, stops,
  and provider status.
- Start-work lets the operator choose or validate work source, repo, worker,
  engine, branch policy, verification expectation, and landing policy through
  Jarvis-owned catalog data.
- Resume/turn/input/approval/interrupt/stop/checkpoint restore commands all go
  to Jarvis.
- The cockpit never spawns Codex or Claude directly for Jarvis-managed work.
- The cockpit never invents durable run/session/project truth beyond projection
  compatibility needed to render the existing T3 UI.

