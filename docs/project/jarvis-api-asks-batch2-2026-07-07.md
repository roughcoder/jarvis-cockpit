# Jarvis API Asks — Batch 2 (2026-07-07)

New/outstanding asks AFTER PR #96 (which landed attachments, session unarchive,
`ended_reason`, nullable `run_id`; push channel already existed via SSE). Each is written to
lift straight into a roughcoder/jarvis issue. Priority order top-to-bottom.

Cross-refs: `cockpit-review-findings-2026-07-07.md` (F1–F10),
`orchestration-chat-design.md`, `jarvis-api-asks-2026-07-06.md` (batch 1).

---

## A1. Project-thread enrichment: engine, model, status, ended_reason (BLOCKING cockpit UI)

**Problem.** The cockpit's primary chat surface renders **project threads**
(`GET /v1/projects/{id}/threads`, `.../threads/{tid}`). Users want each conversation row to
show its **engine** (colored Claude/Codex icon — F8), its **status** (working / in-progress /
completed — F9, a regression), and its **model** (F10). The `JarvisProjectThread` shape today
carries none of these — only `thread_id, project_id, session_id, title, timestamps, archive
fields`. We tried joining `thread.session_id` → snapshot worker session (which has
engine/status) and it does **not** match reliably (verified: neither `session_id` nor
`session_ref` matched on current data). So the cockpit can render nothing for these today.

**Ask (either A or B).**

- **A (preferred): put the fields on the thread.** `JarvisProjectThread` gains `engine`,
  `model`, `status` (same vocab as worker-session status), and `ended_reason` (the new #96
  taxonomy) — on both the list and detail responses.
- **B: guarantee the join.** Document and guarantee that `thread.session_id` is the canonical
  worker `session_id`, and that the corresponding session is present in
  `GET /v1/cockpit/snapshot`, so the cockpit can join engine/model/status itself.

**Acceptance.** For a project conversation, the cockpit can display its engine icon, model,
and live status without heuristics; a completed conversation shows why via `ended_reason`.

## A1b. Conversations must be able to act on repos (workspace + worktrees) — see conversation-workspace-model.md

**Problem.** A project conversation is a Honcho memory chat (`BrainSession.respond_text`) with
NO worktree/worker/filesystem — it knows repo _names_ but has no checkout, so it cannot answer
"what's the latest on the repos" or touch code. Work sessions (`/v1/work/start`) have worktrees
but are a separate lane. The conversation surface only exposes the memory lane.

**Ask.** Let a conversation own a **workspace root** and **materialize worktrees on demand**
(origin default, named base optional), **multi-repo** (N worktrees under one workspace it
owns — "the folder above the repos"), and run its engine turn in that workspace with git/fs
tools. Support **escalation**: a memory/orchestrator thread promotes to a working conversation
without losing history. Provisioning + tool surface must be **engine-unified** (Codex + Claude
identical). Jarvis/worker-owned; cockpit renders. Reuses repo-access/provisioning + worktree
cleanup + `parent_chat_id` tree.

**Acceptance.** In a conversation, ask it to check a repo → it provisions a worktree (origin)
and answers from the real checkout; a two-repo project can materialize both worktrees under one
workspace; Codex and Claude behave identically.

## A2. Attachments on the project-thread turn lane (raised on PR #96)

**Problem.** PR #96 enabled attachments on `/v1/sessions/{ref}/turns` and `/v1/work/start`
but keeps `POST /v1/projects/{id}/threads/{tid}/turns` rejecting them. That project-thread
lane is the cockpit's main operator chat (`ProjectConversationView` → `sendJarvisProjectThreadTurn`),
so "attach a screenshot" won't work where users type.

