# Design: Conversations Own A Workspace Of Worktrees

Date: 2026-07-07. Status: assessment + proposal (Neil raised; coordinator investigated).
Related: `orchestration-chat-design.md`, `repo-access-and-provisioning.md`.

## Symptom

In a Jarvis project conversation, asking "what's the latest on the repos?" gets "I can't
find a local copy of the runtime repo." The conversation knows the repo _names_ but has no
working copy.

## Why (grounded in the API, verified)

A project conversation is an **orchestrator thread** backed by a **Honcho memory session**
(`project:<id>:orchestrator:<thread-id>`). Its turn is driven by `BrainSession.respond_text`
— a **text-only brain reply with memory context**. It has:

- project context: memory, membership, knows repo names from the registry;
- NO worktree, NO worker, NO filesystem, NO engine-with-tools.

Separately, a **work session** (`/v1/work/start` → `jarvis-session`) is dispatched to a
worker WITH a real worktree (`~/.jarvis/worker/worktrees/jarvis-…`) and does the coding.

So there are **two disconnected lanes**: a memory chat (what the conversation surface gives
you) and a working session (what has a checkout). The conversation presents as if it can act
on repos; it can't. That mismatch is the problem — not a bug in either lane.

## Desired model (Neil)

- A conversation owns a **workspace root** — "the folder above where the repos are" —
  initially empty.
- When it needs a repo it **materializes a worktree** of origin by default (or a named base),
  lazily. No checkout required at creation.
- **Multi-repo:** for a project with N repos it can check out several worktrees under that one
  workspace root and work across them at once, owning all of them.
- The engine turn runs **with the workspace as cwd** and git/fs tools — not a contextless
  memory turn.
- **Unified across Codex and Claude:** provisioning + tool surface defined at the
  Jarvis/worker layer so both engines behave identically.

## Recommendation

**Collapse the two lanes into one escalating "agent chat".** A conversation:

1. starts cheap as today's memory/planning chat (great for "what should we build");
2. **escalates on demand** — when it (or the user) needs to touch code, it provisions a
   workspace root and worktrees (origin default, named base optional), one per repo, multi-repo;
3. from then, the engine turn runs in that workspace with git/fs tools;
4. the workspace root is stable and durable; worktrees come and go under it; the conversation
   owns them and can clean them up.

This is `repo-access-and-provisioning.md` (worktree-first, workspace above repos, provision on
demand) applied to conversations, and it is the natural home for orchestration
(`orchestration-chat-design.md`): the workspace-owning conversation IS the orchestrator; child
work sessions are worktrees/sessions beneath it.

### Ownership: Jarvis, not cockpit

Same decision as orchestration. The workspace + worktrees live on the worker; the brain owns
the conversation↔workspace mapping and the escalation; the tool surface is engine-agnostic so
Codex and Claude get identical capability. The cockpit renders (workspace state, worktrees,
provision progress) and offers controls; it does not own the mechanism. Any client (voice)
can drive it.

### Keep the cheap lane, label honestly

The memory-only chat is worth keeping for planning. Until escalation exists, the conversation
should not imply it can read the repos. Either escalate transparently, or label the
memory-only state so the user isn't told "I can't find a local copy" as if something is
broken.

## Jarvis API asks this generates

- **Conversation workspace + on-demand worktrees:** a project conversation can provision a
  workspace root and materialize worktrees (origin default, named base optional), multi-repo,
  and run its engine turn in that workspace with git/fs tools.
- **Escalation:** a memory/orchestrator thread can promote to a working conversation
  (acquire a workspace) without losing its history/context.
- **Engine-unified provisioning + tools:** identical workspace/tool surface for Codex and
  Claude (ties to ACP / the orchestration foundation).
- Reuses: repo-access/provisioning (worktree-first, workspace above repos), worktree
  cleanup/prune, `parent_chat_id` tree (child work under the workspace-owning conversation).

## Cockpit-side (later, once Jarvis exposes it)

- Show the conversation's workspace: which repos are materialized, worktree state, provision
  progress phases (`resolving-access`/`cloning`/`creating-worktree`/`running`).
- Affordance to add/remove a repo worktree to the conversation's workspace.
- Nothing to build here until the Jarvis mechanism exists; render against it when it lands.
