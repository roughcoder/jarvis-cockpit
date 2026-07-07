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

## Build phasing (proposed)

1. **Tree data model + sidebar nesting.** Add `parent_chat_id` to the cockpit chat model;
   render nested disclosure; implement reparent-on-close/archive (promotion). No ACP yet —
   parent/child is just structural, children are ordinary sessions. Ships visible value fast
   and nails the lifecycle rules.
2. **Spawn-from-chat + notify-on-complete.** A chat can start a child work session (existing
   `/v1/work/start`) tagged with its `parent_chat_id`; child status changes notify the
   parent in-chat. Parent can close child + clean worktree (existing session stop/archive +
   worktree cleanup).
3. **ACP inter-agent comms via acpx.** Orchestrator ↔ child over ACP sessions; cross-engine
   (Codex/Claude/…); orchestrator can query/steer children. Strong-model orchestrator config.
4. **Review affordances.** On child completion: surface PR link, diff, "review / bring up /
   follow up / close" actions inline.

Phase 1 is independently useful and low-risk; ACP (phase 3) is the ambitious core.

## Open questions for Neil

1. **Where does `parent_chat_id` live** — cockpit-local, or does Jarvis need to own the tree
   (durable across clients)? Leaning: cockpit-local first (phase 1), propose a Jarvis field
   later if it must be durable/shared.
2. **Autonomy vs guardrails:** can the orchestrator spawn/close/clean-worktree without
   per-action confirmation, or is each destructive step operator-approved?
3. **ACP runtime placement:** does `acpx` run in the cockpit server (Node), on the worker, or
   the brain? Cross-machine ACP (orchestrator on laptop, child on Mac mini) implies remote
   ACP transport (HTTP/WS — noted WIP in ACP).
4. **Strong-model orchestrator:** which model, and is it a cockpit-side model or a Jarvis
   engine? (Neil: "better model than the models that build the code.")
5. **Worktree cleanup ownership:** cockpit asks Jarvis/worker to prune, or direct? Ties to
   the repo-access/provisioning worktree-inventory work (that already surfaces stale
   worktrees on worker cards).

## Dependencies / API asks this raises

- Possible Jarvis fields: durable `parent_chat_id` / child-linkage in session/thread packets;
  a spawned-by relationship in the reconciliation packet.
- Worktree cleanup/prune API on the worker (also wanted by Phase 6 hygiene).
- Event push channel (existing ask #2) — notify-on-complete is much better pushed than polled.
- ACP transport: confirm whether workers/brain can host ACP endpoints for remote agent comms.
- Rename API (ask #5b) — orchestrator will rename child chats as work evolves.

## References

- ACP: https://agentclientprotocol.com/get-started/introduction
- acpx: https://github.com/openclaw/acpx
