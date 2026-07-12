# Universal Durable Agent Conversations

Status: normative product and architecture specification  
Date: 2026-07-12  
Owners: Jarvis runtime and Jarvis Cockpit  
Supersedes the architectural direction in:

- `orchestration-chat-design.md`
- `conversation-workspace-model.md`
- the conversation portions of `repo-access-and-provisioning.md`
- the conversation portions of `spec-lifecycle-and-cleanup.md`
- the two-conversation-stack direction in `unified-chat-presentation.md`

Those documents remain useful historical evidence. Where they disagree with this specification,
this specification wins.

## 1. Executive Decision

Jarvis has one durable conversation abstraction: an **agent conversation**.

An agent conversation is not an assistant chat, orchestrator chat, reviewer chat, coding job, or
research chat. Those names describe behaviour produced by the conversation's instructions,
context, authority, tools, and current objective. They are not durable types.

Every agent conversation:

- uses the same conversation, turn, activity, composer, workspace, hierarchy, and recovery model;
- can discuss, investigate, plan, use tools, attach resources, and perform authorised actions;
- can spawn child agent conversations;
- can receive child results and continue automatically;
- can itself be a child and still spawn further descendants;
- can know about zero, one, or many repositories without requiring any repository at creation;
- can attach zero, one, or many repositories to a durable workspace when needed;
- can survive provider completion, worker loss, process restart, model change, and long idle periods;
- remains usable until an operator explicitly archives or deletes it.

The conversation never reaches `completed`. Turns, goals, child work, tool calls, execution leases,
reviews, deployments, and automations can complete. The conversation remains durable.

Jarvis owns the durable domain and authority. Cockpit is a projection and control surface. Cockpit
must not create a second conversation runtime, scheduler, workspace database, child-watch system,
or provider-session owner.

## 2. Product Outcomes

The system must enable an operator to keep a long-running conversation about a project and move
seamlessly between discussion and action:

1. Discuss a project using durable memory and project knowledge.
2. Discover which repositories, services, documents, and external systems may be relevant.
3. Decide that no repository is needed, or attach the repositories required for the next action.
4. Work across multiple attached repositories in one workspace.
5. Spawn children for parallel investigation, review, implementation, verification, or operations.
6. Observe child state without polling or reconstructing raw events.
7. Continue automatically when subscribed events occur.
8. Reconcile child results and perform authorised external actions.
9. Return to ordinary conversation after the work finishes.
10. Resume the same conversation later with its history, goals, memory, workspace manifest,
    hierarchy, subscriptions, and evidence intact.

The same runtime must support engineering, research, planning, documentation, incident response,
release coordination, operations, and future automations. Code is a capability, not the identity of
the runtime.

## 3. Normative Language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST** defines a correctness, safety, or product invariant.
- **SHOULD** defines the expected implementation unless an evidenced constraint requires otherwise.
- **MAY** defines an optional extension that must preserve the invariants.

## 4. Goals and Non-goals

### 4.1 Goals

- One conversation contract across Jarvis-backed and directly hosted provider execution.
- One code-agent-quality Cockpit surface across all agent conversations.
- Durable, recursively nestable conversations.
- Lazy, multi-repository workspaces.
- Provider- and worker-independent continuity.
- Event-driven wakeups and reusable automations.
- Explicit authority, audit, and idempotency for side effects.
- Provenance-aware memory and verification evidence.
- API-first behaviour usable by Cockpit, voice, CLI, and future clients.
- Compatibility migration without losing existing conversations or work.

### 4.2 Non-goals

- A separate workflow engine whose nodes are different from conversations, turns, tools, and events.
- A special orchestrator service or orchestrator conversation type.
- Giving every conversation unconditional production, secret, deployment, or GitHub authority.
- Sharing one writable checkout between parallel conversations.
- Encoding durable state only in prompts or transcripts.
- Making Cockpit responsible for fleet scheduling or Jarvis domain truth.
- Requiring GitHub, a repository, or a workspace before a conversation can exist.
- Guaranteeing distributed exactly-once execution. The system guarantees idempotent logical effects
  and at-least-once event delivery with deduplication.

## 5. Core Terminology

| Term                  | Definition                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Agent conversation    | Durable interaction and responsibility boundary. Never completed by provider/session termination.                         |
| Turn                  | One requested unit of model work within a conversation.                                                                   |
| Execution lease       | Ephemeral assignment of a conversation turn to a provider session on a worker.                                            |
| Goal                  | Durable desired outcome, acceptance criteria, plan, evidence, and blockers owned by a conversation.                       |
| Child conversation    | A normal agent conversation with a `parent_conversation_id`. It retains all normal capabilities.                          |
| Workspace             | Durable logical container owned by one conversation, containing resource attachments and execution metadata.              |
| Repository catalogue  | Repositories the conversation is allowed to know about and may be able to attach. Catalogue membership is not attachment. |
| Repository attachment | A specific repository materialised in a workspace at an exact revision and access mode.                                   |
| Capability            | A class of action supported by the runtime, such as reading files or publishing a GitHub review.                          |
| Grant                 | Scoped authority allowing a principal or conversation to exercise a capability.                                           |
| Activity              | Semantic, user-presentable record of intent, progress, outcome, or required action.                                       |
| Runtime event         | Detailed internal fact used to update domain state. It is not automatically a user-facing activity.                       |
| Subscription          | Durable rule that wakes a conversation when a matching event occurs.                                                      |
| Automation template   | Reusable policy for creating or waking ordinary conversations in response to events.                                      |
| Resource attachment   | Generalisation of a repository attachment for documents, browsers, services, data, and future connectors.                 |

### 5.1 Canonical durable ontology

The implementation MUST keep the following identities separate. Combining them because a provider
or current database happens to use one identifier is a migration shortcut, not the target model.

| Entity              | Durable owner                    | Lifecycle/identity rule                                                                     |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| Project             | Organisation/operator            | Scopes knowledge, resources, policy, and conversations; it is not a workspace.              |
| Conversation        | Project or operator              | Stable recursive identity; remains usable until explicitly archived/deleted.                |
| Turn                | Conversation                     | One ordered request/response effort; terminal without terminating the conversation.         |
| Message             | Conversation/turn                | Immutable authored content plus revision/redaction metadata.                                |
| Activity            | Turn or conversation             | Semantic presentation record; may outlive the provider event that caused it.                |
| Goal                | Conversation                     | Durable outcome and evidence record; independently terminal/reopenable.                     |
| Plan revision       | Goal                             | Immutable version of proposed steps, assumptions, and dependencies.                         |
| Child relationship  | Parent and child conversations   | Single canonical parent, immutable creation provenance, explicitly detachable/reparentable. |
| Subscription/watch  | Conversation                     | Durable event filter and wake policy; one-shot or persistent.                               |
| Execution lease     | Turn                             | Expiring worker/provider allocation; always replaceable.                                    |
| Provider session    | Execution lease/provider         | Provider-local optimisation and diagnostics identity only.                                  |
| Workspace           | Conversation                     | Stable logical workspace, independently materialised on workers.                            |
| Resource attachment | Workspace                        | Versioned materialisation intent and exact observed state.                                  |
| Worktree/checkout   | Repository attachment/worker     | Physical cache/materialisation; never authority or durable conversation identity.           |
| Artifact/evidence   | Goal, turn, or activity          | Immutable or content-addressed result with provenance and visibility.                       |
| Capability grant    | Principal/conversation           | Signed/scoped/expiring authority with delegation and revocation state.                      |
| Approval            | Grant request or external action | Attributable decision with scope, expiry, and policy basis.                                 |
| Event               | Aggregate                        | Immutable fact with schema version, correlation, causation, trust, and dedupe identity.     |
| Memory assertion    | Project/conversation             | Provenance-bearing knowledge that may be corrected or superseded.                           |
| External action     | Turn                             | Idempotent requested effect plus reconciliation and receipt.                                |
| Automation template | Project/organisation             | Versioned trigger and policy that creates/wakes ordinary conversations.                     |

Every mutable entity MUST carry a revision for optimistic concurrency. Every terminal transition
MUST record timestamp, actor, structured reason, and evidence or diagnostic reference.

## 6. Invariants

These invariants override implementation convenience.

### 6.1 Conversation invariants

1. A conversation MUST NOT become terminal because a turn, provider session, worker session, child,
   goal, or external action completed or failed.
2. A non-archived conversation MUST accept a future turn even when no provider session is alive.
3. Provider session identity MUST NOT be the conversation identity.
4. Every conversation MAY spawn children when its effective grant allows it.
5. Parent/child is a relationship, not a reduced conversation type.
6. Hierarchy MUST be acyclic and MUST survive restart and projection rebuild.
7. Archiving and deleting MUST be explicit operator or authorised-agent actions.
8. Conversation state MUST be reconstructable without parsing natural-language transcript prose.

### 6.2 Workspace invariants

1. A conversation MUST be valid with an empty workspace.
2. Knowing a repository MUST NOT imply it is attached or present on disk.
3. Disk presence MUST be treated as cache/provisioning state, not authorisation.
4. Every attachment MUST record repository identity, exact revision, access mode, local logical path,
   provision state, and provenance.
5. Parallel conversations MUST NOT share a writable worktree.
6. The system MUST expose the current workspace manifest to the agent and clients structurally.
7. Prompt text MUST NOT be the source of truth for attached repositories.

### 6.3 Authority invariants

