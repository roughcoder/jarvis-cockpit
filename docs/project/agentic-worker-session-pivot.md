# Agentic Worker Session Pivot Plan

Date: 2026-06-30

## Requirements Summary

Jarvis should pivot agentic execution from one-shot coding subprocesses to live, durable provider sessions while keeping Jarvis as the orchestration source of truth.

The current PR foundation defines the right boundary:

- `docs/WORKER_SESSIONS_API.md:3` defines worker sessions as the live-agent execution contract.
- `docs/WORKER_SESSIONS_API.md:9` states that a T3-style UI must read Jarvis state, not own a parallel work graph.
- `docs/AGENTIC.md:38` documents the intended flow as `WorkSource -> WorkCommand -> OrchestrationRun -> ExecutionEnvelope -> WorkerSession(s)`.
- `src/jarvis/orchestration/models.py:101` adds `WorkerSessionLink` to the run graph.
- `src/jarvis/orchestration/models.py:207` stores `sessions` beside existing `jobs` during migration.
- `src/jarvis/worker/server.py:370` exposes `POST /sessions`.
- `src/jarvis/worker/server.py:403` starts a session turn, but currently emits `turn.waiting_provider` rather than running a provider.
- `src/jarvis/tools/worker.py:80` still routes brain coding work through `/run`; that should become a migration target, not a compatibility promise.

The remaining work is to make `/sessions` real: provider adapters, structured event ingestion, approval/input control, orchestration dispatch, resume/interrupt semantics, and operator surfaces.

## Acceptance Criteria

- A run started from GitHub, Linear, voice, WhatsApp, or CLI creates an `OrchestrationRun` and one or more linked `WorkerSession`s, not just a `WorkerJob`.
- A Codex session can start, stream events, request approvals/input, be interrupted, be resumed, and preserve its provider thread/checkpoint metadata.
- A Claude session can do the same through the Claude Agent SDK or a sidecar, without using `claude -p` as the primary long-running architecture.
- `ExecutionEnvelope` policy is enforced outside prompt text before provider actions, approvals, public writes, comments, and landing.
- Session events are canonical enough for CLI, voice, WhatsApp, and a T3 fork to render the same run timeline.
- T3 fork integration uses Jarvis run/session/artifact APIs and never becomes the orchestration source of truth.
- New coding orchestration moves to `/sessions`. No new agentic coding path may dispatch through `/run` or `WorkerJob`; any remaining `/run` use must be non-agentic shell, scratch, or explicit debug plumbing outside WorkCommand/ExecutionEnvelope coding flows.
- Durable state survives daemon restart and machine reboot for runs, sessions, events, provider resume handles, branches, and artifacts.

## Implementation Steps

### 1. Finish and merge session API foundation

Scope:

- Land PR #47 as the baseline contract.
- Keep the current behavior honest: `turn.waiting_provider` means no provider adapter is attached yet.
- Preserve the docs/API contract for the T3 fork to start against.

Files:

- `docs/WORKER_SESSIONS_API.md`
- `docs/AGENTIC.md`
- `src/jarvis/worker/server.py`
- `src/jarvis/worker/sessions.py`
- `src/jarvis/orchestration/models.py`
- `src/jarvis/orchestration/store.py`

Checks:

- Unit tests for worker session CRUD/events pass.
- PR review has no unresolved blockers.
- No release until merged and requested.

### 2. Harden the session contract before provider work

Scope:

- Add machine-readable API/schema coverage for `WorkerSession`, `SessionEvent`, turn requests, input, approval, interrupt, and stop.
- Add event cursor support: `after`, `limit`, stable ordering, and `last_event_id`.
- Add idempotency for turn/input/approval requests so retries do not duplicate turns or decisions.
- Add explicit session capabilities: create, read, turn, input, approve, interrupt, stop.
- Ensure event payloads never expose private worker paths or secrets to public/reporting surfaces by default.

Files:

- `docs/WORKER_SESSIONS_API.md`
- `src/jarvis/worker/sessions.py`
- `src/jarvis/worker/server.py`
- `src/jarvis/tools/worker.py`
- `src/jarvis/capabilities.py` or the existing capability registry

Checks:

- API schema tests reject malformed records.
- Event pagination tests prove no missed or duplicated event when polling.
- Capability tests prove read-only principals cannot start turns or approve actions.

### 3. Add a provider adapter abstraction

Scope:

- Introduce a `ProviderAdapter` boundary owned by the worker daemon.
- Define lifecycle methods: create/resume session, start turn, receive input, resolve approval, interrupt, stop, read checkpoints.
- Define adapter capabilities: streaming, resume, interrupt, approval callbacks, checkpoint/rollback, model selection.
- Define provider process lifecycle, backpressure behavior, operation timeouts, crash recovery, terminal states, and event ordering before Codex/Claude adapters land.
- Add a fake provider adapter for deterministic tests before Codex/Claude.

Files:

- New `src/jarvis/worker/providers/`
- `src/jarvis/worker/server.py`
- `src/jarvis/worker/sessions.py`
- `tests/unit/test_worker_daemon.py`

Checks:

