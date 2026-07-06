# Worker-Session Multi-Step Chat Audit (2026-07-06)

Source: coordinator-run code audit (Explore agent) + live browser test evidence.

# Jarvis multi-step chat wiring audit — jarvis-cockpit (main)

## Files audited
- Server client: `apps/server/src/jarvis/JarvisClient.ts`
- Command dispatch: `apps/server/src/jarvis/JarvisDispatch.ts`
- Read model (events/requests/checkpoints): `apps/server/src/jarvis/JarvisOrchestrationReadModel.ts`
- Projection (session→UI status): `apps/server/src/jarvis/JarvisProjectionMapper.ts`
- ID mapping: `apps/server/src/jarvis/JarvisIds.ts`
- WS server + polling: `apps/server/src/ws.ts`
- Chat surface: `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/session-logic.ts`

---

## HIGHLIGHT: the follow-up-turn failure you observed

**Path (it is wired correctly and does reach `/turns`):**
1. Composer send on an existing `jarvis-session_*` thread dispatches orchestration command `thread.turn.start` **without** `bootstrap` (`threadEnvironment.startTurn`, `ChatView.tsx:1023`).
2. Server: `ws.ts:1086` calls `dispatchJarvisCommand(...)` first for jarvis threads.
3. `JarvisDispatch.ts:37` `sessionRef = jarvisSessionIdFromThreadId(threadId)` — strips the `jarvis-session_` prefix (`JarvisIds.ts:25-26`); this exactly round-trips the ref that `jarvisThreadIdForSession` created at promotion (`JarvisIds.ts:19-20`), so the ref is correct.
4. Non-null sessionRef + `thread.turn.start` → `ensureJarvisControlSupported` (`:72`, `:277-305`) → `dispatchJarvisWrite` → **`client.sendTurn(sessionRef, {prompt, idempotency_key, metadata.client_message_id})`** (`:112-121`) → **POST `/v1/sessions/{ref}/turns`** (`JarvisClient.ts:1044-1049`).

**Why the error message is exactly `Failed to dispatch Jarvis cockpit command thread.turn.start`:**
That string is produced *only* by `jarvisDispatchError` (`JarvisDispatch.ts:383-388`), which wraps `sendTurn` at `:121`. Distinguish the three failure shapes:
- Capability-gate failure → message ends in **`.capability`** (`jarvisDispatchOperationError`, `:287/:390`) — NOT your case, so `getSession` succeeded and `supported_controls` included `turn`.
- Jarvis returning `{ok:false}` → message **`Jarvis rejected thread.turn.start: …`** (`:375-380`) — NOT your case.
- **`sendTurn` Effect failing (HTTP non-2xx / network) → generic `Failed to dispatch …thread.turn.start`** (`:121` → `:383`) — **this is your case.**

**Conclusion on the live failure:** the dispatch reached `POST /v1/sessions/{ref}/turns` and **Jarvis returned a non-2xx (or the request threw)**. The first turn succeeded because it went through a *different* route — start-work (`POST /v1/work/start`, via `dispatchJarvisStartWork`, `:248-275`) — so the second turn is the first time `/turns` is exercised for that session. The cockpit collapses the real HTTP status/body into an opaque `cause` and shows the generic message (`JarvisClientError` carries `status`/`responseBody` at `JarvisClient.ts:79-97`, but the dispatch wrapper discards them into `cause`). To see the actual reason, inspect the server-side `JarvisClientError.status`/`responseBody` for operation `sessions.turn` — the cockpit UI never surfaces it. This is both (a) a cockpit **diagnosability bug** (swallowed status/body, generic message) and (b) most likely a Jarvis-side rejection of `/turns` for that session’s state.

Two concrete cockpit-side suspects to check against Jarvis’s `/turns` contract:
- Payload: cockpit sends `{prompt, idempotency_key, metadata:{client_message_id, surface}}` (`JarvisDispatch.ts:113-121` + `withSurfaceMetadata` `JarvisClient.ts:446-457`). If Jarvis’s `/turns` requires a field cockpit omits (or rejects the injected `metadata.surface`), it 4xxs.
- State: if Jarvis only accepts `/turns` while the session is idle/awaiting-input and rejects when the session is `completed`/busy, the second turn 4xxs even though `supported_controls` still lists `turn`.

---

## (a) Coverage table — Jarvis route → cockpit client → UI

| Jarvis route | Server client (JarvisClient.ts) | Dispatch / plumbing | UI status |
|---|---|---|---|
| GET `/v1/sessions` (list) | **Not implemented** | — uses `/v1/cockpit/snapshot` (`getSnapshot` :808) | Fleet list via snapshot |
| GET `/v1/sessions/{ref}` | `getSession` :960 | control gate + read model | thread detail |
| GET `/{ref}/events` | `getSessionEvents` :965 | `loadAllJarvisSessionEvents` (RM :205) | timeline |
| GET `/{ref}/requests` | `getRequests` :976 (paged+legacy) | synth events (RM :160-193) | approval/input cards |
| GET `/{ref}/checkpoints` | `getCheckpoints` :1006 | `loadAllJarvisSessionCheckpoints` (RM :238) | revert-to-message |
| POST `/v1/work/start` | `startWork` :1036 | `dispatchJarvisStartWork` (:248) | new-thread send |
| POST `/v1/work/validate` | `validateWork` :1040 | pre-start validation (:256) | implicit |
| POST `/v1/work/resume` | `resumeRun` :1092 | **NO CALLER — dead code** | **none** |
| POST `/{ref}/turns` | `sendTurn` :1044 | `dispatchJarvisWrite` (:112) | composer follow-up send |
| POST `/{ref}/input` | `respondInput` :1056 | `thread.user-input.respond` (:136) | input card |
| POST `/{ref}/approval` | `respondApproval` :1050 | `thread.approval.respond`, 4 decisions (:128,:443) | approval buttons |
| POST `/{ref}/interrupt` | `interruptSession` :1062 | `thread.turn.interrupt` (:124) | interrupt button (ChatView :4328) |
| POST `/{ref}/stop` | `stopSession` :1068 | `thread.session.stop` (:166) | stop / delete |
| POST `/{ref}/archive` | `archiveSession` :1074 | `thread.archive` (:170) | archive |
| POST `/{ref}/checkpoints/restore` | `restoreCheckpoint` :1086 | `thread.checkpoint.revert` (:147) | revert-to-message |