1. Tool availability and permission to execute a tool MUST be distinct.
2. A child MUST NOT receive more authority than its parent can delegate.
3. External side effects MUST be scoped, auditable, and idempotent.
4. Secrets MUST remain on the authorised execution boundary and MUST NOT be copied into prompts,
   transcripts, events, or public projections.
5. A model MAY request a grant but MUST NOT self-grant authority.

### 6.4 Presentation invariants

1. All conversations MUST use the same code-agent conversation shell, message timeline, composer,
   status model, activity primitives, and recovery behaviour.
2. Behavioural prompts MUST NOT select a separate frontend implementation.
3. Intent and outcome MUST appear before transport detail.
4. Runtime/provider events MUST be hidden unless they become a semantic activity or the operator
   explicitly opens diagnostics.
5. The UI MUST distinguish conversation, turn, child, goal, workspace, and execution-lease state.

## 7. Domain Classification

| Subdomain                                 | Classification                         | Rationale                                                                        |
| ----------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Durable agent conversations               | Core                                   | Defines the product and will evolve rapidly with usage.                          |
| Recursive orchestration and event wakeups | Core                                   | Primary differentiator and automation foundation.                                |
| Workspace/resource attachment graph       | Core                                   | Enables agents to move from knowledge to action across resources.                |
| Authority and delegated grants            | Core                                   | Determines safe autonomy and affects every action.                               |
| Semantic activity projection              | Core                                   | Makes distributed autonomy understandable and trustworthy.                       |
| Memory/provenance                         | Core                                   | Enables long-running context without ungrounded prompt blobs.                    |
| Fleet scheduling and execution leasing    | Supporting                             | Required infrastructure; policies evolve but do not define the user abstraction. |
| Provider adapters                         | Generic with implementation volatility | Provider behaviour is external and multiple implementations must coexist.        |
| Git/worktree provisioning                 | Supporting                             | Essential implementation capability with stable functional purpose.              |
| Cockpit rendering                         | Supporting                             | Projects the core domain without owning it.                                      |
| Authentication, storage, transport        | Generic                                | Solved infrastructure concerns behind explicit contracts.                        |

## 8. Conversation State Model

### 8.1 Persisted lifecycle

The persisted lifecycle is intentionally small:

```text
open <-> archived -> deleting -> deleted
```

- `open`: the conversation is available for turns, subscriptions, and child work.
- `archived`: reversible hidden state. No data or workspace is reclaimed merely by archiving.
- `deleting`: tombstoned while owned resources are reclaimed asynchronously.
- `deleted`: no longer addressable except through audit/tombstone policy.

There is no `completed`, `failed`, or `stopped` conversation lifecycle state.

Lifecycle policy is explicit:

- Archived conversations do not accept human/agent turns, create children, or wake from events
  unless first unarchived by an authorised command. A subscription may request authorised automatic
  unarchive, but this is opt-in and audited.
- Archiving a parent does not silently change children; the caller must choose a hierarchy policy.
- Restoring a parent restores only that parent. Descendants remain in their current lifecycle state.
- A conversation has one canonical parent and cannot cross project/tenant boundaries. Detaching or
  reparenting is an explicit version-checked command.
- Conversations do not move between projects in v2. A future move is an audited copy/re-scope
  operation because knowledge, grants, retention, and resource visibility can change.
- `blocked`, `paused`, and all waiting/working labels are derived operational facts, not persisted
  conversation lifecycle. Operator pause is represented by pausing turns/subscriptions/automations.
- “Never ends” means provider/session/work completion cannot terminate it; explicit deletion,
  organisation deletion, lawful retention, or disaster recovery can make it unavailable.

### 8.2 Derived operational state

Clients derive one operational state from durable turn, child, input, approval, goal, and lease
state. Jarvis MUST publish the derived state to prevent clients duplicating the algorithm.

| State                  | Meaning                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `idle`                 | Open and ready for another turn; no current work.                                     |
| `starting`             | Resolving authority, worker, provider, or workspace for a turn.                       |
| `working`              | A turn is actively executing.                                                         |
| `waiting_for_input`    | Operator input is required.                                                           |
| `waiting_for_approval` | A grant/approval decision is required.                                                |
| `waiting_for_children` | A continuation is subscribed to unfinished children.                                  |
| `joining`              | Child results are being read, reconciled, or verified.                                |
| `waiting_for_event`    | A durable event subscription is armed and no turn is running.                         |
| `blocked`              | Progress cannot continue without external state change; reason is structured.         |
| `degraded`             | Conversation remains usable but a non-fatal resource/provider condition exists.       |
| `paused`               | Automatic work is intentionally suspended; human inspection/unpause remains possible. |
| `archived`             | Persisted lifecycle is archived.                                                      |

Priority when multiple facts apply:

```text
archived > paused > waiting_for_approval > waiting_for_input > joining > working > starting
         > waiting_for_children > blocked > degraded > waiting_for_event > idle
```

### 8.3 Turn lifecycle

```text
requested -> preparing -> running -> waiting -> completed
                                   \-> failed
                                   \-> cancelled
```

`waiting` MUST include a structured reason: provider, input, approval, child, external event,
backoff, or capacity. A completed/failed/cancelled turn returns the conversation to another derived
operational state; it never terminates the conversation.

### 8.3.1 Turn concurrency and steering

- A conversation has one mutating foreground turn at a time. Background children and subscriptions
  may run concurrently because they are separate conversations/records.
- A new human message during a running turn defaults to a **steer** when the provider supports it;
  otherwise it is queued ahead of automatic continuations. The UI makes steer, queue, and interrupt
  explicit when more than one is safe.
- A user turn always has priority over an unclaimed automatic wake. If a wake is already claimed,
  the user may steer/interrupt it; neither input may disappear behind the other.
- Turn submission requires an idempotency key. Duplicate requests return the original turn.
- Failed turns are immutable attempts. Resume creates a successor attempt under the same logical
  turn when safe, with an incremented attempt number and preserved partial output.
- Cancellation requests provider/tool cancellation, releases the execution lease, and records any
  effect whose outcome is uncertain. Children continue by default; cascade cancellation is an
  explicit policy because children are durable conversations.
- Turns have configurable deadline and heartbeat requirements. A missing heartbeat expires the
  lease, not the conversation, and fencing rejects late writes from obsolete workers.
- Provider event identifiers and aggregate sequence numbers deduplicate replayed/out-of-order
  events. Context compaction is an activity/context revision inside the same turn, not a new turn.

### 8.4 Execution lease lifecycle

```text
requested -> assigned -> connecting -> active -> released
                               \-> lost -> reassigned
```

An execution lease binds one turn to a worker, provider adapter, and provider session. It is
replaceable. Losing it MUST preserve the conversation and committed turn events. A retry MUST use
the same logical turn id and idempotency context, or create an explicit successor attempt.

## 9. Prompt and Context Composition

There are no persisted behavioural roles. Prompt composition has ordered layers:

1. **Platform invariants**: tool semantics, safety rules, durable-conversation behaviour, and event
   protocol. Versioned by Jarvis.
2. **Effective authority**: capabilities available, grants active, prohibited actions, budgets, and
   approval requirements.
3. **Conversation identity**: conversation id, parent id, project/resource scopes, current goal, and
   operational state.
4. **Project knowledge**: project registry, repository catalogue, durable decisions, and relevant
   memory retrievals with provenance.
5. **Workspace manifest**: attached resources, exact revisions, modes, paths, dirty state, and
   provisioning state.
6. **Event context**: the event that woke the conversation, dedupe key, and required continuation.
7. **User or parent instruction**: the actual objective for this turn.

“Act as an orchestrator,” “review this PR,” and “implement these changes” belong to layer 7 or a
reusable prompt template. They MUST NOT change the conversation schema or UI route.

Prompt precedence is deterministic:

1. Immutable platform safety and domain invariants.
2. Organisation/project policy and the effective grant; neither a user nor parent may widen it.
3. Current operator instruction for this conversation.
4. Automation trigger or parent delegation, limited to the child/task scope.
5. Project guidance, remembered preferences, and retrieved working context.
6. Untrusted content from repositories, PRs, webpages, tools, events, and children.

Lower layers may refine but never contradict higher layers. Conflicts are surfaced as structured
input/approval requests rather than silently resolved. Repository files, PR text, webpages, event
payloads, tool output, and child results MUST be labelled as untrusted data, never instructions that
can expand authority or rewrite platform policy.

Child context is an explicit task package: objective, acceptance criteria, selected context/evidence,
resource hints or pinned attachments, delegated grants, budget, expected result schema, and parent
references. Full parent transcript inheritance is opt-in, visibility-scoped, and normally replaced
by selected messages plus a provenance-bearing summary.

Context budgeting MUST retain, in order: platform/authority invariants, current request, active goal
and acceptance criteria, exact workspace manifest, wake/delegation package, relevant verified memory,
then older transcript. Stale resource facts are excluded or visibly labelled. Provider adapters may
change syntax but MUST preserve semantic layers and record the platform prompt version, provider
adapter version, included source ids, exclusions, and token budget in the redacted receipt.

Jarvis MUST expose a redacted prompt-composition receipt containing layer versions and source ids,
not secrets or full private memory, so behaviour can be diagnosed.

## 10. Goals and Responsibility

A conversation MAY own zero or more goals and MUST have at most one active goal unless it explicitly
declares parallel goals.

