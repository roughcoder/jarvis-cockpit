# Jarvis API Asks From Cockpit — 2026-07-06

Each ask is written to be lifted directly into a roughcoder/jarvis issue: problem,
evidence, proposed contract, acceptance criteria. Evidence references:
`worker-chat-audit-2026-07-06.md` (audit + live test),
`repo-access-and-provisioning.md` (agreed direction), cockpit dogfood reports.

Priority order: 1 > 2 > 3 are blocking daily multi-step chat; the rest unlock
already-built cockpit UI.

---

## 1. Sessions must accept follow-up turns after a completed turn — RESOLVED by 2026-07-07 release

**STATUS: RESOLVED.** After the new Jarvis release deployed (2026-07-07), the cockpit's
client-side `sessions.turn` 409 → `work/resume` → retry path works end to end. Live test:
laptop worker, turn 1 replied "READY", turn 2 returned assistant output beginning
"Resumed and checked the current state. The worktree is still clean on
`jarvis/jarvis-f83652e7…`". `work/resume` now returns a resumable session instead of the
previous "no resumable worker session" 409. Multi-step chat is functional. The two
improvement options below remain worthwhile (they'd remove the client-side choreography and
fix the mislabelled `interrupted` state) but are no longer blocking.

Original report follows.

**Problem.** A worker session transitions to `interrupted` (terminal) when its turn
completes. The next `POST /v1/sessions/{session_ref}/turns` returns
`409 {"code":"session_terminal","message":"worker session sess_… is interrupted and does
not accept new turns","recoverable":true}`. Every multi-step conversation therefore
dead-ends after each turn, on every worker.

**Evidence.** Live test 2026-07-06 ~19:35: laptop worker, first turn (work.start)
succeeded and replied; second turn on the promoted session
`sessref_5DRamB6JfBOmaUCz` → 409 session_terminal for
`sess_dispatch_1783362862_4070e1ca`. Nothing interrupted the session — it finished its
turn normally, so the `interrupted` state also looks mislabelled.

**Ask (either A or B; A preferred).**

- **A. Turn-ready sessions:** a session whose turn completed stays `idle`/`awaiting_input`
  (non-terminal) while its worker remains online and under capacity. `/turns` on such a
  session starts the next turn. Sessions only become terminal on explicit stop/archive,
  worker loss, or unrecoverable engine exit — and then the state name should say which
  (`stopped`, `worker_lost`, `failed`), not `interrupted`.
- **B. Server-side auto-resume:** `/turns` on a resumable terminal session performs the
  `work/resume` choreography internally and applies the prompt to the resumed session,
  returning the standard reconciliation packet whose `session.session_ref` names the new
  session. Keep 409 `session_terminal` only for genuinely non-resumable sessions.

**Acceptance.**

- Send turn → wait for completion → send second turn → both succeed with no client-side
  resume logic, on Mac mini and laptop workers.
- If a new session_ref is created, the write's reconciliation packet carries it.
- `interrupted` is never the state of a session that completed normally.

**Update (same evening):** the cockpit shipped client-side resume-and-retry
(`sessions.turn` 409 → `work/resume` → retry on the returned `session_ref`). Live result:
`work/resume` itself returns
`409 "Run run_1783362862_5f17cce9 has no resumable worker session"`. So Jarvis labels the
session `recoverable: true` but provides no recovery path — the contradiction is the bug.
Until sessions stay turn-ready (A) or `/turns` auto-resumes (B), multi-step chat cannot
work no matter what the client does.

## 1b. Cockpit: block/queue sends while a turn is active (cockpit bug, found 2026-07-07)

**Problem.** During the multi-step live test, sending turn 2 while turn 1 was still running
returned `409 {"code":"session_active","message":"worker session sess_… already has an
active turn"}`. The composer allowed the send, and the resume-and-retry logic treated it as
a recoverable-terminal error and attempted `work/resume` (wrong — the session is busy, not
terminal). Retrying manually after turn 1 finished succeeded.

**Fix (cockpit-side, not a Jarvis ask).**

- Disable the send control while the projected session status is `active`/running, or queue
  the turn until the active turn completes.
- Exclude `session_active` from the resume-and-retry predicate (only `session_terminal`
  is resumable; `session_active` means wait).

Tracked for a cockpit follow-up; not a Jarvis API change.

