# Spec: Lifecycle & Cleanup — Archive, Delete, and Worktree/State Reclamation

Status: proposed. Owner: Jarvis (roughcoder/jarvis) with cockpit rendering.
Audience: implementer picking this up cold. Date: 2026-07-07.
Related: `conversation-workspace-model.md`, `repo-access-and-provisioning.md`,
`orchestration-chat-design.md`, `jarvis-api-asks-batch2-2026-07-07.md`.

## Summary

Today the platform can **hide** things (archive) but cannot **reclaim** most of them. Durable
state — conversation memory sessions, worker worktrees, run/session records and events —
accumulates with no prune, no GC, and no true "delete and reclaim everything for this object".
As usage grows (many conversations, work sessions, worktrees, test junk), the platform gets
heavier and there is no clean way to remove something properly. This spec defines
archive-vs-delete semantics, a real delete lane, worktree/state reclamation, and a GC policy.

## Current state (verified against `docs/COCKPIT_API.md`)

- **Archive = hide, not delete.** `POST /v1/runs/{id}/archive`,
  `POST /v1/sessions/{ref}/archive`, project/thread archive all only remove the object from
  snapshot/list views. Detail-by-id still resolves archived objects; unarchive restores them.
  No underlying data is reclaimed.
- **Delete exists only for a few object types:** `DELETE /v1/projects/{id}` (registry row,
  leaves a visibility tombstone), `DELETE /v1/projects/{id}/files/{doc_id}`,
  `DELETE /v1/projects/{id}/members/{member_id}`, `DELETE /v1/mcp/tokens/{id}`.
- **No delete / no reclaim** for: conversations (Honcho memory sessions), work sessions,
  runs, session events, and — the big one — **worktrees on workers**
  (`~/.jarvis/worker/worktrees/…`), which are created per work session and never pruned.

## State layers (what actually accumulates)

| Layer                                      | Created by              | Archive effect | Reclaim today                           |
| ------------------------------------------ | ----------------------- | -------------- | --------------------------------------- |
| Project registry row                       | create project          | —              | `DELETE /v1/projects/{id}` (tombstoned) |
| Conversation memory (Honcho session)       | each conversation       | hidden         | none                                    |
| Work session record                        | each dispatch           | hidden         | none                                    |
| Run record                                 | each dispatch           | hidden         | none                                    |
| Session events / transcript                | each turn               | hidden         | none                                    |
| Uploaded files                             | file upload             | —              | `DELETE …/files/{doc_id}`               |
| **Worktrees on workers**                   | each work session       | hidden         | **none** (largest disk cost)            |
| Workspace roots (per conversation, future) | conversation escalation | —              | none (design pending)                   |

## Model: two distinct verbs

Make the difference explicit and consistent across every object type.

- **Archive** — reversible **hide**. Keeps all underlying data. Cheap. Default for
  "declutter my view". Unarchive restores. (Already the behaviour; just name/label it clearly.)
- **Delete** — irreversible **reclaim**. Destroys the object AND its owned heavy state
  (memory session, worktrees, records, events), subject to the tree rules below. Requires
  confirmation and states what will be destroyed. This is the missing lane.

## Requirements

### R1. A real delete lane for every heavy object

- `DELETE /v1/sessions/{session_ref}` — deletes the work-session record, its events, and
  **prunes its worktree(s)** on the owning worker. Idempotent; 404 for unknown.
- `DELETE /v1/projects/{id}/threads/{tid}` — deletes a conversation, including its Honcho
  memory session. Idempotent.
- `DELETE /v1/runs/{run_id}` — deletes a run and its owned sessions/worktrees per cascade.
- Each returns a reclamation summary: what was destroyed (records, events, N worktrees,
  bytes reclaimed).

### R2. Worktree prune (highest-value; also wanted by worker-readiness + provisioning)

- A worker-level prune operation: remove a specific worktree, or sweep stale/orphaned
  worktrees (no live session, older than a threshold). Reports count + bytes reclaimed.
- Surfaced in the worker snapshot as `worktree_inventory {count, disk_bytes, stale_count}`
  (already requested in `repo-access-and-provisioning.md`) so the cockpit can show and trigger
  cleanup.
- Deleting a session (R1) prunes its worktree as part of the operation.

### R3. Tree-aware cascade / reparent (aligns with orchestration `parent_chat_id`)

- Deleting a parent chat must NOT silently destroy children. Per the orchestration rules,
  children **reparent to root** on parent delete/archive — never cascade-delete implicitly.
- A separate explicit "delete subtree" option may destroy a parent AND its descendants, but
  only when explicitly chosen and confirmed, with a summary of everything affected.
- Deleting a project decides the fate of its conversations/sessions/worktrees: default =
  block delete while children exist, or require an explicit "delete project and all its
  work" with a full reclamation summary. (Pick one; document it.)

### R4. Garbage collection / retention policy (self-maintenance)

- Background GC so the platform doesn't grow unbounded without manual deletes:
  - stale-worktree sweep (orphaned or older than `WORKTREE_STALE_TTL`);
  - orphaned-session collection (session with no run/worker and no activity past a TTL);
  - event/transcript retention (cap or age-out old events, keeping summaries).
- All GC actions logged and attributable; nothing destroyed that an archive would have kept
  visible without the operator's retention policy allowing it.

### R5. Honest semantics surfaced to clients

- Snapshot/detail expose enough for the cockpit to distinguish archived (hidden, reversible)
  from deleted (gone, tombstoned) and to show reclaimable state (worktree inventory, stale
  counts) so users can clean up deliberately.

## Cockpit-side (once Jarvis exposes the above)

- Distinct **Archive** (reversible, no confirmation beyond normal) and **Delete**
  (irreversible, confirmation naming what's destroyed) actions on conversations, sessions,
  runs, projects.
- Worker card: worktree inventory + "prune stale worktrees" action (the worker-readiness
  reframe already renders `Not reported` placeholders for this).
- Never imply archive frees space; show reclamation summaries after delete/prune.

## Acceptance criteria

- Archiving an object hides it and reclaims nothing; unarchive restores it fully.
- Deleting a work session removes its records/events and prunes its worktree(s); a follow-up
  snapshot shows the worktree gone and bytes reclaimed.
- Deleting a conversation removes its Honcho memory session.
- Deleting a parent chat reparents children to root (no orphan, no silent cascade); explicit
  subtree-delete destroys descendants only when chosen, with a summary.
- A stale worktree with no live session is reclaimed by GC within its TTL and reported.
- The cockpit can show, per worker, worktree count/stale and trigger a prune.

## Phasing

1. **Worktree prune + inventory** (biggest disk win; unblocks the "it's getting busy"
   pain immediately). Worker prune op + `worktree_inventory` in snapshot.
2. **Session/conversation delete lane** (R1) with worktree/memory reclamation + summaries.
3. **Tree-aware cascade/reparent** (R3), coupled to the orchestration `parent_chat_id` work.
4. **GC policy** (R4) for hands-off self-maintenance.

## Open questions

1. Project delete with existing work: block, or explicit "delete all"? (R3)
2. Retention defaults for events/transcripts — cap by count, age, or both? (R4)
3. Should delete be soft (tombstone + async reclaim) or hard/synchronous? Soft is safer for
   audit; must still actually reclaim worktrees/disk, not just flag.
4. Who authorizes destructive GC — per-project policy, global config, or operator-only?
