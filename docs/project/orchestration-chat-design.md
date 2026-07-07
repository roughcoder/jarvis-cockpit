# Design: Hierarchical Agent Chats + Orchestration (F7)

Date: 2026-07-07. Status: draft for review — implementation held until approved (Neil).
Supersedes the initial narrow "chat that manages chats" sketch with Neil's fuller vision.

## The real concept

Not a special "orchestrator" object — a **general hierarchy of agent chats**. Any chat can
spawn other agent chats; spawned chats nest under their parent in a tree (sub, sub, sub, to
arbitrary depth). The thing people call "the orchestrator" is just a **long-lived chat with
a strong model, project context, and the ability to spawn and talk to other agents**. It can
also do work itself — it isn't privileged, it's just long.

How Neil works: keep one long-running chat with full project context, on a **better model**
than the build workers. Tell it "go work these tickets, build them, use Codex" — it fires off
worker agents (Codex, Claude, etc.), watches them, and when they finish it's **notified** and
can review the PR, bring it up, follow up, or clean up.

## Tree model

- Every agent chat has an optional `parent_chat_id`. Root chats have none.
- The sidebar renders chats as a **nested tree** under their parent (folder-style
  disclosure), any depth.
- A parent chat shows its children with their live status (running / awaiting review /
  done / failed).

### Lifecycle & reparenting (Neil's explicit rules)

- **Spawn:** parent creates a child agent chat (a work session or another orchestrator);
  child appears nested beneath it immediately.
- **Notify-on-complete:** when a child finishes, the parent is notified in-chat (a system
  turn / event) so it can react — review PR, follow up, or close it.
- **Close a child / clean up:** the parent can close child chats and **clean up their
  worktrees** (and other resources) from within its own chat.
- **Close the parent with children:** children are **promoted to top-level (root) chats** —
  they are NOT deleted or orphaned. "They become a chat of their own, without being a
  subagent."
- **Archive the parent:** same promotion — anything underneath detaches and becomes its own
  root chat, then the parent archives.

So the tree is a convenience/ownership overlay, never a destruction dependency: removing a
node reparents its children up, never cascades a delete.

## Inter-agent communication — ACP

Agents must be able to **talk to each other**, not just be spawned. Use the **Agent Client
Protocol (ACP)** — a JSON-RPC (over stdio for local, HTTP/WebSocket for remote) standard
that decouples clients from agents (the LSP-for-agents idea), reusing MCP JSON types and
Markdown for user-readable text.

Library: **`openclaw/acpx`** — a headless TypeScript/Node ACP **client framework** with
built-in adapters for Codex, Claude Code, and 15+ agents, stateful named sessions, queued
prompts, cooperative `session/cancel`, parallel sessions, and a `flow run` for multi-step
workflows. It lets an orchestrator "talk to coding agents over a structured protocol instead
of PTY scraping" — exactly the cross-CLAWD/Codex capability Neil wants.

Implication: the orchestrator asks questions of, and steers, child agents via ACP sessions
rather than the cockpit faking it through transcripts. This works across engines uniformly.

## Where this sits vs what exists

- **Project conversation** (shipped): operator ↔ one worker session.
- **This**: operator ↔ a long-lived chat that can spawn/talk-to a tree of agents across
  engines via ACP, with reparenting lifecycle. The shipped project conversation becomes a
  special case (a root chat with no children).

## Decisions (Neil, 2026-07-07) — this is a JARVIS-OWNED capability

1. **Jarvis owns the state.** `parent_chat_id` and the whole chat tree are **Jarvis-first**;
   Jarvis is the source of truth. Nothing about orchestration lives at "cockpit level" (i.e.
   inside the cockpit app). The cockpit is a **rendering + control surface only**: it draws
   the tree, sends operator turns, shows child status, and offers review/close actions — all
   backed by Jarvis APIs. This is the load-bearing decision and it re-homes almost all of the
   work below into roughcoder/jarvis.
2. **Orchestrator is powered by Jarvis**, not a cockpit-side model. It's a Jarvis session
   with a strong model + project context + spawn/talk capability.
3. **Autonomy: yes.** The orchestrator may spawn, close, and clean up worktrees **without
   per-action operator confirmation**. (Cockpit may still show what it did; approval is not
   required.)
4. **Client-agnostic.** Because orchestration is a Jarvis capability driven over the API, any
   client can use it — including a **voice chat** that spawns agents. So the capability must
   be API-first and must NOT be coupled to cockpit UI. Reinforces decision 1.