## 2. Push channel for cockpit events (BLOCKING for responsiveness at scale)

**Problem.** All cockpit state is poll-only (`GET /v1/cockpit/snapshot`,
`/v1/cockpit/events?after=`, per-session events). The cockpit polls per open thread plus
per surface at ~2s; tonight one malformed snapshot row amplified through those polls into
11k+ failed requests and visible UI slowness. Approvals/input requests also arrive up to a
poll late, which matters mid-conversation.

**Ask.** A push transport for the existing event stream — either
`GET /v1/cockpit/events?after=<cursor>&wait=<seconds>` long-poll, or SSE
(`Accept: text/event-stream`) emitting the same envelopes with cursors so the client can
fall back to polling on reconnect. Same auth as the REST surface.

**Acceptance.** With one subscriber connected, a session event (turn output, request
raised, status change) reaches the client without a poll round-trip; disconnect + reconnect
with `after=<last cursor>` misses nothing.

## 3. Snapshot data hygiene: no empty `run_id` session rows

**Problem.** The live brain emits `sessions[]` rows with `run_id: ""`. Cockpit's contract
(`TrimmedNonEmptyString`) rejected the whole snapshot until we shipped drop-and-log
tolerance; the cockpit currently logs `Dropped 2 malformed session row(s)` continuously.

**Ask.** Never emit a session row with empty `run_id` (backfill or omit the row and log
brain-side). If sessions can legitimately exist without a run, make the field explicitly
nullable in the documented schema so clients can model it honestly.

**Acceptance.** `GET /v1/cockpit/snapshot` on the live brain returns zero rows with empty
`run_id`; cockpit drop-warnings stop.

## 4. Turn attachments (images first)

**Problem.** `POST /v1/sessions/{ref}/turns` and `/v1/work/start` return
`validation_failed` on any non-empty `attachments` array. Multi-step operator chat needs
at least screenshots ("here's the bug") to be useful.

**Ask.** Enable the already-documented shape:
`attachments: [{kind:"image", mime_type, name, data_url}]` on `/turns` and `/work/start`,
with documented size/count limits and a per-engine capability flag in the catalog
(`supports_attachments`) so the cockpit can gate the composer honestly.

**Acceptance.** A base64 PNG attachment on a turn reaches the engine session; oversized
payloads fail with a structured error naming the limit.

## 5. Per-worker git identity + repo access (agreed direction, spec in cockpit repo)

