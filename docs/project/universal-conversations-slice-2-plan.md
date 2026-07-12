# Universal Durable Agent Conversations — Slice 2 Delivery Plan

Status: in progress  
Date: 2026-07-12  
Normative source: `universal-durable-agent-conversations-spec.md`  
Slice: Unified Cockpit runtime

## Outcome

Every Jarvis project conversation renders and composes through the same native code-agent runtime
used by directly hosted Codex and Claude conversations. A slow orchestration snapshot, lost worker,
or unavailable provider session must not prevent an otherwise durable conversation from opening,
showing committed history, or accepting its next turn.

## User-visible changes

- Project conversations open independently of the global runs/workers snapshot.
- The header, message timeline, tool activities, composer, pending requests, attachments, and
  recovery states converge on the native code-agent components.
- Project, memory, hierarchy, workspace, authority, goal, and evidence context remains in the right
  context panel rather than selecting another chat implementation.
- A provider/worker restart may change execution diagnostics, but it never replaces or terminates
  the conversation.

## Contract changes

### Jarvis

- Continue the Slice 1 `conversation_id`, `lifecycle`, `operational_state`, `diagnostic_reason`, and
  `last_turn_at` projection while preserving the v1 `status` compatibility window.
- Add a standard conversation-detail/event projection that contains ordered messages, semantic
  activities, pending input/approval state, workspace summary, active turn, and execution lease
  diagnostics without requiring the global Cockpit snapshot.
- Bound global snapshot reconciliation independently from conversation reads; slow or unreachable
  workers produce partial/stale diagnostics instead of unbounded response latency.

### Cockpit

- Introduce one Jarvis-to-client-runtime adapter at the server/client-runtime boundary.
- Route project conversations through the standard `ChatView`, `MessagesTimeline`, and
  `ChatComposer` contracts.
- Remove `ProjectConversationMessage` and the duplicate timeline/composer orchestration once the
  adapter covers the compatibility fixtures.
- Keep project context as a standard right-panel contribution rather than a route-specific shell.

## Compatibility window

- Existing project-thread URLs and `thread_id` deep links remain valid; `conversation_id` is the
  preferred stable identity when present.
- Cockpit accepts old Jarvis projections that lack the Slice 1 enrichment fields.
- Jarvis retains v1 `status`/`ended_reason` semantics until telemetry and the tested compatibility
  matrix permit removal.
- Legacy `chat_type` and provider workspace fields may inform the adapter during migration but must
  not select a different durable type or presentation implementation.

## Migration and backfill

- No destructive schema migration is permitted in this slice.
- Existing project threads are adapted lazily and retain their identifiers, hierarchy, messages,
  workspaces, and archive state.
- Any new local adapter cache is reconstructable and versioned; Jarvis remains the source of truth.
- Rollback to the previous Cockpit must leave conversations created or used by this slice readable.

## Implementation increments

1. Decouple project-conversation routing from the global orchestration snapshot.
2. Define golden Jarvis conversation fixtures and the client-runtime adapter.
3. Feed adapted messages and semantic activities to `MessagesTimeline`.
4. Feed project turns, steering, pending input/approval, and attachments through the standard
   `ChatComposer` command surface.
5. Move project/memory/workspace/hierarchy data into standard right-panel contributions.
6. Delete the duplicate project-conversation timeline, message, composer, and status code.
7. Bound and degrade global snapshot reconciliation so diagnostics cannot block conversation reads.

## Tests

- Route unit test: valid project-conversation params render even while the orchestration shell is
  pending or failed.
- Adapter golden tests: old and new Jarvis fixtures produce the same standard conversation model.
- Timeline tests: prose, semantic tool activity, pending requests, errors, and replay deduplicate.
- Composer tests: new turn, retry, steer/queue, attachment, archive, and reconnect use the standard
  command path.
- Contract tests across both repositories for identifiers, lifecycle, operational state, event
  ordering, and compatibility fields.
- Reliability tests for worker loss, brain restart, slow global snapshot, stream reconnect, and
  duplicate event replay.
- Required Cockpit gates: `pnpm exec vp check` and `pnpm exec vp run typecheck`.
- Required Jarvis gates for runtime increments: Ruff, full unit suite, public-readiness checks, and
  PR CI.

## Headed dogfood scenario

Against the exact dogfood brain/worker SHA and Cockpit main SHA:

1. Open a no-repository project conversation while the global orchestration snapshot is delayed;
   committed conversation history and the composer must still render.
2. Send two turns through the same conversation and verify the header returns to `Idle`.
3. Attach Jarvis and Jarvis Cockpit lazily, then verify both appear structurally in the context panel.
4. Spawn Claude and Codex children; verify immediate hierarchy, semantic activity, and live state.
5. Restart the selected worker during a child turn; verify the parent remains usable and the child
   becomes recoverable rather than disappearing.
6. Reload during the join; verify no duplicated messages, activities, children, or continuation.
7. Complete a joined PR review and verify only semantic tool activities appear in the normal
   transcript while technical events remain under diagnostics.

Evidence is stored outside tracked files and must not include private hosts, tokens, local paths, or
user data.

## Observability

- Measure conversation-detail and first-render latency separately from global snapshot latency.
- Emit structured snapshot partial/timeout diagnostics with worker counts, never credentials or
  private response bodies.
- Preserve turn, execution-lease, stream cursor, adapter version, and correlation identifiers in
  diagnostics while hiding them from the normal transcript.
- Record reconnect/replay dedupe counts and provider/worker reassignment outcomes.

## Rollback

- Cockpit increments are small main commits that can be reverted independently without changing
  Jarvis durable data.
- Jarvis increments remain on an isolated PR branch and dogfood channel until the complete slice
  passes; the ring can atomically roll back to its previous exact SHA.
- Rollback must be followed by opening and continuing a conversation used on the candidate.
- No production release, tag, or Homebrew metadata change occurs without explicit operator approval.

## Performance and security

- Conversation reads must have bounded latency and must not synchronously fan out across every
  historical worker session.
- Long timelines and wide/deep hierarchy projections remain virtualised and incrementally updated.
- The adapter performs no authority decisions; it presents effective grants supplied by Jarvis.
- Untrusted repository, PR, webpage, tool, and child content remains labelled data and cannot alter
  platform or grant policy.
- Secrets and private fleet topology remain outside messages, events, prompt receipts, fixtures, and
  tracked dogfood evidence.

## Exit criteria

- All project conversations use the native code-agent presentation and composer implementation.
- No valid conversation route waits for the global orchestration snapshot.
- The adapter and cross-repo fixtures pass for the oldest/newest supported compatibility pair.
- Slow/unreachable workers produce bounded partial diagnostics, not a blocked conversation.
- Required Cockpit and Jarvis gates pass at the exact candidate heads.
- The complete headed scenario passes against the live brain and workers with both local Codex and
  Claude subscription execution.
- The Jarvis PR is green and reviewed; Cockpit main is pushed; no production release has occurred.