```ts
interface ConversationGoal {
  goalId: string;
  conversationId: string;
  objective: string;
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: string[];
  scope: ResourceScope[];
  priority: number;
  owner: PrincipalRef;
  plan: GoalStep[];
  status: "active" | "waiting" | "blocked" | "achieved" | "abandoned";
  evidence: EvidenceRef[];
  blockers: Blocker[];
  nextAction: string | null;
  budgetPolicyId: string | null;
  deadline: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
```

Requirements:

- A goal MUST remain separate from transcript prose.
- Goal changes MUST be evented and attributable.
- Goal and plan revisions are immutable; the current goal points at the active plan revision.
- Acceptance criteria MUST support machine checks and human assertions.
- `achieved` requires evidence or an explicit operator override.
- A verification waiver MUST record who waived which criterion and why; it is not equivalent to
  passing verification.
- A conversation may continue after a goal is achieved and may accept a new goal.
- Child goals MUST reference the parent goal and describe the delegated slice.
- Parent progress is derived from structured child goal/result state, never child transcript prose.
- An agent MAY propose/create a goal from informal discussion. Expanding scope, raising cost/deadline,
  discarding acceptance criteria, or declaring a conflicting goal requires the configured approval.
- Completed goals MAY be reopened with a new revision and reason. Parallel active goals require
  explicit priorities and independent budgets so one cannot starve the other silently.
- Abandoning a goal MUST NOT archive the conversation.

## 11. Resource Catalogue and Workspace Graph

### 11.1 Known versus attached resources

The system distinguishes:

- **Known resource**: visible through project, memory, connector, or operator configuration.
- **Authorised resource**: current principal and at least one eligible worker may access it.
- **Attachable resource**: authorised and provisionable under current policy.
- **Attached resource**: materialised in this conversation's workspace manifest.

The agent MUST be told which resources are known, attached, unavailable, stale, or still being
resolved. It MUST be able to ask for details without receiving an unbounded catalogue in every
prompt.

### 11.2 Workspace model

Each conversation owns one durable logical workspace. Physical materialisation MAY move between
workers, but the logical manifest remains stable.

```ts
interface ConversationWorkspace {
  workspaceId: string;
  conversationId: string;
  generation: number;
  state: "empty" | "provisioning" | "ready" | "degraded" | "releasing";
  attachments: ResourceAttachment[];
  activeLeaseId: string | null;
  preferredWorkerId: string | null;
  persistencePolicy: "durable" | "ephemeral_after_goal";
  diskBudgetBytes: number;
  environmentSpecRef: string | null;
  secretBindingRefs: string[];
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Workspace generation increments on a structural attachment change. Turns record the generation they
observed.

One logical workspace per conversation is the v2 rule. Named execution environments may be added
inside it, but multiple competing workspace truths are not. The logical manifest persists without a
worker; physical materialisations are leased caches. Workspace GC is quota/retention driven and MUST
capture or explicitly discard dirty state before reclaiming it.

### 11.3 Repository attachment

```ts
interface RepositoryAttachment {
  attachmentId: string;
  resourceKind: "git_repository";
  repositoryId: string;
  canonicalRemote: string;
  logicalPath: string;
  accessMode: "read_only" | "read_write";
  requestedRef: string;
  resolvedCommitSha: string;
  branch: string | null;
  worktreeId: string;
  provisionState: "resolving_access" | "fetching" | "creating_worktree" | "ready" | "failed";
  dirtyState: "clean" | "modified" | "conflicted" | "unknown";
  origin: "operator" | "agent" | "parent_hint" | "automation";
  materialisationWorkerId: string | null;
  materialisationGeneration: number;
  trustClassification: "trusted" | "untrusted" | "quarantined";
  attachedAt: string;
  lastVerifiedAt: string;
}
```

### 11.4 Repository tools

All agents with appropriate grants receive the same tools:

- `list_known_resources(query?, project_id?)`
- `inspect_resource(resource_id)`
- `list_workspace_attachments()`
- `attach_repository(repository_id, ref?, access_mode?, logical_path?)`
- `refresh_repository(attachment_id, ref?)`
- `detach_repository(attachment_id, disposition)`
- `create_change_set(attachment_ids[], objective)`
- `inspect_change_set(change_set_id)`
- `land_change_set(change_set_id, landing_policy)`

An agent MAY attach repositories based on need. The user need not choose a repository before
conversation creation.

The repository catalogue MUST record a stable repository id, host/owner/name, fetch/push identities,
default branch, access/trust classification, related projects/resources, allowed operations, local
mirror candidates, and last refresh. It MUST support non-GitHub Git hosts. Forks, submodules, LFS,
monorepos, and private repositories are explicit capabilities/policies, not guessed from paths.

`attach_repository` resolves access, fetches/clones or reuses an authorised mirror, resolves the
requested ref to an immutable commit, and creates a checkout/worktree. It MUST be idempotent and
truthful about partial state. Unlisted repositories require resource-discovery authority and, when
policy requires, approval before catalogue insertion/attachment. Authentication is worker-scoped
and opaque; credentials never become attachment data.

### 11.5 Multi-repository behaviour

- A workspace MAY contain multiple repositories at stable, non-overlapping logical paths.
- The engine cwd SHOULD be the workspace root so every attached repository is discoverable.
- The system prompt MUST include the manifest summary and the tool MUST return the complete manifest.
- Cross-repository work MUST use a `change_set` that records per-repository base SHA, branch,
  commits, verification, and landing status.
- Cross-repository landing is not globally atomic. The change set MUST record ordering,
  dependencies, partial landing, and compensation/recovery instructions.
- Tests MAY run at workspace root and MUST record which attachment generations they validated.
- Incompatible toolchains use attachment-scoped environment specs or isolated commands while the
  workspace remains one logical graph.
- A goal MAY own multiple linked PRs/branches through one change set. Per-repository policy decides
  whether Cockpit may commit to main while Jarvis requires a PR; the agent MUST obey each repository's
  current policy rather than applying one policy globally.
- Change sets record dependency/landing order, compatibility expectations, cross-repo tests, linked
  PRs/releases, rollback/forward-fix plan, and reconciliation after merge/rebase/head changes.
- Distributed repository changes are never described as atomic. If one PR lands and another fails,
  the change set becomes `partially_landed` and blocks blind release until reconciled.

### 11.6 Child workspace isolation

- Each child owns its own logical workspace.
- A parent may pass repository hints, exact SHAs, or a change-set snapshot.
- A child decides what to attach unless the delegated instruction requires a pinned attachment.
- Writable child attachments MUST use independent worktrees/branches.
- Mirrors/object stores MAY be shared as caches; mutable working directories MUST NOT be shared.
- Child results MUST report the attachment ids and SHAs used.
- Read-only mirrors may be shared, but a child receives its own attachment records and materialisation
  generation. Children may attach additional authorised repositories and retain their workspace for
  future turns until explicit cleanup/retention applies.

## 12. Recursive Conversation Hierarchy

### 12.1 Tree rules

- `parent_conversation_id` is optional.
- Root conversations have no parent.
- A conversation can have any number of children subject to capacity, budget, and policy.
- There is no semantic depth limit. Implementations MAY enforce configurable protection against
  runaway recursion, but MUST report it as quota/policy rather than redefining child capability.
- Cycles MUST be rejected transactionally.
- Sibling order is creation order unless explicitly ranked.

### 12.2 Spawn contract

```ts
interface SpawnConversationRequest {
  parentConversationId: string;
  initiatingTurnId: string;
  instruction: string;
  title?: string;
  modelPreference?: ModelPreference;
  resourceHints?: ResourceHint[];
  delegatedGrantIds?: string[];
  goalSlice?: DelegatedGoal;
  workspacePolicy?: "independent" | "snapshot_parent" | "empty";
  budget?: DelegatedBudget;
  deadline?: string;
  expectedResultSchema?: JsonSchemaRef;
  cancellationPolicy?: "independent" | "cancel_with_parent_turn";
  completionSubscription?: CompletionSubscriptionRequest;
  idempotencyKey: string;
}
```

Spawn returns a durable child conversation immediately. Worker/provider provisioning happens
asynchronously and MUST NOT delay hierarchy visibility.

Operational protection is configurable by project: maximum active children, total descendants,
concurrent workers, automatic turns, wall time, tokens/cost, tool/network calls, external actions,
and workspace disk. Budgets are reserved from and reported to the parent; exhaustion creates a
structured waiting/blocker state. There is no hard-coded semantic depth at which children stop being
full conversations.

### 12.3 Parent-child communication

Parents interact with children through stable Jarvis tools, not transcript scraping:

- `spawn_child_conversation`
- `send_child_turn`
- `request_child_status`
- `read_child_result`
- `watch_conversations`
- `cancel_child_turn`
- `archive_child_conversation`
- `detach_child_conversation`

Direct sibling messaging is not a v2 primitive: a sibling sends through the parent or an explicitly
shared event/resource channel so authority and provenance remain clear. Reparent/detach requires
project-compatible visibility and explicit authority.

Child results use a structured envelope containing summary, evidence, artifacts, goal outcome,
workspace revisions, errors, and a human-readable response.

### 12.4 Join semantics

- A watch records the expected conversation ids and completion predicate.
- Completion events are at-least-once; the logical continuation is idempotent.
- A continuation MUST be claimed with a renewable lease before a turn is created.
- Exactly one successful continuation turn may be committed for one watch generation.
- Failed continuation attempts remain retryable without spawning replacement children implicitly.
- A parent MUST be able to wait for all, any, quorum, or a predicate over child outcomes.
- Watches are registered transactionally with child creation or replay terminal state immediately,
  so completion between spawn and watch registration cannot be missed.
- Join policy defines deadline, best-effort/required children, partial-failure behaviour, retry or
  replacement limits, and whether the parent continues after quorum. Replacement children are new
  conversations linked to the failed attempt and never silently substituted.
- A finished child remains a usable conversation. A parent follow-up is a normal new child turn; the
  original result envelope remains immutable and a later envelope supersedes it.
- Joining is normal agent work. There is no separate join service that invents conclusions.

### 12.5 Archive/delete hierarchy policy

Archiving a parent with children requires an explicit policy:

- `reparent_children`: archive parent and promote its direct children to roots;
- `archive_subtree`: archive descendants child-first, then the parent;
- `cancel`: no mutation.

Cockpit MUST ask the operator which policy to apply. An agent may choose only when its grant and the
current automation policy explicitly allow it. Delete follows the same explicit policy and returns a
reclamation plan before execution.

Archived parents may have active children only after `reparent_children`; `archive_subtree` first
cancels or waits according to the chosen per-child policy. Delete is refused while descendants remain
attached unless a verified cascade/reparent plan is supplied. Child transcript visibility is the
intersection of project policy, viewer identity, and delegated visibility—not implied by seeing the
parent row.

## 13. Capabilities, Grants, and Budgets

### 13.1 Capability catalogue

The runtime may support capabilities including:

- conversation read/write and child management;
- memory retrieval and curation;
- repository catalogue and attachment;
- filesystem read/write;
- command execution;
- browser/network access;
- GitHub read, review, branch, PR, merge, and release operations;
- deployment and fleet operations;
- document, email, calendar, messaging, or future connector actions;
- secret use through opaque handles;
- scheduling and event subscription.

Capabilities are runtime features. Grants are authority.

### 13.2 Grant shape

```ts
interface AuthorityGrant {
  grantId: string;
  subject: PrincipalRef;
  conversationId: string;
  capability: string;
  resourceScope: ResourceScope;
  actionScope: string[];
  constraints: GrantConstraint[];
  delegation: "none" | "subset";
  environment: "local" | "dogfood" | "production" | string;
  nonce: string;
  grantVersion: number;
  signature: string;
  issuedBy: PrincipalRef;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}