Notes: approval decisions accept/acceptForSession/decline/cancel are all exposed (`ComposerPendingApprovalActions.tsx:25-49`) and mapped to Jarvis `approved`/`approved_for_session`/`denied`/`cancelled` (`JarvisDispatch.ts:443-456`). Follow-up turns with attachments are rejected before any call (`JarvisDispatch.ts:41-52`).

---

## (b) Concrete circumstances where multi-step chat fails / dead-ends

1. **`/turns` rejected by Jarvis on the 2nd turn (your live case):** dispatch reaches `POST /{ref}/turns`, Jarvis returns non-2xx → opaque `Failed to dispatch Jarvis cockpit command thread.turn.start`; real status/body swallowed. First turn worked because it used `/work/start`, not `/turns`.
2. **Terminal session with `turn` dropped from `supported_controls`:** the capability gate fails with `…session does not support turn` (`JarvisDispatch.ts:299-303`); **no `work/resume` fallback exists** (`resumeRun` is dead code). The composer still invites the follow-up because `completed`→`ready` phase and `stopped`/`failed`→`disconnected` phase both allow sending (`session-logic.ts:1381-1392`; send only disabled for connecting/approval/unavailable, `ChatComposer.tsx:3131-3135`).
3. **Follow-up with attachments:** hard-rejected up front (`:41-52`).
4. **Approval/input pending during brain disconnect:** 2s poll returns `Option.none` on error (`ws.ts:183-190`); the request never renders, user cannot approve, turn stalls silently until reconnect.
5. **Thread not promoted (draft, null session_ref, no bootstrap):** `thread.turn.start` returns `null` (`:60-70`) → falls through to local orchestration engine → no Jarvis turn sent (silent no-op for Jarvis).
6. **Start-work returns no `session_ref`:** dispatch fails `…did not return a session_ref…` (`:359-366`); draft never promotes.
7. **Worker offline / authority ≠ jarvis:** capability gate fails (`:288-304`); no retry/queue. Follow-ups are session-pinned to the original worker (uses `sendTurn(sessionRef,…)`), so a conversation cannot be moved to another worker.

---

## (c) Cockpit bugs vs missing Jarvis API capabilities

**Cockpit-side (fixable here):**
- **Opaque error on `/turns` failure** — `JarvisClientError.status`/`responseBody` exist (`JarvisClient.ts:79-97`) but the dispatch wrapper (`JarvisDispatch.ts:121,383`) discards them into `cause`; the UI shows a generic message. This directly blocks diagnosing your live failure. **P0 for observability.**
- **`work/resume` never wired** — implemented (`JarvisClient.ts:1092`, `:1253`) but zero callers; no resume path for terminal sessions (failure #2).
- **Composer doesn’t reflect Jarvis session state before sending** (`completed`→`ready`), so rejections only surface after a round-trip.
- **Poll-only ingestion, no persisted cross-poll cursor** — every 2s re-replays full event/request/checkpoint history from `after=undefined` (`RM:205-235`, `:127-157`, `:238-268`); no “disconnected” banner on brain drop (failure #4).
- GET `/v1/sessions` list route unused (cosmetic; snapshot substitutes).

**Missing Jarvis capability / out of cockpit’s control:**
- Turn attachment forwarding (cockpit explicitly disabled pending Jarvis support, failure #3).
- Real-time push (no SSE/WS on documented Jarvis routes) → cockpit forced into 2s polling.
- Moving a live conversation across workers — not expressible via `/turns` (session-pinned).
- Whether the 2nd `/turns` *should* succeed for the session’s state is defined by Jarvis; the classification of your live failure hinges on Jarvis’s `/turns` contract, but the cockpit clearly contributes by hiding the returned status/body and by never attempting `work/resume` as a fallback.

**Recommended next step for your live repro:** capture the server-side `JarvisClientError` for operation `sessions.turn` (its `status` + `responseBody`) — that reveals whether Jarvis 4xx’d the payload (e.g., rejected `metadata.surface` / missing field) or the session state, which decides bug-vs-capability definitively.
---

## Live test evidence (coordinator, 2026-07-06 evening, laptop worker)

- Dispatch first turn to `Neil MacBook Pro (laptop)` via Describe work: SUCCESS — session
  replied "READY", draft promoted immediately to `jarvis-session_sessref_5DRamB6JfBOmaUCz`,
  progressive response rendered, "Stop generation" (interrupt) affordance present mid-turn.
- Second turn on the promoted thread: FAILED. Server-side cause (captured via temp
  instrumentation): `sessions.turn` → HTTP 409
  `{"code":"session_terminal","message":"worker session sess_dispatch_1783362862_4070e1ca is
  interrupted and does not accept new turns","recoverable":true}`.
- Cockpit showed only the generic "Failed to dispatch Jarvis cockpit command
  thread.turn.start." toast; `work/resume` exists in the client but has no callers.
- Mac mini dispatch remains blocked by the worker-checkout ref conflict
  (`refs/heads/jarvis` vs `jarvis/*`) — retest after the new Jarvis release deploys.