**Ask.** Extend the same attachment shape/limits/`supports.attachments` gating to the
project-thread turn lane — OR tell us the intended long-term "operator chat" lane so we build
the composer against the right one (see PR #96 review comment).

**Acceptance.** An image on a project-thread turn reaches the engine; oversized fails with the
named-limit error, same as the session lane.

## A3. Conversation/thread rename (F3; also needed by orchestration)

**Problem.** Operators want to rename a conversation inline; orchestration (F7) will rename
child chats programmatically. No title-write route exists; the cockpit rename is local-only
and labelled "not persisted by Jarvis".

**Ask.** `PATCH /v1/projects/{id}/threads/{tid}` (or `.../title`) accepting `{ "title": ... }`,
member-gated, idempotency-keyed, emitting `thread.renamed`, reflected in list + detail.

**Acceptance.** Rename persists, survives reload, shows in thread metadata; 403 preserves
authority detail.

## A4. Orchestration foundation — Jarvis-owned chat tree (LARGE; from `orchestration-chat-design.md`)

**Context.** Decision: Jarvis owns the whole hierarchical-agent-chat capability; the cockpit
only renders/controls; any client (incl. voice) drives it via API. Recommended ACP topology:
brain-brokered (workers host ACP servers, brain routes; cockpit never runs `acpx`).

**Ask (phase 1 first — each can be its own issue).**

- **Chat tree state:** `parent_chat_id` on session/thread; tree exposed in snapshot + detail;
  reparent-on-close/archive PROMOTES children to root (never cascade-delete).
- **Spawn-from-session:** orchestrator session spawns child work sessions tagged with its
  parent id; reconciliation packet carries the linkage.
- **Notify-on-complete:** child terminal events attributed to the parent (over the SSE push
  channel).
- **Autonomous lifecycle:** a session may spawn/close children + prune worktrees without
  per-action operator confirmation.
- **Worktree cleanup/prune** endpoint (shared with worker-readiness hygiene).
- **ACP hub:** brain routes agent-to-agent ACP (https://agentclientprotocol.com,
  `openclaw/acpx`) across workers; workers host ACP servers. Confirm feasibility.
- **Strong-model orchestrator** session type/config.

**Acceptance (phase 1):** a session carries `parent_chat_id`; the snapshot exposes the tree;
archiving a parent reparents children to root; cockpit renders the nested tree.

## A6. Brain conversation must not fabricate capabilities (from thread review)

**Problem.** In brain conversation `thread_1783429567_9977030b`, asked for a "code review",
the brain claimed it was "underway"/"reviewing the runtime repo" and hand-waved a tool list —
having made ZERO review tool calls (only a memory `record_finding` fired). It admitted "the
review didn't run" only when pushed. Brain conversations are `respond_text` with no
worktree/repo tools, but nothing stops the model claiming otherwise.

**Ask.** The brain must not claim an action/capability it did not perform via a real tool
call; when it can't do something from a conversation it declines and offers to escalate
(dispatch / provision a workspace). See `conversation-quality-findings-2026-07-07.md`.

## A7. Expose tool calls / actions on the project-thread turn stream

**Problem.** The cockpit shows no tool calls for brain conversations because the project-thread
API is text-only: turn SSE `thread.reply` = `{"reply": "..."}`, detail `messages` =
`{role, content}`. No tool/action events exist (work-session `/sessions/{ref}/events` DO carry
`tool.call`/`tool.result`, and the cockpit already renders those). So even the memory write is
invisible, and a fabricated "review" looks identical to a real one.

**Ask.** Emit the brain's tool calls/actions (memory writes, project switches, function calls)
as events on the thread turn stream / detail, like work-session events. The cockpit will
render them inline (reusing `MessagesTimeline`). Makes brain conversations observable and
exposes fabrication (A6).

## A8. Runs/sessions must carry project_id (+ engine) in the snapshot — dispatched work must nest under its project

**Problem.** Dispatching work via "Describe work" into a project (project Jarvis, repo
roughcoder/jarvis) produces a run/session that appears under **"Legacy recent work"** with a
terminal `>_` icon, NOT nested under the Jarvis project with an engine icon. Cause: the
`RunSummary`/`WorkerSession` snapshot projections have `run_id`, `title`, `repo`, `status`,
`phase`, `branch` but **no `project_id`**. The brain records the linkage on the transient
`work.dispatched` activity, but the durable run/session doesn't expose it — so the cockpit
can't map the run to the registry project and falls back to a synthetic `jarvis-run_<id>`
"legacy work artifact" row. This is the carried-forward gap from Phase 2 / repo-access design.

**Ask.** Add `project_id` (and `engine`) to the run summary/detail and worker-session snapshot
projections. Then the cockpit nests dispatched work under its project with the correct engine
icon and live status, instead of the legacy bucket.

**Acceptance.** Dispatch into project Jarvis → the run appears nested under Jarvis in the
sidebar with the engine icon and status, not under "Legacy recent work".

## A5. Per-worker git identity + repo access (still open from batch 1 #5)

**Problem.** Worker eligibility should be "the worker's own git identity can access the repo"
(workers hold their own GitHub creds; disk presence is just a warm cache), not "repo present
on disk". Full spec in `repo-access-and-provisioning.md`.

**Ask.** Worker snapshot gains `git_identity`, `repo_access_summary`, `worktree_inventory`;
`work/validate` adds per-worker `repo_access` + remediation reason codes; `work/start`
provisions on demand with progress phases (`resolving-access`/`cloning`/`creating-worktree`/
`running`).

**Acceptance.** Dispatch a repo not on the worker but accessible to its identity → phases
stream → runs; cockpit's existing "Not reported" worker rows light up from the new fields.

---

## Also confirm (from PR #96 review, not new asks)

- Does `ended_reason` appear on the project-thread detail (not only worker-session)? Needed by
  A1.
- `supports.attachments` lives on the `GET /v1/cockpit/catalog` engine row (where the cockpit
  reads it).