**Problem.** Worker cards and start-work compatibility currently only know "repos present
on disk". Agreed model (`repo-access-and-provisioning.md`): eligibility = worker's own git
identity can access the repo (workers hold their own GitHub credentials — e.g. a family
member's laptop uses their GitHub, never a brain-brokered one); disk presence is a warm
cache. `work/validate` already returns advisory `repo not checked out` — good start.

**Ask (worker protocol + snapshot additions).**

- Worker snapshot rows gain: `git_identity: {provider:"github", login, auth_state:
"valid"|"expired"|"unconfigured", checked_at}`, `repo_access_summary: {accessible_count,
source:"github_app"|"oauth"|"pat", refreshed_at}`, and
  `worktree_inventory: {count, disk_bytes, stale_count}`.
- `work/validate` compatibility rows add access results: `repo_access:
"accessible"|"no_access"|"unknown"` per worker with remediation reason codes
  (`connect_github_on_worker`, `request_repo_access`, `repo_private_choose_other_worker`).
- `work/start` provisions on demand (clone → designated location → worktree) for any
  accessible repo, with dispatch progress phases `resolving-access`, `cloning`,
  `creating-worktree`, `running` visible in session/run events.

**Acceptance.** Dispatch a repo NOT present on the target worker but accessible to its git
identity → phases stream → session runs. Cockpit "Not reported" rows (already shipped)
light up from the new snapshot fields without UI changes.

## 5b. Conversation/thread rename endpoint (from 2026-07-07 cockpit review)

**Problem.** Operators want to rename a project conversation (edit the title inline), and the
cockpit's future orchestration chat needs to rename conversations programmatically as work
evolves. There is no title-write route today.

**Ask.** `PATCH /v1/projects/{project_id}/threads/{tid}` (or dedicated `.../title`) accepting
`{ "title": "..." }`, member-gated, returning the updated thread and emitting a
`thread.renamed` event. Idempotency key supported.

**Acceptance.** Rename persists, appears in `GET .../threads` metadata and thread detail, and
survives reload; unauthorized callers get 403 with authority detail.

## 5c. Hierarchical agent chats + orchestration (LARGE — Jarvis-owned; from 2026-07-07)

**Context.** Neil's vision (full design: `orchestration-chat-design.md`): a general hierarchy
of agent chats where any chat can spawn children (nested tree, arbitrary depth), a long-lived
strong-model orchestrator fires off worker agents, is notified when they finish, reviews
PRs, closes children, and cleans worktrees — and agents talk to each other via ACP across
Codex/Claude/etc. **Decision: Jarvis owns all of this state and logic; the cockpit only
renders and controls; any client (incl. a voice chat) can drive it via the API.**

**Ask (grouped; each can be its own issue).**

- **Chat tree state:** `parent_chat_id` on session/thread, exposed in snapshot + detail;
  reparent-on-close/archive — closing/archiving a parent PROMOTES its children to root chats,
  never cascade-deletes.
- **Spawn-from-session:** the orchestrator session can spawn child work sessions (a
  `work/start` it initiates) tagged with its parent id; reconciliation packet carries the
  linkage.
- **Notify-on-complete:** child terminal events attributed to the parent (ideally over the
  push channel, ask #2).
- **Autonomous lifecycle:** a session may spawn/close children and prune worktrees WITHOUT
  per-action operator confirmation (authority model must allow session-initiated writes).
- **Worktree cleanup/prune** endpoint (shared with Phase 6 hygiene).
- **ACP hub:** brain routes agent-to-agent ACP (Agent Client Protocol,
  https://agentclientprotocol.com, lib `openclaw/acpx`) across workers; workers host ACP
  servers for their agents. Recommended topology: brain-brokered (not cockpit-hosted, not
  direct worker-to-worker) — see design doc for rationale. Confirm feasibility.
- **Strong-model orchestrator** session type/config (better model than build workers).
- **Client-agnostic:** all API-driven so non-cockpit clients (voice) can orchestrate.

**Acceptance (phase 1 only, to start):** a session carries `parent_chat_id`; the snapshot
exposes the tree; archiving a parent reparents children to root. Cockpit renders the nested
tree from that data.

## 6. Session `unarchive` (parity with thread/project archive)

**Problem.** `POST /v1/sessions/{ref}/archive` exists; unarchive is documented as
unsupported in v1. Projects and project threads both gained unarchive; sessions are now
the inconsistent surface, and cockpit cannot offer recover-from-archive for work sessions.

**Ask.** `POST /v1/sessions/{session_ref}/unarchive` using the same consolidated archive
bookkeeping path (per the doc's own guidance).

**Acceptance.** Archive → session hidden from snapshot/list; unarchive → visible again;
detail-by-ref works throughout.

## 7. Deploy/ops asks (not API changes)

- **Deploy PR #95** (`GET /v1/projects/{id}/threads/{tid}` with `messages`) — cockpit
  history UI is live and currently showing its honest "History unavailable" fallback;
  /settings/capabilities shows the route as Missing until deployed.
- **Fix the Mac mini worker checkout**: `work.start` fails 502 `provider_unavailable` —
  `fatal: cannot lock ref 'refs/heads/jarvis/…' unable to create directory` (a
  `refs/heads/jarvis` file/branch blocks the `jarvis/*` namespace, or a perms issue).
  This blocks ALL live dispatch to the Mac mini.
- **mcp-serve OAuth env** on the brain: `MCP_SERVE_BIND_HOST` (currently localhost-only —
  unreachable from cockpit), `MCP_SERVE_RESOURCE_URL`, `MCP_SERVE_OAUTH_ISSUER`,
  `MCP_SERVE_OAUTH_JWKS_URL`, plus `oauth_subjects` linkage in `users/<name>.md`, so the
  shipped cockpit OAuth/MCP integration can be verified end-to-end.

## 8. Nice-to-have (not blocking)

- **Cross-worker conversation continuation**: `work/resume` accepting a `worker_id`
  override to continue a session timeline on a different worker (depends on #5
  provisioning).
- **Terminal-state taxonomy in session detail**: `ended_reason`
  (`completed|stopped|interrupted_by_user|worker_lost|engine_error`) so the chat surface
  can explain _why_ a conversation ended without guessing from status strings.