```

### 13.3 Grant rules

- Grants MUST be deny-by-default and resource scoped.
- Read grants SHOULD be broader than mutation grants.
- A child receives only explicitly delegated subsets.
- Time, token, cost, concurrency, side-effect count, and environment budgets MAY constrain a grant.
- A grant request MUST explain the intended action, target, consequence, and alternatives.
- Approval decisions MUST be durable and replay-safe.
- Revocation MUST stop future use; already committed effects remain audited.
- Destructive, production, merge, release, secret, and external-message capabilities SHOULD require
  explicit policy even if the tool exists.
- New conversations receive only the project's baseline read/discussion grant. GitHub read, comment,
  push, merge, release, deployment, secret use, browser/network domains, and fleet administration are
  separate capabilities. “Remember approval” MUST name its lifetime: action, turn, conversation,
  project, or organisation.
- Enforcement occurs both when Jarvis authorises the orchestration command and when the worker/tool
  executes it. Signed grants are audience-, nonce-, version-, resource-, environment-, and expiry-
  bound to prevent confused-deputy use and replay.
- A worker move MUST re-evaluate technical credentials and policy without widening the grant. If the
  selected worker lacks the required identity, the turn waits or reschedules; it MUST NOT silently
  fall back to a different API identity.
- Codex/Claude local subscription authentication and API-key authentication are distinct credential
  classes. Provider policy chooses which is allowed; API keys are never an implicit fallback for a
  subscription-required task.
- Revocation is checked before each side effect and long-running tools receive cancellation where
  supported. An in-flight ambiguous effect enters reconciliation, not automatic retry.

### 13.4 Idempotent external actions

Every external mutation MUST accept an idempotency key derived from stable logical intent, not a
provider call id. The action receipt records:

- idempotency key;
- target and immutable revision where relevant;
- acting principal and worker identity;
- grant id;
- request hash;
- provider response reference;
- committed outcome;
- retry/compensation status.

If a client/tool times out, the action becomes `outcome_unknown`. Jarvis MUST query/reconcile the
immutable target before retrying. Tool transport deadlines must exceed or coordinate with server
action deadlines so a slow success cannot appear as a fresh request. This applies to children,
comments, reviews, branches, pushes, PRs, merges, releases, deployments, tickets, and messages.

For PR review publication the receipt includes repository, PR, verified head SHA, side/path/line,
severity title (`[P1]`, `[P2]`, or `[P3]`), suggestion payload validation, remote comment ids, posted
count, and summary-only findings. A changed head invalidates unresolved anchors until revalidated.

## 14. Memory and Provenance

Memory is a durable evidence system, not an unlabelled prompt blob.

```ts
interface MemoryAssertion {
  assertionId: string;
  scope: ResourceScope;
  content: string;
  kind: "fact" | "decision" | "preference" | "procedure" | "warning";
  sourceRefs: EvidenceRef[];
  confidence: number;
  validFrom: string;
  validUntil: string | null;
  lastVerifiedAt: string | null;
  supersedes: string[];
  supersededBy: string | null;
  visibility: "private" | "project" | "conversation" | "public";
  sensitivity: "normal" | "confidential" | "secret_prohibited";
  trust: "verified" | "inferred" | "untrusted";
  createdBy: PrincipalRef;
  revision: number;
}
```

Requirements:

- Retrieval MUST be scoped and relevance bounded.
- Prompt composition MUST include source references and freshness metadata.
- Agents MAY challenge, correct, or supersede memory through audited tools.
- Conflicting assertions MUST remain visible until resolved; the latest write does not silently win.
- Private memory MUST NOT enter public artifacts or logs without an authorised explicit action.
- Child conversations receive only memory permitted by their delegated scope.
- Automatic memory writes create candidates. Project-shared policy/decisions require explicit
  authority or configured approval; untrusted repository/web/child text cannot promote itself.
- Conversation-private working knowledge, project-shared assertions, and organisation/global policy
  are separate scopes. Secret/credential values are prohibited from durable semantic memory.
- Users can inspect, correct, supersede, export, and delete assertions. Retrieval ranking considers
  scope, relevance, provenance, trust, freshness, and context budget; “no representation recorded”
  is distinct from a verified empty/negative fact.

## 15. Events, Wakeups, and Automations

### 15.1 Event envelope

```ts
interface AgentDomainEvent {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  generation: number;
  occurredAt: string;
  schemaVersion: number;
  source: PrincipalRef;
  subject: ResourceRef;
  trust: "internal" | "authenticated_external" | "untrusted_external";
  actor: PrincipalRef;
  correlationId: string;
  causationId: string | null;
  dedupeKey: string | null;
  publicPayload: JsonObject;
  privatePayloadRef: string | null;
  deliveryAttempt: number;
}
```

Events are immutable and ordered per aggregate, not globally.

### 15.2 Durable subscriptions

```ts
interface ConversationSubscription {
  subscriptionId: string;
  conversationId: string;
  eventFilter: EventFilter;
  wakeInstruction: string;
  policy: "once" | "until_cancelled" | "until_goal_terminal";
  debounceWindowMs: number;
  expiresAt: string | null;
  maxAutomaticTurns: number;
  status: "armed" | "claimed" | "paused" | "completed" | "cancelled";
  lastEventId: string | null;
  idempotencyNamespace: string;
}
```

Supported sources SHOULD include child completion, CI state, PR changes/comments/reviews, branch
updates, deployment state, schedules, fleet health, operator messages, and connector events.

### 15.3 Wakeup semantics

- Matching delivery is at-least-once.
- Durable events use an outbox with replay; state transition and event publication are atomic or
  repaired by reconciliation. Ordering is guaranteed per aggregate/subject stream, not globally;
  consumers tolerate clock skew and out-of-order external sources.
- Subscription claim uses a lease and dedupe key.
- Multiple events within the debounce window MAY become one turn with a structured batch.
- Wakeups MUST respect conversation lifecycle, authority, budget, and concurrency policy.
- Archived conversations do not wake unless the subscription explicitly permits unarchive and has
  appropriate authority.
- Repeated failure uses bounded exponential backoff and eventually creates a structured blocker.
- Wakeups MUST NOT create an unbounded self-trigger loop; causation chains and recursion budgets are
  enforced.
- Authenticated external sources verify signatures/identity before matching. Untrusted payload text
  is data only. Expired/cancelled subscriptions ignore late events and retain an audit receipt.
- After bounded retries, delivery enters a dead-letter/blocked queue visible to operators without
  adding raw transport noise to the transcript.

### 15.4 Automation templates

An automation template is configuration that creates or wakes normal conversations. It does not
execute agent work itself.

```ts
interface AutomationTemplate {
  templateId: string;
  trigger: EventFilter | Schedule;
  conversationPolicy: "create" | "reuse_by_key" | "wake_existing";
  conversationKeyTemplate: string;
  initialInstruction: string;
  projectScope: string[];
  grantPolicyId: string;
  budgetPolicyId: string;
  modelPolicyId: string;
  version: number;
  owner: PrincipalRef;
  dedupeWindowMs: number;
  maxUnattendedTurns: number;
  failurePolicy: "pause" | "quarantine" | "notify";
  enabled: boolean;
}
```

The PR review flow becomes one template: create/reuse a conversation, instruct it to obtain two
independent reviews, watch children, reconcile, publish under a scoped grant, and remain available
for follow-up.

Templates support dry-run, pause, versioned migration, credential-health checks, and a human override.
The default identity policy is one reusable conversation per stable tracked object (for example,
repository+PR number), with dedupe/coalescing for bursts. A template may create children only within
its delegated budget/grants. Causation-chain detection prevents automations/conversations from waking
one another indefinitely.

## 16. Fleet and Provider Continuity

### 16.1 Scheduling inputs

Jarvis chooses an execution lease using:

- provider/model support and local subscription authentication;
- effective grant and worker-owner acceptance policy;
- resource access and workspace locality;
- ability to materialise required attachments;
- capacity, queue, health, network, disk, and cost;
- data residency and secret locality;
- preferred/previous worker as a soft affinity, not a correctness requirement.

Worker eligibility is protocol-versioned. Brain, Cockpit, and worker advertise supported contract
ranges; scheduling rejects incompatible workers and allows adjacent versions only through tested
compatibility adapters. Provider auth health is probed before assignment, including the exact local
subscription identity required by policy.

### 16.2 Resume policy

For every new turn Jarvis chooses, in order:

1. Resume the existing provider session when valid and healthy.
2. Start a replacement provider session on the same worker and reconstruct context.
3. Rehydrate/migrate the logical workspace on another eligible worker and start a new session.
4. Return a structured blocked state with remediation when no eligible worker exists.

Provider transcript/session resume is an optimisation. Durable conversation state, memory, goals,
workspace manifests, and semantic activities are sufficient to reconstruct a turn.

Provider/model may change between turns and, after a failed attempt, within a logical turn if policy
allows. The prompt receipt and turn attempt record the change. Translation uses durable messages,
summaries, tools, workspace manifests, and evidence—not provider-private session state. Unsupported
capabilities are reported structurally and trigger reschedule, approval, or a blocker; adapters MUST
meet behavioural contract fixtures for Codex and Claude even when their raw event schemas differ.
Rate limits, quota, cost, and model unavailability are scheduler inputs with explicit fallback policy,
never silent substitution.

### 16.3 Workspace mobility

- Mirrors/caches MAY reduce transfer time but are never authority.
- Dirty writable attachments require commit, patch/artifact capture, or an explicit migration plan.
- A lease loss MUST preserve the last committed attachment manifest and change-set evidence.
- Workspace movement MUST be visible as one semantic activity, with detailed transfer logs hidden in
  diagnostics.

## 17. Semantic Activity Model

Runtime events are projected into semantic activities before reaching normal UI.

```ts
interface ConversationActivity {
  activityId: string;
  conversationId: string;
  turnId: string | null;
  kind: string;
  status: "requested" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  title: string;
  summary: string | null;
  toolName: string | null;
  sanitizedInput: JsonObject | null;
  sanitizedResult: JsonObject | null;
  parentActivityId: string | null;
  correlationId: string;
  retryCount: number;
  artifactRefs: ArtifactRef[];
  detailRef: string | null;
  relatedConversationIds: string[];
  relatedResourceIds: string[];
  startedAt: string;
  completedAt: string | null;
  error: PublicError | null;
}
```

Examples:

- `repository.attached`: “Attached jarvis-cockpit at 885daad6.”
- `file.read`: “Read ProjectConversationView.tsx.”
- `search.completed`: “Searched for conversation lifecycle.”
- `child.spawned`: “Started Claude review.”
- `children.waiting`: “Waiting for 2 child reviews.”
- `children.joined`: “Joined 2 review results.”
- `github.review.published`: “Published 2 inline comments.”
- `workspace.migrated`: “Moved workspace to an eligible worker.”
- `goal.blocked`: “Waiting for repository access on an eligible worker.”

Provider logs, raw JSON-RPC, provisioning heartbeats, internal retries, token accounting, and session
ids belong to diagnostics unless they change user action or outcome.

The semantic vocabulary and grouping rules are provider-neutral. Reads/searches may collapse into
an expandable activity group; edits show reviewable diffs; spawn/watch/join use a dedicated lifecycle
card with requested, provisioning, running, waiting, completed, failed, and cancelled states. Large
or sensitive inputs/results are summarised and linked to redacted details. Replay preserves stable
activity identity/order. Context compaction is one quiet semantic notice, not hundreds of log rows.

## 18. Unified Cockpit Experience

### 18.1 One route and presentation stack

All agent conversations MUST render through the standard code-agent architecture:

```text
AgentConversationRoute
  -> ChatView
  -> MessagesTimeline
  -> ChatComposer
  -> ConversationContextPanel
