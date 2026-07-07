# Cockpit Manual Review Findings — 2026-07-07 (Neil)

Live review of the running cockpit. Batch 1. Each finding: what, my read
(bug / feature / needs-API), and where it lives. Fixes to be dispatched to codex agents.

## F1. Archive conversation from the sidebar on hover

**Ask.** Hovering a conversation row in the sidebar should reveal an Archive button (like
the one currently only in the conversation header). Quick reach, no need to open it first.

**Read.** Cockpit UI. `Sidebar.tsx` conversation rows + existing archive RPC (already wired
in `ProjectConversationView`). Reuse the hover-action pattern legacy thread rows use.

## F2. New-conversation reply is duplicated and hollow ("not smooth")

**Ask.** Creating a new conversation and sending "Hello there" rendered:
`Hello there` (user) → `Hello, Neil. What's on your mind today?` (assistant) →
`Hello there` (user, REPEATED) → `Jarvis completed the turn.` (assistant placeholder).
The user message double-renders and the final assistant bubble is a hollow
"completed the turn" instead of the real reply.

**Read.** Cockpit rendering/reconciliation BUG, highest priority of this batch. Likely the
optimistic local turn and the newly-fetched thread-detail history BOTH render the same user
message, and the assistant text isn't extracted from the turn result (only a completion
marker). Exposed by Phase 5 history + resume landing together. Needs root-cause in
`ProjectConversationView` / `jarvisProjectConversations.logic.ts` message merging +
send-state → history reconciliation.

## F3. Conversation header: simplify + inline-rename + API

**Ask.**

- Header should read just `Conversation for Jarvis` — drop the `Jarvis · roughcoder/jarvis`
  subtitle line from the title block.
- Click the title to edit the conversation title inline.
- Refresh + Archive buttons right-aligned to the top of the header.
- **Needs a Jarvis API**: an endpoint to set a conversation/thread title, so code (and
  orchestration) can rename too — e.g. `PATCH /v1/projects/{id}/threads/{tid}` with `title`.

**Read.** Cockpit UI (header layout + inline edit) + one Jarvis API ask (rename). Until the
API exists, inline rename can be local-optimistic but should be gated/labelled honestly.

## F4. Right-hand project context panel should be hideable

**Ask.** The right panel (PROJECT / MEMORY / FILES, image 3) should collapse via a toggle
button placed next to Refresh + Archive in the right-aligned header cluster.

**Read.** Cockpit UI. Add a panel-visibility toggle to the conversation surface; persist
the preference.

## F5. Project-row hover actions (left side)

**Ask.** Hovering a PROJECT row (not a conversation) reveals two buttons on the left:

1. **Go to project page** — the project settings/detail page (see F6).
2. **Orchestration chat** — opens the project's orchestration chat (see F7).

**Read.** Cockpit UI (hover actions) + depends on F6 and F7.

## F6. Project page as a main-surface view (out of settings)

**Ask.** Move project management off the "awful" `/settings/projects` page. Hovering a
project → "View project" replaces the chat interface on the right-hand surface with a
well-laid-out project view. Repos/memory/files/CRUD reachable without going into settings.

**Read.** Cockpit UI, large. New main-surface route for a project (mirrors how conversations
route into the chat surface). Reuse the Phase 4 structured editor logic but present it as a
proper page, not the settings panel. Settings page can remain as admin fallback.

## F7. Orchestration chat (new concept)

**Ask.** A chat, per project, that spins up other chats/work sessions, manages them, reads
them, and reports back — an orchestrator conversation over the project's workers/sessions.

**Read.** New feature, design needed — significantly expanded by Neil (2026-07-07): it's a
general **hierarchy of agent chats** (any chat spawns children; nested tree in sidebar;
reparent-on-close/archive), with a long-lived strong-model orchestrator chat that fires off
worker agents, is notified on completion, reviews PRs, closes children + cleans worktrees,
and **talks to other agents via the Agent Client Protocol (ACP / `openclaw/acpx`)** across
Codex/Claude/etc. Full spec: `docs/project/orchestration-chat-design.md`. Design-only until
approved; F5 wires a stub button to it.

## F8. Engine icon on chat rows (batch 2, 2026-07-07)

**Ask.** Each chat row in the sidebar should show a small COLORED engine icon (Claude /
Codex) so you can see at a glance which engine a chat is. Icons supplied by Neil, added as
`ClaudeColor` / `CodexColor` in `Icons.tsx`.

**Read.** Cockpit UI + a data join. `JarvisProjectThread` (what conversation rows render) has
NO engine field — only `session_id`. The snapshot's worker sessions carry `engine`. Join
thread.`session_id` → snapshot session → `engine`, render the colored icon in
`SidebarProjectConversationRow`. If the join is unreliable, raise a Jarvis ask to put
`engine` on the project thread directly. Work-session rows already have engine.

## F9. Chat status was lost — restore it (batch 2, 2026-07-07)

**Ask.** Chat rows used to show status (working / in-progress / completed / etc.); the
project-conversation rows don't. Keep/restore the status indicator per chat.

**Read.** Regression/gap. Same join as F8: worker session has `status`; project thread does
not. Restore a status pill/indicator on `SidebarProjectConversationRow` from the joined
session status (reuse the existing thread status-pill component/logic used by legacy thread
rows — `resolveThreadStatusPill` in `Sidebar.logic.ts`). If status isn't reliably joinable,
Jarvis ask: expose conversation status on the project thread.

## F10. Model per conversation is missing (batch 2, 2026-07-07)

**Ask.** Each conversation should show/carry which MODEL it is using (not just the engine).

**Read.** Same data gap as F8/F9: the project thread carries no model field. Bundle into the
project-thread enrichment ask (engine + model + status + ended_reason on the thread, or a
reliable session join).

---

## Jarvis API asks surfaced by this review

- **Conversation/thread rename**: `PATCH /v1/projects/{id}/threads/{tid}` (or dedicated
  `/title`) accepting `{title}`, member-gated, emitting a `thread.renamed` event. (F3)
- (F7 may need an orchestrator session concept — TBD at design.)

## Suggested agent slicing (no file collisions)

- **Agent A — conversation surface polish (F1, F3 UI, F4):** `Sidebar.tsx` hover archive +
  `ProjectConversationView.tsx` header (simplify, inline rename local, right-aligned
  controls, hideable panel). One agent since F3/F4 share the header.
- **Agent B — the duplicate/hollow message bug (F2):** `jarvisProjectConversations.logic.ts`
  - `ProjectConversationView` message reconciliation. Isolated, highest value.
- **Agent C — project main-surface view (F6) + project-row hover (F5):** new route +
  Sidebar project hover. Larger.
- **F7 orchestration chat:** design doc first, then build. Separate.
- **Rename API (F3):** add to the Jarvis asks handover.