5. **ACP placement: pending — see recommendation below.** Neil deferred to us; requirement is
   cross-worker/cross-machine agent-to-agent communication.

## Recommended ACP placement (for Neil's sign-off)

Requirement: an orchestrator on machine X must talk to child agents that may run on other
workers/machines (e.g. laptop orchestrator ↔ Mac mini worker). `acpx` is a Node ACP **client**
(stdio to local agents; HTTP/WS to remote, WS still WIP).

**Recommendation: brain-brokered ACP, never cockpit-hosted.**

- **Each worker** runs its coding agents and exposes them as **ACP servers** (local stdio
  agent ↔ worker-local ACP endpoint). The worker already runs Jarvis worker code; ACP sits
  beside it.
- **The brain (Jarvis)** is the ACP **hub/router**: it holds the chat tree, spawns agents on
  workers, and routes agent-to-agent ACP frames between them — tunneled over the brain's
  existing worker protocol/relay rather than requiring every worker to reach every other
  worker directly (avoids NAT/firewall/trust problems, keeps Jarvis the authority and the
  auditor of who talked to whom).
- **The cockpit** never runs `acpx`. It calls Jarvis APIs to spawn/steer/read and renders the
  conversation + child tree. A voice client would call the same APIs.

Rationale: decisions 1–4 all say "Jarvis owns it, any client drives it." Putting the ACP
runtime in the cockpit would break the voice-client case and duplicate routing/trust the
brain already owns. The brain is also the only component that sees all workers, so it's the
natural relay for cross-machine comms.

Trade-off to confirm: brain-brokered adds a relay hop vs direct worker-to-worker ACP. For
agent chatter that's fine; if very high-bandwidth agent-to-agent streaming is ever needed,
the brain could hand out a direct WS with a short-lived token. Start brokered.

## Build phasing (now mostly Jarvis-side; cockpit renders)

1. **Jarvis: chat tree state.** `parent_chat_id` on sessions/threads, tree read in the
   snapshot/detail packets, reparent-on-close/archive semantics (promotion, never cascade
   delete). **Cockpit: render the nested tree** in the sidebar from that data. This is the
   first shippable slice and it's blocked on the Jarvis field.
2. **Jarvis: spawn + notify + cleanup.** Orchestrator (Jarvis session) can spawn child work
   sessions tagged with `parent_chat_id`, is notified on child completion, and can close
   children + prune worktrees autonomously. **Cockpit: show child status, surface
   notify-on-complete, offer review/close actions** (which call Jarvis).
3. **Jarvis: ACP hub + worker ACP servers** (per recommendation) for cross-engine,
   cross-machine agent-to-agent comms. **Cockpit: unchanged** beyond rendering agent turns.
4. **Review affordances (cockpit):** on child completion, surface PR link/diff and
   review/bring-up/follow-up/close actions.

Cockpit can build the _render_ side of phase 1 against a fixture as soon as the Jarvis tree
shape is agreed; real behaviour needs the Jarvis field live.

## Jarvis API asks this raises (for the handover)

These are substantial and belong in roughcoder/jarvis (added to `jarvis-api-asks` as a
grouped orchestration ask):

- **Chat tree:** `parent_chat_id` on session/thread; tree exposed in snapshot + detail;
  reparent-on-close/archive (children promote to root, never cascade-delete).
- **Spawn-from-session:** a session (the orchestrator) can call `work/start`-equivalent to
  spawn a child tagged with its parent id, and the reconciliation packet reflects the linkage.
- **Notify-on-complete:** child terminal-state events attributed to the parent (best over the
  push channel, ask #2).
- **Autonomous lifecycle:** orchestrator may close children + prune worktrees without
  operator confirmation (authority model must permit session-initiated writes).
- **Worktree cleanup/prune** API (also wanted by Phase 6 hygiene).
- **ACP hub + worker ACP servers:** brain routes agent-to-agent ACP across workers; confirm
  workers can host ACP endpoints.
- **Strong-model orchestrator session type/config** (better model than build workers).
- **Rename** (ask #5b) — orchestrator renames child chats as work evolves.
- Client-agnostic: all of the above must be API-driven so a voice client can orchestrate too.

## References

- ACP: https://agentclientprotocol.com/get-started/introduction
- acpx: https://github.com/openclaw/acpx