```

`ProjectConversationView` MUST be retired as an independent conversation implementation. Jarvis
data is adapted into the same client-runtime conversation contract before rendering.

### 18.2 Left sidebar

- Shows project/resource grouping and recursive parent/child hierarchy.
- Children appear immediately after durable creation, before worker assignment.
- Rows show model/provider only as metadata, never as conversation type.
- Rows show derived operational state, not provider session terminal state.
- Every conversation supports rename, archive, and appropriate child actions.
- Archiving a parent with descendants asks for reparent or archive-subtree policy.
- Titles may be manually entered or AI-generated/regenerated from visible conversation context. A
  manual title is locked until the user explicitly requests regeneration; generated titles record
  model/version and never change automatically after first meaningful title without policy.
- Search/filter spans recursive hierarchy and exposes unseen child results, pending approvals,
  blocked work, and active automation. Parent/child navigation preserves drafts and scroll positions.

### 18.3 Conversation timeline

- Contains operator/agent conversation and semantic tool activity in chronological order.
- Generated automation/system instructions display concise operator intent with full instructions
  behind disclosure.
- Child lifecycle state is not injected as synthetic prose.
- Spawn/watch ids and transport acknowledgements are hidden in normal reading mode.
- Tool calls follow the native code-agent quality bar: semantic icon, action title, useful preview,
  correlated result, inline diff/artifact where relevant, and progressive disclosure.

### 18.4 Composer

- Exactly the same composer component, store, send path, attachment model, focus behaviour, keyboard
  handling, pending-input handling, approval handling, interruption, and error recovery for every
  conversation.
- The composer does not use `routeKind="draft"`, `isServerThread=false`, no-op callbacks, or a
  separate local turn state for Jarvis conversations.
- Repository selection is optional context, not a prerequisite.
- The agent may attach repositories through tools; the operator may also attach/detach through the
  context panel.

### 18.5 Right context sidebar

Sections appear only when relevant:

1. Active goal and acceptance state.
2. Orchestration/child progress.
3. Workspace and attached resources.
4. Known resources available to attach.
5. Effective authority and pending grant requests.
6. Project scope.
7. Memory assertions and freshness.
8. Artifacts/evidence.

The panel is state, not transcript. It remains stable while the conversation scrolls.

System/automation/delegation instructions render as compact disclosure cards, not giant user message
bubbles. Child results are linked with a short structured summary; full content remains in the child
unless explicitly copied. The empty state explains that no repository is attached and offers known
resources without implying a required selection. Mobile/responsive layouts keep the same runtime and
move context/tree into drawers—never a reduced chat implementation.

### 18.6 Diagnostics

Diagnostics are a separate explicit mode containing:

- provider sessions and execution leases;
- worker routing decisions;
- raw runtime events and logs;
- retry/backoff history;
- prompt-composition receipts;
- tool/grant receipts;
- correlation and causation ids.

Diagnostics MUST be redacted and MUST NOT be the default Work Log.

## 19. Public API and Contract Surface

Paths are illustrative v2 resources; exact HTTP layout may follow existing Jarvis conventions. The
domain semantics are normative.

### 19.1 Conversation operations

- `POST /v2/conversations`
- `GET /v2/conversations`
- `GET /v2/conversations/{conversation_id}`
- `PATCH /v2/conversations/{conversation_id}`
- `POST /v2/conversations/{conversation_id}/turns`
- `POST /v2/conversations/{conversation_id}/archive`
- `POST /v2/conversations/{conversation_id}/unarchive`
- `DELETE /v2/conversations/{conversation_id}`
- `GET /v2/conversations/{conversation_id}/events`
- `GET /v2/conversations/{conversation_id}/activities`
- `GET /v2/conversations/{conversation_id}/children`
- `POST /v2/conversations/{conversation_id}/children`

### 19.2 Goal operations

- `GET/POST /v2/conversations/{conversation_id}/goals`
- `GET/PATCH /v2/conversations/{conversation_id}/goals/{goal_id}`
- `POST /v2/conversations/{conversation_id}/goals/{goal_id}/evidence`
- `POST /v2/conversations/{conversation_id}/goals/{goal_id}/abandon`

### 19.3 Workspace operations

- `GET /v2/conversations/{conversation_id}/workspace`
- `GET /v2/conversations/{conversation_id}/resources`
- `POST /v2/conversations/{conversation_id}/workspace/attachments`
- `PATCH /v2/conversations/{conversation_id}/workspace/attachments/{attachment_id}`
- `DELETE /v2/conversations/{conversation_id}/workspace/attachments/{attachment_id}`
- `GET/POST /v2/conversations/{conversation_id}/change-sets`
- `POST /v2/conversations/{conversation_id}/change-sets/{change_set_id}/land`

### 19.4 Subscription and automation operations

- `GET/POST /v2/conversations/{conversation_id}/subscriptions`
- `PATCH/DELETE /v2/conversations/{conversation_id}/subscriptions/{subscription_id}`
- `GET/POST /v2/automation-templates`
- `PATCH/DELETE /v2/automation-templates/{template_id}`

### 19.5 Grant operations

- `GET /v2/conversations/{conversation_id}/grants`
- `POST /v2/conversations/{conversation_id}/grant-requests`
- `POST /v2/grant-requests/{request_id}/resolve`
- `POST /v2/grants/{grant_id}/revoke`

### 19.6 Streaming

Clients receive one resumable ordered stream containing conversation domain events and semantic
activities. Requirements:

- cursor resume;
- snapshot then delta;
- per-conversation generation/order;
- dedupe by event id;
- reconnect without duplicate visible messages or children;
- forward-compatible event types;
- explicit redaction/public projection boundary.

Polling is a fallback only, not the target consistency mechanism.

All mutation commands require an idempotency key and expected aggregate revision. Conflicts return a
structured code and current revision. Public errors use stable codes such as `REVISION_CONFLICT`,
`TURN_ALREADY_ACTIVE`, `CONVERSATION_ARCHIVED`, `GRANT_REQUIRED`, `WORKER_INELIGIBLE`,
`ATTACHMENT_REF_NOT_FOUND`, and `EXTERNAL_OUTCOME_UNKNOWN`; retry logic MUST NOT match human error
strings. Queries are paginated, large artifacts use immutable references, timestamps are UTC RFC 3339,
and unknown optional fields/event types are preserved or safely ignored per schema version.

The schema source of truth produces or validates Python and TypeScript contracts plus golden fixtures.
The orchestrator/tool contract MUST NOT be hand-declared independently in API, bridge, worker, and UI.
WebSocket/SSE resume uses cursor + snapshot generation and reports a resync requirement when history
has expired rather than guessing from a partial stream.

## 20. Module Architecture and Ownership

### 20.1 Jarvis modules

| Module                       | Responsibility                                                            | Encapsulated knowledge                                    |
| ---------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Conversation Aggregate       | Durable lifecycle, hierarchy, turns, goals, subscriptions, derived state. | Conversation invariants and state transitions.            |
| Authority Service            | Grants, delegation, approval, budgets, audit.                             | Who may do what to which resources.                       |
| Resource Catalogue           | Known resources and access/provisionability.                              | Project membership and resource discovery.                |
| Workspace Service            | Logical manifests, attachments, change sets, mobility.                    | Resource materialisation and workspace generations.       |
| Execution Scheduler          | Worker/model/provider selection and leases.                               | Fleet capacity, locality, provider support, retry policy. |
| Provider Adapters            | Codex, Claude, and future provider protocol translation.                  | Provider-specific sessions and events.                    |
| Orchestration Tools          | Spawn, steer, watch, join, child result envelopes.                        | Recursive conversation coordination contract.             |
| Event and Automation Service | Domain event log, subscriptions, wakeups, templates.                      | Delivery, claims, dedupe, backoff, causation.             |
| Memory Service               | Scoped retrieval, assertions, provenance, correction.                     | Durable knowledge and visibility policy.                  |
| Activity Projector           | Semantic user-facing activities.                                          | Runtime-to-product presentation mapping.                  |
| Public API Projection        | Stable redacted contracts for all clients.                                | Versioning and public/private boundary.                   |

### 20.2 Cockpit modules

| Module                     | Responsibility                                                      | Encapsulated knowledge                                 |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Jarvis Client Adapter      | Translate Jarvis public v2 contracts into client-runtime contracts. | Network/version compatibility only.                    |
| Agent Conversation Runtime | One client state/store/action model for all conversations.          | Client-side reconciliation and optimistic state.       |
| Chat Presentation          | Shared ChatView, timeline, composer, activities.                    | Visual interaction language.                           |
| Conversation Tree          | Project grouping and recursive hierarchy.                           | Navigation, expansion, selection, archive choices.     |
| Context Panel              | Goal, orchestration, workspace, authority, memory, evidence.        | Stable contextual projection.                          |
| Diagnostics Surface        | Explicit technical inspection.                                      | Redacted runtime details and operator troubleshooting. |

### 20.3 Boundary rule

Cockpit may optimise presentation and local interaction state. It MUST NOT implement Jarvis domain
transitions or infer durable truth from prose. Jarvis public contracts MUST be sufficient for any
client to reproduce the same conversation, hierarchy, workspace, authority, goal, and activity
state.

## 21. Coupling Assessment

| Integration                                 | Strength                             | Distance                       | Volatility                        | Balanced?       | Required action                                                                               |
| ------------------------------------------- | ------------------------------------ | ------------------------------ | --------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Cockpit -> Jarvis conversation domain       | Contract                             | High, separate repos/processes | High/core                         | Yes             | Versioned public DTOs/events; no shared internal models.                                      |
| Conversation Aggregate -> Workspace Service | Model                                | Low, same runtime/team         | High/core                         | Yes             | Co-locate domain concepts and use explicit internal interfaces.                               |
| Conversation Aggregate -> Authority Service | Contract/model                       | Low                            | High/core                         | Yes             | Keep policy decisions inside Authority; aggregate stores grant refs.                          |
| Conversation Aggregate -> Event Service     | Contract                             | Low                            | High/core                         | Yes             | Transactional outbox/domain event interface.                                                  |
| Event Service -> Automation templates       | Model                                | Low                            | High/core                         | Yes             | Co-locate filter/wakeup semantics.                                                            |
| Scheduler -> provider adapters              | Contract                             | Low-to-medium                  | Generic implementation volatility | Yes             | Capability/lease contract hides provider sessions.                                            |
| Scheduler -> workers                        | Contract                             | High, network/process boundary | Medium                            | Yes             | Versioned worker protocol, leases, health and capacity DTOs.                                  |
| Workspace Service -> workers                | Contract                             | High                           | High/core                         | Yes if explicit | Commands/events for materialise, migrate, inspect, release; no shared filesystem assumptions. |
| Memory -> prompt composition                | Contract                             | Low                            | High/core                         | Yes             | Retrieval result with provenance; no direct database access.                                  |
| Runtime events -> Cockpit Work Log          | Functional today                     | High                           | High/core                         | No              | Activity Projector becomes the only normal UI feed; raw events diagnostic only.               |
| ProjectConversationView -> ChatView         | Duplicated functional coupling today | Low, same repo                 | High/core UI                      | No              | Delete the parallel view and adapt all data into one client runtime.                          |
| Prompt text -> workspace/authority truth    | Intrusive/implicit today             | Cross-boundary                 | High/core                         | No              | Structural manifests and grants; prompts are projections only.                                |

The design is acceptable only when the three unbalanced integrations are removed. Compatibility
adapters may exist temporarily but MUST have deletion criteria and telemetry.

## 22. Failure and Recovery Semantics

### 22.1 Provider/worker failure

- Preserve conversation and committed turn events.
- Mark the attempt/lease failed, not the conversation.
- Reassign according to resume policy.
- Avoid duplicate external effects using turn/action idempotency.
- Surface one semantic activity with remediation; retain raw logs in diagnostics.

### 22.2 Workspace provisioning failure

- Attachment records a failed phase and public error code.
- Other ready attachments remain usable.
- Retry is phase-aware and idempotent.
- Partial filesystem state is quarantined or reclaimed.
- Access failure distinguishes permission, authentication, network, missing ref, disk, and conflict.

### 22.3 Child failure

- Parent watch receives structured terminal outcome.
- Parent decides whether to continue, retry, replace, or ask the operator.
- Runtime MUST NOT silently spawn replacements.
- Partial results remain readable and attributable.

### 22.4 Event/wakeup failure

- Claims have leases and can be recovered.
- A committed continuation records subscription/event ids.
- Duplicate delivery cannot create duplicate logical turns or side effects.
- Poison events become blockers with operator controls to retry, skip, or cancel.

### 22.5 Memory failure

- Conversation remains usable with a degraded state.
- Hot-path turns MUST NOT block on memory writes.
- Retrieval failure is explicit in prompt receipt and UI.
- Writes use outbox/retry and never fabricate success.

### 22.6 Partial cross-repository landing

- Change set records each repository outcome.
- Remaining repositories are blocked from blind continuation until dependencies are re-evaluated.
- Agent produces compensation or forward-fix options.
- No UI may label the whole change set successful while any required repository remains unlanded.

### 22.7 Distributed-state invariants

- Durable aggregate change and emitted event use a transaction/outbox or a proven reconciliation
  equivalent. UI projections are rebuildable from durable state.
- Every command is idempotent and every mutable aggregate uses optimistic revision/fencing.
- Provider/session state is never the sole record of messages, activities, external effects, child
  results, or workspace intent.
- Lease expiry is recoverable; only the current fenced lease may append attempt-owned state.
- One claimed continuation owns one wake generation. Duplicate and out-of-order events are harmless.
- Malformed runtime context returns a scoped 4xx/structured error and cannot mark the conversation or
  provider session permanently failed.
- Brain restart, worker restart, Cockpit reconnect, network partition, database failover, clock skew,
  workspace loss, Git-host outage, and adjacent fleet versions each have a tested recovery path.

## 23. Security, Privacy, and Audit

Threats in scope include malicious repositories/PRs/webpages/tool output/children, forged events,
compromised workers, secret exfiltration, shell injection, path traversal, symlink and unsafe archive
attacks, SSRF/egress abuse, cross-project or tenant leakage, poisoned memory, signed-grant replay,
duplicate mutations after timeout, untrusted patches, and provider data-retention exposure.

- Public API projections use explicit allowlists.
- Worker access catalogues reveal only resources allowed by fleet policy.
- Secret material remains in worker/brain secret stores and is referenced by opaque handles.
- Prompt, activity, transcript, and screenshot redaction are separate enforced boundaries.
- Every mutation records principal, conversation, turn, worker, grant, target, and idempotency key.
- Cross-user worker execution requires worker-owner acceptance policy and records the worker git
  identity used for fetch/push.
- Child delegation is auditable as a grant lineage.
- Automation-created conversations identify their template and triggering event.
- Retention/GC never treats archive as permission to destroy.
- Delete produces a reclamation plan and durable tombstone/audit receipt.
- Filesystem/network isolation, domain policy, secret binding, data residency, and provider retention
  policy are grant/scheduler inputs. Repositories and extracted archives are validated before use;
  untrusted code executes only in the configured sandbox profile.
- Memory writes and child results retain trust labels. Generated patches require normal review/test
  policy and do not become trusted because a model produced them.
- Audit records are tamper-evident and retained separately from user-visible transcripts. Emergency
  controls can revoke grants, stop leases, pause automations, and remove a worker fleet-wide.
- Support bundles, logs, traces, screenshots, diffs, and provider transcripts each apply redaction at
  source; downstream clients are not trusted to hide secrets.

Retention is policy driven and independently configured for transcripts/messages, semantic
activities, raw provider logs, audit receipts, memory assertions, artifacts, events, and physical
workspaces. Archive does not shorten retention by itself. Delete/export covers descendants and scoped
memory, honours legal/audit holds, and leaves only the minimum authorised tombstone. Defaults and
jurisdiction-specific durations belong to deployment policy, not hard-coded application constants.

## 24. Observability and Operations

Metrics:

- conversation operational-state counts and dwell time;
- turn preparation, queue, execution, and quiescence latency;
- lease reassignment and provider-resume success;
- workspace attach/migrate latency and failure by phase;
- child fan-out, depth, completion, retry, and join latency;
- wakeup delivery, dedupe, lease recovery, and poison-event counts;
- grant request/approval/rejection/revocation counts;
- semantic activity projection gaps;
- conversation reconstruction success;
- resource/worktree count, disk, stale state, and GC reclamation.

Tracing MUST carry conversation id, turn id, goal id, parent id, lease id, workspace generation,
event correlation/causation, and action idempotency key where applicable. Public telemetry MUST not
contain prompts, secrets, private repository names, or memory content.

Operational tools MUST support:

- inspect conversation aggregate and projection drift;
- rebuild public projection from events;
- requeue a failed wakeup;
- release/reassign an execution lease;
- inspect and reconcile workspace manifests;
- revoke grants;
- pause automations globally or by template;
- export a redacted support bundle.

Health/readiness and alerts cover fleet version inventory, provider subscription auth, queue depth,
wake/child latency, lease churn, workspace capacity, projection lag, external-action reconciliation,
duplicate-prevention counters, and dogfood-versus-production ring. Operators can distinguish domain
state failure from a stale UI projection through aggregate/projection revision comparison.

## 25. Migration from Current State

### 25.1 Existing identities

- Existing project thread ids become conversation ids or receive a stable mapping.
- Existing `jarvis-session_*` threads map to their owning durable conversation when possible.
- Unowned historical worker sessions remain importable as root conversations or diagnostic records.
- Existing `parent_chat_id` becomes `parent_conversation_id` after cycle validation.

### 25.2 Existing chat types

- `chat_type=assistant` and `chat_type=orchestrator` are read-only compatibility hints.
- New writes MUST NOT branch behaviour or UI on these values.
- Migration derives prompted behaviour from history/config but stores no replacement role type.
- The fields are removed after all supported clients stop depending on them.

### 25.3 Existing provider sessions

- Provider/worker sessions become execution-lease history.
- Terminal provider state does not mark imported conversations completed.
- Follow-up turns create/resume a lease under the universal resume policy.

### 25.4 Existing workspaces/worktrees

- Current conversation workspace metadata is imported into a generation-1 manifest.
- Worktrees are verified against repository identity and SHA before becoming `ready` attachments.
- Unknown or stale filesystem paths are quarantined and shown as degraded, never trusted silently.
- Worker-session worktrees that belong to children remain child-owned.

### 25.5 Existing transcript prose

- Known child-watch, terminal, automatic-continuation, and tool protocol prose may be recognised by a
  bounded migration adapter.
- The adapter creates structured historical activities when safe and hides duplicated prose.
- New runtime code MUST emit structure directly and MUST NOT rely on prose parsing.
- Compatibility parsing has telemetry and a removal date after historical migration completes.

### 25.6 Cockpit migration

1. Introduce universal client conversation contracts and adapter tests.
2. Render Jarvis conversations through ChatView behind a development flag.
3. Make the unified path default in dogfood.
4. Remove `ProjectConversationView`, its local turn merge state, custom composer wiring, and duplicate
   route semantics.
5. Remove compatibility selectors after production migration.

Migration MUST preserve history, hierarchy, archive state, project association, titles, child
results, GitHub review receipts, and usable follow-up turns.

Migration uses a compatibility window with dual-read and, only where unavoidable, bounded dual-write.
Stable ids and old deep links resolve through mapping records; drafts and scroll state remain local
client data keyed by the stable conversation id. Historical `completed` conversation presentation
maps to open+`idle` with the last turn terminal. Known protocol prose may be hidden retroactively only
when a structured replacement is verified.

Database backfill is resumable/idempotent and records per-entity migration version. Rollback keeps
v2-created turns and hierarchy readable through the compatibility adapter; it MUST NOT discard new
state. Mixed brain/worker/Cockpit versions are allowed only inside the tested compatibility matrix.
Removal requires telemetry showing no supported client uses legacy routes/types, successful export
and rollback drills, and an explicit cleanup release.

## 26. Delivery Slices

Each slice must be independently dogfoodable. Jarvis changes use a PR and dogfood deployment before
release; Cockpit changes may land on main and run against the dogfood fleet.

Every slice plan MUST state: user-visible outcome, Jarvis/Cockpit contract changes, compatibility
window, schema migration/backfill, tests, exact headed dogfood scenario, observability, rollback,
performance/security impact, and measurable exit criteria. A slice is not complete because code was
merged; it exits only after exact candidate SHAs pass the dogfood scenario against the live brain and
workers.

### Slice 0: Contract and fixture foundation

- Publish this spec and v2 schema fixtures.
- Add cross-repo contract golden tests.
- Add compatibility mapping for current project threads and worker sessions.
- No UI change required.

### Slice 1: Durable conversation aggregate

- Open/archived lifecycle and derived operational state.
- Turn/session separation and follow-up after terminal provider session.
- Existing conversations import and remain usable.

### Slice 2: Unified Cockpit runtime

- Jarvis adapter produces standard client-runtime conversations.
- ChatView, MessagesTimeline, and ChatComposer replace ProjectConversationView.
- Context panel carries project/memory metadata.
- Delete duplicate presentation code.

### Slice 3: Workspace manifest and lazy repository attachment

- Known-resource catalogue.
- Empty conversation workspace.
- Attach/list/detach repository tools.
- Multi-repository workspace root and Cockpit context panel.

### Slice 4: Recursive child conversations

- Durable spawn, hierarchy, immediate projection, child tools, result envelopes.
- All children can spawn descendants.
- Archive policies and tree controls.

### Slice 5: Watches and reliable joins

- Durable subscriptions to child state.
- Claim/lease/idempotent continuation.
- Semantic orchestration activities and right-sidebar state.

### Slice 6: Goals, evidence, and verification

- Goal aggregate, acceptance criteria, evidence refs, blockers, active-goal UI.
- Verification receipts prevent unsupported completion claims.

### Slice 7: Authority delegation and budgets

- Unified grants, child subset delegation, grant requests, revocation, side-effect receipts.
- Existing review publishing moves to the generic authority path.

### Slice 8: General event wakeups and automations

- PR/CI/deployment/schedule/fleet event sources.
- Conversation subscriptions and reusable automation templates.
- PR review becomes a template, not hard-coded orchestration behaviour.

### Slice 9: Workspace mobility and cross-repository change sets

- Lease reassignment with workspace rehydration.
- Durable multi-repo change-set tracking and partial landing recovery.

### Slice 10: Cleanup and compatibility removal

- Remove chat types and separate view/runtime paths.
- Migrate/retire prose compatibility.
- Enforce retention, worktree GC, deletion/reclamation, and support tooling.

## 27. Test Specification

### 27.1 Conversation unit tests

- Provider completion returns conversation to `idle`, never `completed`.
- Failed/cancelled turn preserves ability to send another turn.
- Archive/unarchive preserves history, workspace, hierarchy, goals, and subscriptions.
- Operational-state priority is deterministic for overlapping conditions.
- Parent assignment rejects cycles.
- Goal achieved/abandoned does not archive conversation.

### 27.2 Workspace unit tests

- Empty workspace is valid.
- Known repository is not reported as attached.
- Attach resolves immutable SHA and increments workspace generation.
- Two repositories attach at distinct logical paths and are both present in prompt manifest.
- Writable attachment cannot be shared by parent and child.
- Detach blocks or requires explicit disposition when dirty.
- Partial provisioning cleans/quarantines filesystem state.
- Change set reports partial landing accurately.

### 27.3 Authority unit tests

- Tool exists without grant but execution is denied structurally.
- Child cannot receive capability outside parent delegation.
- Revoked/expired/resource-mismatched grant is denied.
- Duplicate mutation with the same idempotency key returns the original receipt.
- Secret handle use never exposes secret value in event/activity/transcript.
- Budget exhaustion creates waiting/blocked state without corrupting the conversation.

### 27.4 Orchestration unit tests

- Spawn returns child before provider assignment.
- Child can spawn grandchild under delegated policy.
- Watch all/any/quorum predicates transition correctly.
- Duplicate terminal events produce one logical continuation.
- Lost continuation lease is reclaimed.
- Failed continuation retries without duplicate external action.
- Parent archive policies reparent or archive subtree exactly as selected.

### 27.5 Memory unit tests

- Retrieval obeys project/conversation/visibility scope.
- Conflicting assertions remain attributable.
- Supersession does not delete evidence.
- Stale assertion is labelled in prompt context.
- Failed memory write does not block turn completion.

### 27.6 Contract tests across repositories

- Jarvis public fixtures decode in Cockpit without loss.
- Unknown optional fields/events are forward compatible.
- Public projections contain no private payload fields.
- Every Cockpit command maps to one Jarvis intent and every Jarvis response maps to one universal
  client state transition.
- Semantic activity fixtures render through native tool rows.
- No Cockpit selector depends on `chat_type` after migration.

### 27.7 Integration tests

- Create conversation with no repo, discuss project, then attach two repos and inspect both.
- Resume conversation after provider session exits.
- Reassign a turn after worker loss.
- Parent spawns Codex and Claude children on different workers; both attach the same pinned PR SHA;
  parent joins once.
- Child spawns a verification grandchild.
- GitHub review mutation is idempotent across continuation retry.
- CI event wakes existing conversation and results in one follow-up turn.
- Archive parent with reparent policy preserves children as roots.
- Archive subtree removes all from default views without reclaiming workspaces.

### 27.8 Security tests

- Unauthorised repo is absent or explicitly denied without leaking catalogue membership.
- Worker git identity cannot be used outside accepted principal/project policy.
- Child prompt injection cannot widen grants.
- Event payload cannot inject a higher-authority wake instruction.
- Cross-tenant/conversation ids cannot read children, memory, workspace, or action receipts.
- Public support bundle redacts secrets, private repo names under policy, prompts, and memory.

### 27.9 Reliability and load tests

- Reconnect/replay yields no duplicate messages, children, or activities.
- Thousands of idle conversations do not hold provider sessions.
- Wide and deep child trees remain navigable and bounded by policy.
- Burst child completions debounce/join without lost results.
- Event service recovers claims after process crash.
- Workspace manifest rebuild detects drift.
- Backpressure protects brain and workers during automation bursts.
- Property tests cover arbitrary duplicate/out-of-order command and event delivery.
- Cockpit reconnect during a streamed tool call preserves one ordered activity.
- Human steering racing an automatic continuation preserves both intents in correct priority.
- Worker death after an external effect but before acknowledgement reconciles without duplication.
- Two children cannot acquire the same writable worktree.
- Second of two repository attachments failing leaves the first truthful and usable.
- Capability revocation during execution fails closed at the next protected boundary.
- PR head change invalidates old review anchors and never posts against the wrong revision.
- Provider switch and context compaction preserve goal, hierarchy, evidence, and future usability.
- Export/delete covers descendants and scoped memory under retention policy.

### 27.10 Headed dogfood scenarios

1. Start a conversation with no repository and ask a project question.
2. Ask it to inspect Jarvis and Cockpit; observe two semantic attach activities and two context-panel
   attachments.
3. Ask it to delegate independent analyses; children appear live in the left tree.
4. Open a child, continue talking, and ask the child to spawn a verifier.
5. Stop/restart a worker and continue the parent successfully.
6. Complete the task; header returns to `Idle`, not `Completed`.
7. Receive a PR/CI event and observe the same conversation wake once.
8. Archive the parent and choose both hierarchy policies in separate fixtures.
9. Verify normal transcript contains no raw provider/provision/watch events or ids.

## 28. Acceptance Criteria

The programme is complete only when all criteria hold.

### Universal conversation

- [ ] No user-visible or durable assistant/orchestrator/reviewer/implementation conversation types.
- [ ] All conversations render and compose through the native code-agent path.
- [ ] Any authorised conversation can spawn a child; any authorised child can spawn descendants.
- [ ] Provider/worker/session termination never terminates the conversation.
- [ ] Existing imported conversations accept new turns.

### Workspace and resources

- [ ] Conversation creation requires no repository.
- [ ] Agent knows the authorised repository catalogue without pretending repos are attached.
- [ ] Agent can attach two repositories lazily and structurally observe both.
- [ ] Multi-repo workspace survives future turns and provider session replacement.
- [ ] Parallel writable work uses isolated worktrees.
- [ ] Every result states the exact revisions used.

### Orchestration and automation

- [ ] Child hierarchy appears without reload before worker assignment.
- [ ] Child completion wakes the parent once under duplicate delivery and restart.
- [ ] Child results are structured and do not require prose parsing.
- [ ] PR review is expressible as an automation template over ordinary conversations/tools.
- [ ] Conversations can wait on PR, CI, deployment, schedule, and fleet events.

### Authority and safety

- [ ] Runtime supports broad tools while execution remains grant scoped.
- [ ] Child delegation cannot widen authority.
- [ ] External mutations are idempotent and audited.
- [ ] Secrets never appear in public projections or prompts.
- [ ] Destructive/production actions obey explicit policy.

### UX and observability

- [ ] One composer behaves identically across all conversations.
- [ ] Right sidebar shows goals, children, workspace, resources, authority, memory, and evidence when
      relevant.
- [ ] Tool activity meets native code-agent semantic quality.
- [ ] Conversation header uses derived operational state and never says completed for an open
      conversation.
- [ ] Diagnostics expose execution detail without polluting normal conversation.
- [ ] Left hierarchy and right context update live without reload.

### Reliability

- [ ] Conversation reconstructs after brain restart from durable state/events.
- [ ] Lost worker/provider lease can be replaced without losing conversation state.
- [ ] Reconnect/replay creates no duplicate visible state.
- [ ] Workspace and action receipts recover safely after partial failure.
- [ ] Dogfood fleet proves Codex and Claude local subscription execution.

## 29. Definition of Done for Every Delivery Slice

Each slice requires:

1. Jarvis domain/API changes behind versioned contracts and targeted tests.
2. Cockpit fixture/adapter support before or with live runtime support.
3. Semantic activities and diagnostics boundaries.
4. Migration/rollback behaviour.
5. Focused tests plus repository-wide required gates.
6. Exact-SHA deployment to the dogfood ring when Jarvis changes.
7. Headed Cockpit verification through the live brain and workers.
8. Evidence recorded without private fleet details in tracked files.
9. Jarvis PR reviewed and green before merge.
10. No production release until the complete slice works in dogfood and the operator requests it.

## 30. Release Gates

No slice or release advances beyond dogfood until all applicable gates pass:

1. Jarvis and Cockpit lint, typecheck, unit, integration, contract, migration, and security checks.
2. Contract compatibility matrix for the oldest/newest supported brain, worker, and Cockpit.
3. Exact candidate SHAs installed on the dogfood brain/workers; no accidental local brain/worker or
   unrelated checkout used for validation.
4. Headed Cockpit end-to-end proof through the live brain and Tailnet-connected fleet using Codex and
   Claude local subscription authentication where required.
5. Golden UI evidence shows one composer/runtime and no raw provider/provisioning noise.
6. Recovery drill for brain restart, worker loss, stream reconnect, wake replay, and uncertain
   external action.
7. Rollback drill proves conversations/turns created on the candidate remain readable and usable.
8. Security review covers grants, event authentication, prompt injection, workspaces, secrets, and
   external mutations.
9. Performance budgets pass for long transcripts, wide/deep trees, event bursts, and multi-repo
   workspaces; accessibility and responsive checks pass for canonical UI controls.
10. Operator explicitly authorises production release. Dogfood fixes continue on candidate/main and
    are consolidated into Jarvis PRs only after the slice works.

## 31. Product and Reliability Measures

Dashboards and release reports track:

- one-day/one-week conversation resume success;
- resume success after provider session, worker, brain, and fleet version replacement;
- child create-to-visible and completion-to-parent-wake latency;
- missed/duplicate wakeups and duplicate external-action rate (target: zero logical duplicates);
- multi-repository attachment, recovery, and goal completion rate;
- human interventions per durable goal and budget exhaustion frequency;
- Cockpit refresh-required, duplicate-sidebar, stale-state, and raw-diagnostic-leak incidents;
- semantic activity projection coverage and tool-call comprehension failures;
- workspace attach/migration failure and recovery rate;
- cost/tokens/wall time per achieved goal and child fan-out efficiency;
- percentage of traffic using legacy chat-type/view/API paths until it reaches zero;
- authority surprises, unexplained actions, stale-memory corrections, and user-reported trust issues.

Each metric has a named owner, baseline before rollout, target per slice, and alert/rollback threshold.
Metrics MUST NOT collect private prompt, transcript, secret, or repository content.

## 32. Final Product Principle

The system is a persistent network of understandable, steerable agent conversations.

A conversation can talk, remember, discover resources, attach what it needs, act, delegate, wait,
wake, verify, and continue. Its provider session may end; its worker may change; its current goal may
finish; its children may come and go. The conversation remains.
