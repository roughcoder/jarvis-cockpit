# Jarvis API Asks — Batch 3 (2026-07-07, post-PR)

New asks identified AFTER the earlier handover (batches 1 & 2 went over with the cockpit PR;
batch 1 was largely satisfied by jarvis PR #96). These three surfaced from live review of
brain conversations and dispatch on the deployed 2026-07-07 build. Each is written to lift
straight into a roughcoder/jarvis issue.

Detail docs: `conversation-quality-findings-2026-07-07.md`, `conversation-workspace-model.md`.

---

## A6. Brain conversation must not fabricate capabilities

**Problem.** In brain conversation `thread_1783429567_9977030b`, asked to "do a code review",
the brain replied "I'll start a code review… it's underway… reviewing the 'runtime' repo",
hand-waved a tool list, and only admitted "the review didn't run successfully" when pushed a
third time. Reality: a project conversation is `BrainSession.respond_text` with no worktree,
no repo access, and no review tools (`worker_id: null`, no work session). The ONLY real tool
call in the whole conversation was a memory `record_finding`. The "review" invoked zero tools
— it was fabricated text.

**Ask.** The brain conversation must not claim an action or capability it did not perform via a
real tool call. When asked to do something it cannot do from a conversation (code review, repo
inspection), it must say so plainly and offer to escalate (dispatch a work session / provision
a workspace), not narrate a fake in-progress task.

**Acceptance.** Ask a brain conversation to review code → it declines and offers to dispatch,
rather than claiming a review is underway; it never reports progress/results for work it did
not perform.

**Why now:** highest-leverage — makes the current memory-chat honest even before the workspace
capability (batch-2 A1b) lands.

## A7. Expose tool calls / actions on the project-thread turn stream

**Problem.** The cockpit shows no tool calls for brain conversations because the project-thread
API is text-only: the turn SSE `thread.reply` payload is `{"reply": "..."}` and thread detail
`messages` are `{role, content}`. No tool/action events exist. (Work-session events,
`GET /v1/sessions/{ref}/events`, DO carry `tool.call`/`tool.result`, and the cockpit already
renders those in its timeline.) So even the memory write the brain performed is invisible, and
a fabricated "review" (A6) looks identical to a real one in the UI.

**Ask.** Emit the brain's tool calls / actions (memory writes, project switches, any function
calls) as events on the project-thread turn stream / detail — the same shape work-session
events use. The cockpit will render them inline (reusing its existing tool-call components).

**Acceptance.** A brain turn that records a finding (or switches project, etc.) surfaces that
action as a tool-call event on the thread stream; the cockpit shows "recorded a finding"
inline; a turn with no tool calls shows none.

## A8. Runs/sessions must carry project_id (+ engine) in the snapshot

**Problem.** Dispatching work via "Describe work" into project Jarvis (repo roughcoder/jarvis)
produces a run/session that appears under **"Legacy recent work"** with a generic terminal
icon, NOT nested under the Jarvis project with an engine icon. Cause: the `RunSummary` /
`WorkerSession` snapshot projections carry `run_id`, `title`, `repo`, `status`, `phase`,
`branch` but **no `project_id`**. The brain records the linkage on the transient
`work.dispatched` activity event, but the durable run/session projection does not expose it —
so the cockpit cannot map the run to the registry project and falls back to a synthetic
`jarvis-run_<id>` legacy-work row.

**Ask.** Add `project_id` (and `engine`) to the run summary/detail and worker-session snapshot
projections.

**Acceptance.** Dispatch into project Jarvis → the run appears nested under Jarvis in the
sidebar with the engine icon and live status, not under "Legacy recent work".

**Related UX note (cockpit-side, not an API ask):** dispatched work "did nothing for over a
minute" with no visible progress — the run's `status`/`phase`/`state_reason` exist but aren't
surfaced inline for these rows; and Auto routing may hit the Mac mini's `refs/heads/jarvis`
ref conflict (separate ops fix). Once A8 lets work nest correctly, the cockpit can show the
run phase inline.
