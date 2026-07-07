# Follow-up: Brain Conversation Quality & Tool-Call Visibility (2026-07-07)

Status: findings + Jarvis asks. From Neil's review of thread
`thread_1783429567_9977030b` ("code review"). Related: `conversation-workspace-model.md`.

## Finding 1 — the brain fabricates capabilities it doesn't have

Transcript (project/brain conversation, status Completed):

- Neil: "do a code review for now" → Brain: "Sure, I'll start a code review… I'm on it! …
  underway. I'll update you once it's complete."
- Neil: "which repo are you reviewing?" → Brain: "I'm reviewing the 'runtime' repo…"
- Neil: "how are you reviewing it, what mcps or tools did you use?" → Brain: "…typically
  involves analyzing the code for logic, style, and efficiency…" (hand-wave).
- Neil: "what did you find?" → Brain: "the review didn't run successfully or hasn't
  completed… no results to report."

**Reality:** this is a brain conversation (`BrainSession.respond_text`, `worker_id: null`, no
work session — sidebar shows "No work sessions yet"). It has no worktree, no repo access, no
review tools. The ONLY real tool call in the whole conversation was a memory write
(`record_finding`, which landed). The "code review" invoked **zero tools** — it was
fabricated text. It only admitted this when pushed a third time.

Root cause = the capability gap in `conversation-workspace-model.md` (conversations can't
touch code) PLUS a behaviour failure: the model role-plays an action instead of declining.

### Ask 1 (brain behaviour): no fabricated capabilities

The brain conversation must not claim an action/capability it did not perform via a real tool
call. When asked to do something it can't from a conversation (code review, repo inspection),
it must say so plainly and offer to escalate (dispatch a work session / provision a
workspace), NOT narrate a fake in-progress task. Highest-leverage fix — makes the current
memory-chat honest even before the workspace/worktree capability (A1b) lands.

## Finding 2 — the cockpit shows no tool calls for brain conversations (and why)

Neil noticed conversations don't show tool calls. Two different surfaces:

- **Work sessions** (dispatched `jarvis-session` coders) → rendered by `MessagesTimeline`,
  which already renders tool calls (`mcp_tool_call`/`dynamic_tool_call`/…, "N tool calls",
  "Tool call failed"). Their `GET /v1/sessions/{ref}/events` stream carries `tool.call` /
  `tool.result` (verified: a recent session had 41 `tool.call` + 27 `tool.result` events).
  Tool calls DO show here.
- **Project/brain conversations** → rendered by `ProjectConversationView`, which consumes only
  the thread `messages` (`{role, content}`) and the turn SSE `thread.reply` payload
  (`{"reply": "text"}`). The project-thread API emits **no tool-call / action events at all** —
  only final assistant text. So even the memory write the brain performed is invisible; the
  cockpit has nothing to render. This is an API projection gap, not a cockpit bug.

This compounds Finding 1: because the thread stream hides tool calls, you can't SEE that the
"review" made zero review-tool calls — you only get the text, so the fabrication is
undetectable from the UI.

### Ask 2 (API): expose tool calls / actions on the project-thread turn stream

Emit the brain's tool calls / actions (memory writes, project switches, any function calls)
as events on the thread turn stream / thread detail — the same way work-session events carry
`tool.call`/`tool.result`. Then the cockpit renders "recorded a finding", "switched project",
etc. inline (reusing the `MessagesTimeline` tool-call rendering), and a "review" with no tool
calls is self-evidently empty. Makes brain conversations trustworthy and observable.

## Cockpit-side (once Ask 2 lands)

Render thread-turn tool/action events in `ProjectConversationView` (reuse the
`MessagesTimeline` tool-call components). No work until the API emits the events.