- Fake provider can emit `assistant.delta`, `assistant.message`, `approval.requested`, `input.requested`, `turn.completed`, and `turn.failed`.
- Interrupt and stop change session status and cancel an active fake provider turn.
- Daemon restart can reload session metadata and events.
- Provider lifecycle tests prove ordered event append, bounded queue/backpressure behavior, timeout handling, crash-to-`turn.failed` mapping, and terminal-state reconciliation.

### 4. Implement Codex live sessions

Scope:

- Wrap `codex app-server` as the Codex provider runtime.
- Manage app-server process lifecycle per worker, not per CLI job.
- Map JSON-RPC operations into Jarvis turns, input, approval, interrupt, resume, checkpoints, and events.
- Store Codex thread IDs, session names, provider checkpoint IDs, and resume metadata locally.
- Preserve current Codex CLI one-shot jobs only as an internal debug fallback while the Codex session adapter is being built.

Files:

- New `src/jarvis/worker/providers/codex.py`
- `src/jarvis/worker/server.py`
- `src/jarvis/engines.py`
- `src/jarvis/worker/sessions.py`
- `docs/WORKER_SESSIONS_API.md`

Checks:

- Skippable integration test starts a Codex session when `codex app-server` is available.
- Unit tests mock JSON-RPC and verify canonical event mapping.
- Interrupt test proves a live turn can be stopped without deleting session state.
- Resume test proves a later turn uses the same Codex thread/session metadata.

### 5. Implement Claude live sessions

Scope:

- Use `@anthropic-ai/claude-agent-sdk` through a small TypeScript sidecar or equivalent provider bridge.
- Python worker talks to the sidecar over stdio or localhost HTTP/WebSocket.
- Map Claude stream events, permission callbacks, questions, model/session metadata, interruption, and resume into Jarvis session events.
- Use local Claude auth; Jarvis must not store Claude credentials.

Files:

- New sidecar package or `src/jarvis/worker/providers/claude.py`
- New TypeScript sidecar entry if needed
- `src/jarvis/worker/server.py`
- `docs/WORKER_SESSIONS_API.md`
- Packaging/release files for sidecar install

Checks:

- Mocked sidecar tests cover stream, permission request, question, completion, error, interrupt, and resume.
- Local live smoke test can start a Claude session after `claude auth login` / `claude setup-token`.
- Provider failures become `turn.failed` events with public-safe messages.

### 6. Move orchestration dispatch from jobs to sessions

Scope:

- Convert `ExecutionEnvelope` into `POST /sessions` plus `POST /sessions/:id/turns`.
- Link the created session back to `OrchestrationRun.sessions`.
- Move new agentic coding work to `WorkerSession`; keep `WorkerJob` only as a temporary internal primitive while the migration is incomplete, and verify `work next --start`, `resume run`, schedules, and campaigns do not call the old coding job path.
- Make `resume run` send a new turn to the existing linked session when provider metadata is valid.
- Sync worker session state/events back into the run graph and run phase.

Files:

- `src/jarvis/orchestration/envelope.py`
- `src/jarvis/orchestration/store.py`
- `src/jarvis/cli.py`
- `src/jarvis/tools/worker.py`
- `src/jarvis/orchestration/models.py`

Checks:

- CLI `work next --start` creates a run and linked worker session.
- CLI `resume run` appends a turn to the existing session instead of spawning an unrelated job.
- Run phase changes to `needs_human` on `approval.requested` or `input.requested`.
- Run phase changes to `verifying`, `landing`, `done`, or `failed` from provider/session events.

### 7. Route approvals and input across all control surfaces

Scope:

- Treat `approval.requested` and `input.requested` as first-class events.
- CLI can list pending prompts and answer them.
- Voice and WhatsApp can notify asynchronously and send replies back to `/input` or `/approval`.
- Authority and landing policy are checked before approval is accepted.
- Public writes remain draft/confirm by default.

Files:

- `src/jarvis/cli.py`
- `src/jarvis/connectors/whatsapp.py`
- `src/jarvis/brain/background.py`
- `src/jarvis/orchestration/authority.py`
- `src/jarvis/worker/server.py`

Checks:

- CLI approval flow can approve/deny a fake provider shell request.
- Voice/WhatsApp notification test proves pending input can be reported without blocking the hot path.
- Policy tests prove denied approvals do not reach provider execution.

### 8. Add session observability and operator CLI

Scope:

- Add `jarvis sessions` commands for list/show/events/turn/input/approval/interrupt/stop.
- Add run/session sync commands.
- Add event tailing with cursor support.
- Show provider, worker, run, repo, branch, status, pending approvals/input, and last event without private connection details.

Files:

- `src/jarvis/cli.py`
- `src/jarvis/worker/server.py`
- `src/jarvis/orchestration/store.py`
- `docs/WORKER_SESSIONS_API.md`

Checks:

- CLI smoke tests cover list/show/events/interrupt/stop.
- JSON output is stable enough for T3 fork development.
- Private worker host/path details are hidden unless explicitly local/debug.

### 9. Build T3 fork against Jarvis APIs

Scope:

- Use Jarvis as the source of truth: runs, sessions, events, artifacts, worker state.
- Render run list, session timeline, provider messages/tool events, pending approvals/input, branches, PRs, and verification evidence.
- Control sessions through Jarvis endpoints only: turns, input, approval, interrupt, stop.
- Avoid importing T3's Project/Thread/Turn model as Jarvis truth; map it as UI state only.

Files:

- T3 fork repository
- Jarvis docs/API schema
- Potential Jarvis gateway endpoints if the UI should not talk to workers directly

Checks:

- UI can connect to a local Jarvis worker, show fake provider events, and submit input/approval.
- UI can show a real Codex session once Codex adapter lands.
- UI never creates a Jarvis-independent task graph.

### 10. Add checkpoints, rollback, and recovery

Scope:

- Store provider checkpoint IDs as session events and/or artifacts.
- Add rollback/restore endpoint only after the provider adapter can prove support.
- Reconcile active sessions after daemon restart.
- Clarify terminal semantics for stopped, interrupted, failed, completed, and needs-human states.

Files:

- `src/jarvis/worker/sessions.py`
- `src/jarvis/worker/providers/`
- `src/jarvis/orchestration/store.py`
- `docs/WORKER_SESSIONS_API.md`

Checks:

- Restart test reloads session and can continue polling events.
- Checkpoint restore test uses fake provider before real Codex/Claude support.
- Terminal state tests prevent completed sessions from accepting accidental new turns unless explicitly resumed/forked.

### 11. Reintroduce campaign and multi-session modes on top

Scope:

- Campaign parent run creates bounded child runs and sessions.
- Multi-provider mode can run Codex and Claude in parallel on the same work item when requested.
- Later synthesis can compare outputs, request review, or select a landing path.
- Respect max items, max duration, max concurrency, and stop conditions.

Files:

- `src/jarvis/orchestration/campaigns.py`
- `src/jarvis/orchestration/schedules.py`
- `src/jarvis/orchestration/store.py`
- `src/jarvis/cli.py`

Checks:

- Fake campaign creates bounded child session runs and stops on queue empty.
- Multi-provider run links multiple sessions to one parent run.
- Stop conditions are deterministic and visible in run events.

## Risks and Mitigations

- Provider APIs may differ sharply. Mitigation: keep `ProviderAdapter` narrow and canonicalize only events Jarvis needs.
- T3's internal model could pull ownership away from Jarvis. Mitigation: make Jarvis run/session/artifact APIs the only write path for orchestration state.
- Approval prompts can become advisory if passed only in prompts. Mitigation: enforce `ExecutionEnvelope` and authority checks in Jarvis/worker code before provider actions.
- Event logs can leak sensitive data. Mitigation: classify event fields and redact public/reporting views.
- Live providers can hang. Mitigation: heartbeat, timeout, interrupt, stop, restart recovery, and terminal-state reconciliation.
- Codex and Claude auth are local-machine concerns. Mitigation: use local provider auth and never persist raw provider credentials in Jarvis state.

## Verification Plan

- Unit: schemas, event append/read, cursor pagination, idempotency, provider fake adapter, capability/authority gates.
- Integration: worker daemon session lifecycle, Codex app-server when installed, Claude sidecar with mocked SDK and optional local smoke.
- CLI smoke: `jarvis sessions`, `jarvis work next --start`, `jarvis runs --sync`, resume/input/approval/interrupt/stop.
- Orchestration: run graph links work item, session, branch, provider metadata, artifacts, and phase transitions.
- Surface: voice/WhatsApp pending approval/input notifications remain off the hot path.
- UI: T3 fork can render fake and real session event timelines using Jarvis APIs only.
- Regression gates: `uv run ruff check src/ tests/ scripts/generate_release_notes.py` and focused then full unit tests.

## Suggested PR Sequence

1. Session contract hardening: schemas, cursors, idempotency, capabilities.
2. Provider adapter abstraction with fake provider and tests.
3. Codex app-server adapter.
4. Claude SDK sidecar adapter.
5. Orchestration dispatch: `ExecutionEnvelope -> WorkerSession`.
6. CLI/session observability and run sync.
7. Approval/input routing across CLI, voice, WhatsApp.
8. T3 fork integration against fake provider, then Codex.
9. Checkpoints/recovery.
10. Campaign and multi-provider modes.

## Fork API Starting Point

The T3 fork can start now against:

- `POST /sessions`
- `GET /sessions`
- `GET /sessions/:id`
- `GET /sessions/:id/events`
- `POST /sessions/:id/turns`
- `POST /sessions/:id/input`
- `POST /sessions/:id/approval`
- `POST /sessions/:id/interrupt`
- `POST /sessions/:id/stop`

For the first UI slice, use a fake/provider-waiting session and render `SessionEvent[]`. Do not build provider-specific assumptions into the UI; provider-specific payloads belong under `data.provider_payload`.

## Stop Conditions

- Stop the pivot if session APIs begin duplicating Jarvis run graph ownership.
- Stop a provider adapter PR if policy enforcement only exists in prompt text.
- Stop a T3 integration PR if it stores independent work truth instead of mapping Jarvis runs/sessions.
- Stop campaign work until single-item sessions are reliable for Codex and Claude.
