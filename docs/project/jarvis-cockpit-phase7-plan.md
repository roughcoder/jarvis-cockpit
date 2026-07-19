# Phase 7 Plan: T3 Fork As Jarvis Agentic Cockpit

Date: 2026-06-30

Status: planned

Scope: adapt a T3 Code fork into the operator UI for Jarvis-managed engineering work. This phase covers the T3 fork only, with typed mocks allowed until the Jarvis aggregate runs/sessions API is available. Jarvis remains the source of truth.

## Requirements Summary

Build the T3 fork as an agentic cockpit over Jarvis, not as a separate orchestrator.

- "Projects" in the T3 fork map to Jarvis `OrchestrationRun`.
- "Threads" or "sessions" map to Jarvis `WorkerSession`.
- "Messages", timeline rows, work entries, input prompts, approvals, and status changes map to Jarvis `SessionEvent`.
- Worker/provider selectors come from Jarvis worker registry and worker health, not from T3 provider instances for Jarvis-managed work.
- Branches, PRs, reports, and verification evidence come from Jarvis artifacts.
- T3 sends turns, input responses, approvals, interrupt, stop, and resume commands to Jarvis.
- T3 must not spawn Codex or Claude directly for Jarvis-managed work.
- T3 must not persist a second canonical project graph for Jarvis work.
- T3 must not make final authority decisions in UI-only code; it can request/relay approval decisions, but Jarvis validates them.

## Source Evidence

Jarvis contract evidence:

- Jarvis `docs/WORKER_SESSIONS_API.md` says `/run` is one-shot compatibility and `/sessions` owns long-lived provider sessions plus structured events: [docs/WORKER_SESSIONS_API.md#L3-L7](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/docs/WORKER_SESSIONS_API.md#L3-L7).
- Jarvis explicitly remains the orchestration source of truth and T3 must not create a separate work graph: [docs/WORKER_SESSIONS_API.md#L9-L15](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/docs/WORKER_SESSIONS_API.md#L9-L15).
- Jarvis exposes worker session endpoints for create/list/get/events/turns/input/approval/interrupt/stop: [src/jarvis/worker/server.py#L370-L484](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/worker/server.py#L370-L484).
- Jarvis currently records `turn.started` and `turn.waiting_provider` when provider adapters are not attached: [src/jarvis/worker/server.py#L403-L433](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/worker/server.py#L403-L433).
- Jarvis session/event persistence already exists through `WorkerSession`, `SessionEvent`, and append-only JSONL events: [src/jarvis/worker/sessions.py#L11-L70](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/worker/sessions.py#L11-L70), [src/jarvis/worker/sessions.py#L73-L164](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/worker/sessions.py#L73-L164).
- Jarvis CLI currently has run/worker inspection commands, but they are CLI surfaces rather than an HTTP cockpit API: [src/jarvis/cli.py#L2089-L2101](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/cli.py#L2089-L2101).
- Jarvis worker sync is still job-oriented, so the T3 plan must depend on or mock the aggregate sessions API until Phase 5 lands: [src/jarvis/orchestration/supervisor.py#L38-L99](https://github.com/roughcoder/jarvis/blob/144da22f3e63caf802d215b5a2b085e270e59f02/src/jarvis/orchestration/supervisor.py#L38-L99).

T3 structure evidence:

- T3 already has a provider adapter contract covering start session, send turn, interrupt, approval response, user-input response, stop, list, read, rollback, and event streaming: [ProviderAdapter.ts#L45-L126](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/src/provider/Services/ProviderAdapter.ts#L45-L126).
- T3 has typed orchestration projects, sessions, thread shells, thread details, shell streams, and command schemas: [orchestration.ts#L211-L281](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/contracts/src/orchestration.ts#L211-L281), [orchestration.ts#L344-L419](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/contracts/src/orchestration.ts#L344-L419).
- T3 client commands already cover turn start, interrupt, approval response, user-input response, checkpoint revert, and session stop: [orchestration.ts#L579-L658](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/contracts/src/orchestration.ts#L579-L658), [operations/commands.ts#L189-L256](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/client-runtime/src/operations/commands.ts#L189-L256).
- T3 web state already subscribes to shell snapshots and thread streams: [state/shell.ts#L48-L178](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/client-runtime/src/state/shell.ts#L48-L178), [state/threads.ts#L51-L220](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/client-runtime/src/state/threads.ts#L51-L220).
- T3 web derives thread lists from shell snapshots across environments: [threadShell.ts#L32-L185](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/packages/client-runtime/src/state/threadShell.ts#L32-L185).
- T3 server orchestration is event/projection based: `OrchestrationEngine` owns command dispatch and event streams, while `ProjectionSnapshotQuery` owns read-model snapshots: [OrchestrationEngine.ts#L24-L54](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/src/orchestration/Services/OrchestrationEngine.ts#L24-L54), [ProjectionSnapshotQuery.ts#L56-L160](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/src/orchestration/Services/ProjectionSnapshotQuery.ts#L56-L160).
- T3's provider reactor currently routes turn start, interrupt, approval, user-input, and stop through `ProviderService`: [ProviderCommandReactor.ts#L352-L512](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts#L352-L512), [ProviderCommandReactor.ts#L863-L1003](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts#L863-L1003).
- T3 already has pending approval/user-input UI surfaces and timeline rendering that can be reused once Jarvis events are projected into T3 shapes: [ComposerPendingApprovalPanel.tsx#L1-L31](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx#L1-L31), [ComposerPendingUserInputPanel.tsx#L1-L43](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx#L1-L43), [MessagesTimeline.tsx#L155-L215](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/web/src/components/chat/MessagesTimeline.tsx#L155-L215).
- T3 package scripts for validation are `typecheck`, `test`, and `lint`: [package.json](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/package.json), [apps/server/package.json](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/server/package.json), [apps/web/package.json](https://github.com/pingdotgg/t3code/blob/0615fd7df1ec04303dd13e86d9276aac3057096a/apps/web/package.json).

## Architectural Decision

Use T3's existing orchestration shell/thread projection as the UI projection layer, but replace provider ownership for Jarvis-managed work with a Jarvis client/bridge.

Decision:

- Add a Jarvis connector on the T3 server.
- Map Jarvis runs/sessions/events into T3's existing project/thread/session/timeline view models.
- Route T3 client commands to Jarvis endpoints for Jarvis-backed threads.
- Keep T3's native providers available only for non-Jarvis/local-T3 mode or explicit non-Jarvis work.

Rejected approach:

- Do not add a separate "Jarvis dashboard store" beside T3's orchestration projection. It would duplicate navigation, selection, shell sync, thread detail sync, pending approvals, and timeline rendering.

## Acceptance Criteria

1. With `JARVIS_API_BASE_URL` configured, T3 shows Jarvis runs in the main navigation/dashboard without creating durable T3-native project records for those runs.
2. A Jarvis run row displays objective/title, status, worker/session count, latest activity time, branch/PR/artifact summary, and whether human input or approval is needed.
3. Opening a Jarvis run/session shows a timeline derived from Jarvis `SessionEvent[]`.
4. `session.created`, `turn.started`, `turn.waiting_provider`, `assistant.delta`, `assistant.message`, `tool.call`, `tool.result`, `approval.requested`, `approval.resolved`, `input.requested`, `input.received`, `turn.completed`, `turn.failed`, `session.interrupted`, and `session.stopped` render with stable timeline rows.
5. Pending approval controls post to Jarvis approval endpoints and clearly show server rejection/failure if Jarvis denies or cannot resolve the decision.
6. Pending user-input controls post to Jarvis input endpoints and update the timeline without a page refresh.
7. Start work wizard can create a Jarvis-managed run/session with repo, objective, prompt, worker, provider/engine, base ref/branch policy, and surface metadata.
8. Interrupt, stop, resume, and send-turn controls call Jarvis APIs for Jarvis-backed sessions; they do not call T3 `ProviderService` for those sessions.
9. Worker/provider selectors come from Jarvis worker registry/health data exposed through the Jarvis connector or typed mock.
10. T3 does not spawn Codex/Claude for Jarvis-backed sessions in tests; adapter tests assert the Jarvis client was called instead.
11. Read-only dashboard and session detail work against typed fixtures before the live Jarvis aggregate API exists.
12. Once the live Jarvis aggregate API exists, replacing the fixture client with the HTTP client requires no UI component rewrite.

## Verification Cadence

After each meaningful group of changes, run both mechanical and browser-level verification before moving to the next group:

- Run the relevant unit/type/lint/build checks with the repo's Volta-pinned Node and pnpm versions.
- Use `agent-browser` against the live local T3/Jarvis Cockpit URL for changed browser workflows: open the app, take an interactive snapshot, exercise the changed controls, re-snapshot after navigation or DOM changes, and capture screenshots for visual states.
- Use `dogfood` for any group of changes that affects an operator workflow, including dashboard navigation, session timeline, start wizard, approvals/input, or interrupt/stop/resume. Store the report, screenshots, and videos under a local dogfood output directory.
- Treat `agent-browser`/`dogfood` failures as implementation blockers, not polish notes, unless they are explicitly unrelated to the changed surface.
- Keep dogfood evidence repro-first: interactive issues need a video plus step-by-step screenshots; static visible issues need an annotated screenshot and clear repro steps.

### Local Dev Smoke Protocol

Known-good local run loop for the `jarvis-cockpit` fork:

1. Start the dev stack from `/Users/neilbarton/Development/jarvis-cockpit`:

   ```bash
   volta run --node 24.13.1 --pnpm 10.24.0 pnpm dev
   ```

2. Expect Portless to expose the app at `https://cockpit.localhost`. The
   underlying direct dev-runner defaults are web port `5733`, server port
   `13773`, and base dir `/Users/neilbarton/.t3` unless a port offset is
   configured.
3. For browser automation, issue pairing tokens against the dev auth store, not the default userdata store:

   ```bash
   volta run --node 24.13.1 --pnpm 10.24.0 node apps/server/dist/bin.mjs auth pairing create \
     --base-dir /Users/neilbarton/.t3 \
     --dev-url https://cockpit.localhost \
     --base-url https://cockpit.localhost \
     --json
   ```

4. Open the returned `pairUrl` in a fresh named `agent-browser` session and wait long enough for pairing to complete:

   ```bash
   agent-browser --session jarvis-cockpit-smoke open 'https://cockpit.localhost/pair#token=TOKEN'
   agent-browser --session jarvis-cockpit-smoke wait --load networkidle
   agent-browser --session jarvis-cockpit-smoke wait 10000
   agent-browser --session jarvis-cockpit-smoke get url
   agent-browser --session jarvis-cockpit-smoke snapshot -i
   ```

5. Successful pairing lands on `https://cockpit.localhost/` and the shell should show `Projects`, `No projects yet`, `Add project`, `Settings`, and the main T3 controls.

Trial-and-error notes to preserve:

- Pairing tokens are one-time and short-lived. Do not test a token with `curl` and then reuse it in the browser; the direct API exchange consumes it.
- Omitting `--dev-url` when creating a token writes to the non-dev auth store. Passing `--base-dir /Users/neilbarton/.t3/dev` also misses the running server's derived path. Use `--base-dir /Users/neilbarton/.t3 --dev-url https://cockpit.localhost`.
- A stale `agent-browser` session that has already submitted invalid tokens can keep showing `Invalid pairing token`. Retry with a fresh session name before diagnosing the app.
- Pairing can take several seconds. Wait around 10 seconds before declaring failure.
- Pre-auth `401` responses and unauthenticated WebSocket errors in the console are expected while the app is still on `/pair`; treat them as failures only if they persist after the browser lands on `/`.
- Save smoke screenshots under `/Users/neilbarton/Development/jarvis-cockpit/dogfood-output/screenshots/` and close named `agent-browser` sessions after each run.

## Implementation Plan

### 1. Fork Baseline And Feature Gate

Target files:

- `apps/server/src/config.ts`
- `apps/server/src/serverSettings.ts`
- `apps/web/src/env.ts`
- new `apps/server/src/jarvis/*`
- new `packages/contracts/src/jarvis.ts`

Steps:

- Add a Jarvis feature gate, for example `JARVIS_COCKPIT_ENABLED=true`.
- Add `JARVIS_API_BASE_URL` and `JARVIS_API_TOKEN` server-side config.
- Keep the token server-only. Do not expose it through web env.
- Add a visible degraded state when Jarvis mode is enabled but the connector cannot reach Jarvis.
- Add a `jarvis` contract export from `packages/contracts/src/index.ts`.

Testable outcomes:

- T3 starts without Jarvis env vars.
- T3 starts in Jarvis mode with a mock base URL.
- Client bundle does not contain the Jarvis token.

### 2. Define Jarvis Wire Contracts In T3

Target files:

- new `packages/contracts/src/jarvis.ts`
- `packages/contracts/src/index.ts`
- new `packages/contracts/src/jarvis.test.ts`

Schemas:

- `JarvisRun`
- `JarvisWorkerSession`
- `JarvisSessionEvent`
- `JarvisWorkerProfile`
- `JarvisArtifact`
- `JarvisRunsSnapshot`
- `JarvisSessionEventsPage`
- `JarvisStartWorkInput`
- `JarvisTurnInput`
- `JarvisApprovalInput`
- `JarvisUserInputInput`
- `JarvisControlResult`

Rules:

- Match Jarvis response field names where stable.
- Keep provider-native payloads as opaque `provider_payload`.
- Add derived helper types only in T3 server code, not in the wire schema.

Testable outcomes:

- Fixtures decode successfully.
- Malformed event types fail schema decode.
- Unknown provider payloads remain round-trippable.

### 3. Build T3 Server Jarvis Client

Target files:

- new `apps/server/src/jarvis/JarvisClient.ts`
- new `apps/server/src/jarvis/JarvisClient.test.ts`
- `apps/server/src/serverRuntimeStartup.ts` or runtime layer file where services are assembled

Client operations:

- `getSnapshot()`: active/historical runs, sessions, workers, artifacts.
- `getRun(runId)`
- `getSession(sessionId)`
- `getSessionEvents(sessionId, { after })`
- `startWork(input)`
- `sendTurn(sessionId, input)`
- `respondApproval(sessionId, input)`
- `respondInput(sessionId, input)`
- `interruptSession(sessionId, turnId?)`
- `stopSession(sessionId)`
- `resumeRun(runId, input?)`

Initial transport:

- Use HTTP polling with cursor support where available.
- Until aggregate APIs exist, provide `JarvisFixtureClient` and optionally a worker-session-only dev client that can hit `/sessions` directly.

Testable outcomes:

- Client attaches bearer token only server-side.
- Client maps HTTP 401/403/404/5xx into typed server errors.
- Client preserves Jarvis error body in safe UI-facing error summaries.

### 4. Map Jarvis Runs To T3 Projection Models

Target files:

- new `apps/server/src/jarvis/JarvisProjectionMapper.ts`
- new `apps/server/src/jarvis/JarvisProjectionMapper.test.ts`
- `packages/contracts/src/orchestration.ts` only if existing shape cannot carry required fields

Mapping:

- Jarvis `OrchestrationRun.run_id` -> T3 `ProjectId` in Jarvis mode.
- Jarvis run objective/title -> T3 project title.
- Jarvis run repo/cwd/artifact context -> T3 project workspace metadata.
- Jarvis `WorkerSession.session_id` -> T3 `ThreadId`.
- Jarvis session title/run title -> T3 thread title.
- Jarvis session provider/engine/status -> T3 `OrchestrationSession`.
- Jarvis latest event -> T3 thread updated time/activity summary.
- Jarvis artifacts -> either thread activities initially or a small Jarvis artifact panel later.

Important constraint:

- The mapped T3 projection is ephemeral/read-through. It must not become an independently editable canonical record for Jarvis-managed work.

Testable outcomes:

- One run with two worker sessions renders as one T3 project with two T3 thread shells.
- Missing cwd/repo/artifacts still render with deterministic fallback labels.
- A session needing approval sets `hasPendingApprovals=true`.
- A session needing input sets `hasPendingUserInput=true`.

### 5. Add Jarvis Projection Query And Shell Stream

Target files:

- `apps/server/src/orchestration/Services/ProjectionSnapshotQuery.ts`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/ws.ts`
- possibly new `apps/server/src/jarvis/JarvisProjectionService.ts`

Approach:

- In Jarvis mode, merge or replace the shell snapshot source with `JarvisProjectionService`.
- Keep T3's existing `subscribeShell` and `subscribeThread` RPC methods so the web client state can keep using `state/shell.ts` and `state/threads.ts`.
- Poll Jarvis with a short interval and emit shell/thread stream events only when the derived projection changes.
- Start with polling. Do not introduce SSE/WebSocket until the Jarvis event contract is stable and the UI needs lower latency.

Testable outcomes:

- Existing T3 web shell state receives a snapshot without component rewrites.
- A changed Jarvis session status emits a thread upsert.
- A removed/completed/archived run is reflected according to the chosen visibility rule.

### 6. Map Jarvis Session Events To T3 Thread Detail

Target files:

- new `apps/server/src/jarvis/JarvisSessionEventMapper.ts`
- new `apps/server/src/jarvis/JarvisSessionEventMapper.test.ts`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/orchestration/projector.ts` only if projection entities need extension
- `apps/web/src/session-logic.ts` only for small display mapping gaps

Mapping:

- `assistant.delta` -> streaming assistant message update.
- `assistant.message` -> assistant message complete.
- `tool.call` -> work/activity row with `tone="tool"`.
- `tool.result` -> activity update/completion where correlation exists; otherwise append a result row.
- `approval.requested` -> pending approval activity.
- `approval.resolved` -> pending approval resolved activity.
- `input.requested` -> pending user-input prompt.
- `input.received` -> user-input resolved activity.
- `turn.started` -> latest turn running.
- `turn.completed` -> latest turn completed.
- `turn.failed` -> latest turn error.
- `session.interrupted` -> session interrupted.
- `session.stopped` -> session stopped.

Testable outcomes:

- Timeline rows are stable and sorted by Jarvis event time.
- Partial assistant deltas coalesce into a readable message.
- Approval and input prompts appear in existing composer surfaces.
- Unknown events render as neutral activity rows, not crashes.

### 7. Route Client Commands To Jarvis For Jarvis-Backed Threads

Target files:

- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- new `apps/server/src/jarvis/JarvisCommandBridge.ts`
- new `apps/server/src/jarvis/JarvisCommandBridge.test.ts`

Command mapping:

- T3 `thread.turn.start` -> Jarvis `POST /sessions/:id/turns` or aggregate start/turn endpoint.
- T3 `thread.turn.interrupt` -> Jarvis interrupt endpoint.
- T3 `thread.approval.respond` -> Jarvis approval endpoint.
- T3 `thread.user-input.respond` -> Jarvis input endpoint.
- T3 `thread.session.stop` -> Jarvis stop endpoint.
- T3 resume action -> Jarvis resume run/session endpoint.

Routing rule:

- If the thread/session is Jarvis-backed, `ProviderCommandReactor` delegates to `JarvisCommandBridge`.
- If the thread/session is native T3-backed, current `ProviderService` behavior remains.

Testable outcomes:

- Jarvis-backed turn start does not call `ProviderService.startSession`.
- Jarvis-backed approval does not call `ProviderService.respondToRequest`.
- Jarvis-backed stop does not call `ProviderService.stopSession`.
- Native T3 sessions still use `ProviderService`.

### 8. Build Read-Only Run Dashboard

Target files:

- `apps/web/src/routes/*`
- `apps/web/src/components/*`
- `apps/web/src/state/shell.ts`
- `apps/web/src/state/threadShell.ts`
- new Jarvis-specific dashboard components if the current sidebar is insufficient

UI behavior:

- Show all active Jarvis runs across workers.
- Group sessions beneath each run.
- Surface worker, provider, status, branch, PR/artifact indicators, latest event age, and "needs input/approval" badges.
- Provide filters for active, needs-human, failed, completed, worker, provider, and repo.
- Keep the first screen operational, not a marketing landing page.

Testable outcomes:

- Fixture data renders one run, multiple sessions, and mixed statuses.
- Empty state is useful when Jarvis is connected but no runs exist.
- Error state is useful when Jarvis is unreachable.
- Dashboard remains usable at desktop and mobile widths.

### 9. Build Session Detail Timeline

Target files:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/session-logic.ts`
- new mapper tests near session logic if needed

UI behavior:

- Opening a Jarvis session uses existing chat layout where possible.
- The header shows run title, session title, worker, provider, status, branch, and artifact/PR links.
- Timeline shows assistant messages, tool calls, approval/input events, checkpoints, failures, and terminal status.
- The composer sends a turn or input response based on pending state.

Testable outcomes:

- A `turn.waiting_provider` dummy session from current Jarvis endpoints renders clearly.
- A failed event shows a visible failure row.
- A terminal session disables inappropriate controls while leaving artifact links visible.

### 10. Add Input, Approval, And Control Surfaces

Target files:

- `apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`
- `apps/web/src/components/chat/ComposerPendingApprovalActions.tsx`
- `apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx`
- `apps/web/src/components/chat/ComposerPrimaryActions.tsx`
- `apps/web/src/components/ChatView.logic.ts`
- `packages/client-runtime/src/state/threadCommands.ts`

Controls:

- Approve, approve for session, decline, cancel where Jarvis says those decisions are allowed.
- Answer user-input questions, including free text and structured options.
- Send turn.
- Interrupt running session.
- Stop session.
- Resume completed/interrupted/stopped session when Jarvis says resumable.

Testable outcomes:

- Controls call Jarvis command bridge for Jarvis sessions.
- Controls show pending/loading state.
- Controls handle Jarvis rejection with a visible error activity.
- Keyboard shortcuts continue to work for existing user-input panel behavior.

### 11. Build Start Work Wizard

Target files:

- new `apps/web/src/components/jarvis/StartWorkWizard.tsx`
- new `apps/web/src/components/jarvis/StartWorkWizard.test.tsx`
- `apps/web/src/components/CommandPalette.tsx` or whichever entry point owns command palette actions
- `packages/client-runtime/src/operations/commands.ts` if a first-class command wrapper is needed

Wizard fields:

- Objective/title.
- Prompt.
- Repo.
- Worker.
- Provider/engine.
- Base ref.
- Branch strategy/name.
- Verification expectation.
- Surface metadata set to `t3`.

Data sources:

- Repos/workers/providers from Jarvis aggregate API or fixture client.
- Defaults from Jarvis configuration, not hardcoded T3 provider defaults.

Testable outcomes:

- Wizard can create a dummy session against current `/sessions` endpoints in dev mode.
- Wizard can create a full run once Jarvis start-work aggregate endpoint exists.
- The created run/session appears in the dashboard without a manual refresh.

### 12. Add Artifact And Evidence Surfaces

Target files:

- `apps/web/src/components/RightPanelTabs.tsx`
- new `apps/web/src/components/jarvis/JarvisArtifactsPanel.tsx`
- `apps/web/src/components/GitActionsControl.tsx` only if artifact links need source-control affordances

Behavior:

- Show linked branch, PR, report, verification evidence, logs, and generated artifacts from Jarvis.
- Links open in browser or the existing file/diff panel when local paths are present.
- Do not let T3 publish/merge Jarvis artifacts directly unless Jarvis exposes an allowed action.

Testable outcomes:

- A run with branch and PR artifacts renders both links.
- Missing artifacts render a compact "no artifacts yet" state.
- Artifact links do not require direct filesystem access unless Jarvis declares the path safe.

### 13. Test And Verification Plan

T3 unit/contract tests:

```bash
pnpm --filter @t3tools/contracts test -- jarvis
pnpm --filter t3 test -- JarvisClient JarvisProjectionMapper JarvisCommandBridge JarvisSessionEventMapper
pnpm --filter @t3tools/web test -- StartWorkWizard
```

T3 repo checks:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Jarvis smoke with current dummy endpoints:

```bash
# in Jarvis repo
uv run jarvis worker

# from T3 connector test/dev harness
POST /sessions
POST /sessions/:id/turns
GET /sessions/:id/events
POST /sessions/:id/input
POST /sessions/:id/approval
POST /sessions/:id/interrupt
POST /sessions/:id/stop
```

End-to-end acceptance:

- Start T3 in Jarvis mode.
- Load read-only dashboard from fixture or live aggregate API.
- Open a session with current dummy events and verify timeline rendering.
- Send a turn and confirm T3 records `turn.started` plus `turn.waiting_provider`.
- Resolve approval/input from T3 and confirm Jarvis event stream reflects it.
- Interrupt/stop session and confirm status changes across dashboard and detail.

## Risks And Mitigations

- Risk: T3 projection accidentally becomes the durable Jarvis work graph.
  Mitigation: make Jarvis projection read-through and use Jarvis IDs as source IDs; no T3-local mutation for Jarvis runs except UI cache.

- Risk: existing T3 provider reactor spawns native providers for Jarvis-backed threads.
  Mitigation: add explicit Jarvis-backed thread/session detection and tests that assert `ProviderService` is not called.

- Risk: Jarvis aggregate API is not ready when T3 work starts.
  Mitigation: use contract fixtures and a worker-session-only dev client, then swap to aggregate HTTP client with the same interface.

- Risk: approval decisions are duplicated in T3.
  Mitigation: T3 posts requested decisions to Jarvis and renders Jarvis acceptance/rejection; Jarvis remains enforcement point.

- Risk: T3 existing "project" means workspace root, while Phase 7 wants "project" to mean Jarvis run.
  Mitigation: in Jarvis mode, treat T3 project shells as UI projection rows only and label UI copy around "runs" where needed to avoid conceptual drift.

- Risk: event mapping loses provider-specific context.
  Mitigation: keep provider payload opaque in contract and expose detail expanders for raw payload in debug/dev mode.

- Risk: polling has stale UI during active sessions.
  Mitigation: start with cursor polling; add SSE/WebSocket only after the Jarvis event stream is stable.

## Execution Order

1. Add contracts, fixtures, config, and server Jarvis client.
2. Add projection mapper and read-only shell/thread detail from fixtures.
3. Build read-only dashboard and session timeline against fixtures.
4. Route commands through `JarvisCommandBridge` for Jarvis-backed sessions.
5. Add input/approval/control surfaces.
6. Add start work wizard.
7. Wire live Jarvis aggregate API when available.
8. Add artifact/evidence surfaces.
9. Run T3 checks and Jarvis smoke tests.

## Stop Conditions

- Stop Phase 7 first slice when a user can open T3, see Jarvis runs/sessions, open a session timeline, send a turn/input/approval, and stop/interrupt a dummy Jarvis session without T3 spawning a provider.
- Do not proceed to provider adapter implementation inside T3. Codex/Claude live adapters belong behind Jarvis worker sessions.

## Follow-up Staffing Guidance

Recommended `$team` lanes:

- `explore` lane: map exact T3 route/sidebar/component insertion points and current environment connection lifecycle.
- `executor` lane 1: contracts, fixtures, `JarvisClient`, config.
- `executor` lane 2: projection mapper, shell/thread integration, command bridge.
- `executor` lane 3: dashboard, session timeline, controls, start wizard.
- `test-engineer` lane: contract tests, mapper tests, command bridge tests, web component tests, dummy endpoint smoke.
- `architect` or `critic` lane: source-of-truth review, command routing review, authority boundary review.

Launch hint:

```bash
omx team --plan .omx/plans/t3-phase7-agentic-cockpit-plan.md --roles explore,executor,executor,executor,test-engineer,architect
```

Team verification path:

- Team proves the read-only dashboard and session timeline work from fixtures.
- Team proves Jarvis-backed command routing never calls native T3 provider services.
- Team proves dummy Jarvis `/sessions` endpoints can be driven through T3 controls.
- Team hands evidence to `$ultragoal` for durable checkpointing if this becomes a multi-turn implementation goal.

Goal-mode follow-up:

- Use `$ultragoal` as the default durable implementation owner for this Phase 7 plan.
- Use `$team` alongside `$ultragoal` because this work naturally splits into contracts, server bridge, UI, and tests.
- Do not use `$autoresearch-goal`; this is implementation delivery, not a research deliverable.
- Do not use `$performance-goal` unless later dashboard polling/rendering has measurable latency or throughput targets.
