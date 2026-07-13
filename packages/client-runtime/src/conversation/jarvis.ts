import type {
  JarvisConversationWorkspace,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectMemoryResponse,
  JarvisProjectThreadDetail,
} from "@t3tools/contracts";

import { projectThreadMessageKey, type JarvisConversationMessage } from "./jarvisMessageKey.ts";
import type {
  AgentConversation,
  ConversationActivity,
  ConversationActivityStatus,
  ConversationLifecycle,
  ConversationMessage,
  ConversationMessageRole,
  ConversationOperationalState,
  ConversationTimelineItem,
  ConversationWorkspace,
} from "./model.ts";

export type JarvisConversationDetail = Omit<JarvisProjectThreadDetail, "messages"> & {
  readonly messages: ReadonlyArray<JarvisConversationMessage>;
};

const LIFECYCLES = new Set<ConversationLifecycle>(["open", "archived", "deleting", "deleted"]);
const OPERATIONAL_STATES = new Set<ConversationOperationalState>([
  "idle",
  "starting",
  "working",
  "waiting_for_input",
  "waiting_for_approval",
  "waiting_for_children",
  "joining",
  "waiting_for_event",
  "blocked",
  "degraded",
  "paused",
  "archived",
]);

interface ProjectedItem {
  observedAt: string;
  sourceIndex: number;
  message?: ConversationMessage;
  activity?: ConversationActivity;
}

interface ActivityFrame {
  readonly groupKey: string;
  readonly correlationId: string;
  readonly replayKey: string;
  readonly family: "tool" | "watch" | "terminal";
  readonly kind: string;
  readonly status: ConversationActivityStatus;
  readonly title: string;
  readonly summary: string | null;
  readonly toolName: string | null;
  readonly relatedConversationIds: ReadonlyArray<string>;
  readonly observedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly expectedChildren?: number;
  readonly legacyToolPhase?: "call" | "result";
}

interface ActivityAccumulator extends ActivityFrame {
  sourceIndex: number;
}

/** Pure compatibility adapter from the current Jarvis projection to the universal client model. */
export function adaptJarvisProjectThread(thread: JarvisConversationDetail): AgentConversation {
  const conversationId = String(thread.conversation_id ?? thread.thread_id);
  const lifecycle = projectLifecycle(thread);
  const operationalState = projectOperationalState(thread, lifecycle);
  const projected = projectItems(conversationId, thread.messages);
  const messages = projected.flatMap((item) => (item.message ? [item.message] : []));
  const activities = projected.flatMap((item) => (item.activity ? [item.activity] : []));
  const timeline: ConversationTimelineItem[] = projected.map((item) =>
    item.message
      ? { kind: "message", id: item.message.id, observedAt: item.observedAt }
      : { kind: "activity", id: item.activity!.id, observedAt: item.observedAt },
  );

  return {
    id: conversationId,
    title: thread.title,
    lifecycle,
    operationalState,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    lastTurnAt: clean(thread.last_turn_at),
    messages,
    activities,
    timeline,
    routing: {
      aliases: [{ namespace: "jarvis.project-thread", id: String(thread.thread_id) }],
    },
    ownership: {
      scopeId: String(thread.project_id) || null,
      parentConversationId: clean(thread.parent_chat_id),
    },
    diagnostics: {
      reason: clean(thread.diagnostic_reason),
      execution: projectExecutionDiagnostics(thread.workspace),
    },
    runtime: projectConversationRuntime(thread, lifecycle, operationalState),
    context: {
      workspace: projectWorkspace(thread.workspace),
      project: null,
      memory: null,
      artifacts: [],
      archivedAt: clean(thread.archived_at),
      archivedBy: clean(thread.archived_by),
      archiveReason: clean(thread.archive_reason),
    },
  };
}

function projectConversationRuntime(
  thread: JarvisConversationDetail,
  lifecycle: ConversationLifecycle,
  operationalState: ConversationOperationalState,
): AgentConversation["runtime"] {
  const execution = thread.execution;
  if (!execution) {
    return {
      available: true,
      status: operationalState,
      activeTurn: null,
      pendingRequests: [],
      supportedControls: lifecycle === "archived" ? [] : ["turn"],
      supportsSteer: false,
      supportsQueue: false,
      diagnostic: null,
    };
  }
  return {
    available: execution.available,
    status: execution.status,
    activeTurn: execution.active_turn
      ? {
          id: execution.active_turn.turn_id,
          status: execution.active_turn.status,
          startedAt: clean(execution.active_turn.started_at),
        }
      : null,
    pendingRequests: execution.pending_requests.map((request) => ({
      id: request.request_id,
      kind: request.kind,
      status: request.status,
      title: request.title ?? "",
      detail: clean(request.detail),
      createdAt: clean(request.created_at),
      requestKind: request.request_kind ?? null,
      questions: (request.questions ?? []).map((question) => ({
        id: question.id,
        header: clean(question.header),
        question: question.question,
        multiSelect: question.multi_select,
        options: question.options.map((option) => ({
          label: option.label,
          description: clean(option.description),
        })),
      })),
    })),
    supportedControls: [...execution.supported_controls],
    supportsSteer: execution.supports.steer,
    supportsQueue: execution.supports.queue,
    diagnostic: execution.diagnostic
      ? {
          code: execution.diagnostic.code,
          message: clean(execution.diagnostic.message),
        }
      : null,
  };
}

/** Add safe durable project knowledge without exposing provider execution identity. */
export function enrichAgentConversationWithJarvisContext(
  conversation: AgentConversation,
  input: {
    readonly project: JarvisProject | null;
    readonly memory: JarvisProjectMemoryResponse | null;
    readonly files: ReadonlyArray<JarvisProjectFile>;
  },
): AgentConversation {
  return {
    ...conversation,
    context: {
      ...conversation.context,
      project: input.project
        ? {
            id: String(input.project.id),
            name: input.project.name,
            aliases: [...input.project.aliases],
            owner: clean(input.project.owner),
            members: [...input.project.members],
            visibility: clean(input.project.visibility),
            status: clean(input.project.status),
            repositories: input.project.repos.map((repository) => ({
              name: repository.name,
              remote: safeRepositoryRemote(repository.remote),
              isDefault: repository.default,
            })),
            links: {
              issueTracker: clean(input.project.links?.jira),
              urls: [...(input.project.links?.urls ?? [])],
            },
          }
        : null,
      memory: input.memory
        ? {
            representation: input.memory.representation,
            conclusions: input.memory.conclusions.map((conclusion) => ({
              id: conclusion.id,
              content: conclusion.content,
              artifactType: conclusion.artifact_type,
              recordedBy: clean(conclusion.recorded_by),
              observedAt: clean(conclusion.observed_at),
            })),
          }
        : null,
      artifacts: input.files.map((file) => ({
        id: file.doc_id,
        title: clean(file.title),
        contentHash: clean(file.content_hash),
        artifactType: clean(file.artifact_type),
        uploadedBy: clean(file.uploaded_by),
        observedAt: clean(file.observed_at),
        retracted: file.retracted,
      })),
    },
  };
}

function projectItems(
  conversationId: string,
  source: ReadonlyArray<JarvisConversationMessage>,
): ProjectedItem[] {
  const items: ProjectedItem[] = [];
  const activities = new Map<string, ActivityAccumulator>();
  const legacyToolOccurrences = new Map<string, { pendingGroupKeys: Array<string> }>();
  const seen = new Set<string>();

  const orderedSource = source
    .map((message) => ({ message, replayKey: projectThreadMessageKey(message) }))
    .sort(compareOrderedMessages);
  orderedSource.forEach(({ message, replayKey }, sourceIndex) => {
    if (seen.has(replayKey)) return;
    seen.add(replayKey);

    const projectedFrame = projectActivityFrame(message, replayKey);
    const frame = projectedFrame
      ? assignLegacyToolOccurrence(projectedFrame, legacyToolOccurrences)
      : null;
    if (frame) {
      const current = activities.get(frame.groupKey);
      activities.set(
        frame.groupKey,
        current ? mergeActivity(current, frame, sourceIndex) : { ...frame, sourceIndex },
      );
      return;
    }
    if (isRedundantTechnicalAcknowledgement(message)) return;
    const presentation = projectJarvisMessagePresentation(message);
    items.push({
      observedAt: message.observed_at,
      sourceIndex,
      message: {
        id: stableId("message", replayKey),
        conversationId,
        role: projectRole(message.role),
        content: message.content,
        authorId: clean(message.peer_id),
        observedAt: message.observed_at,
        ...(presentation ? { presentation } : {}),
      },
    });
  });

  completeLegacyWatches(activities);
  for (const frame of activities.values()) {
    const activity: ConversationActivity = {
      id: stableId("activity", frame.groupKey),
      conversationId,
      kind: frame.kind,
      status: frame.status,
      title: frame.title,
      summary: frame.summary,
      toolName: frame.toolName,
      correlationId: frame.correlationId,
      relatedConversationIds: frame.relatedConversationIds,
      startedAt: frame.observedAt,
      completedAt: frame.completedAt,
      error: frame.error,
    };
    items.push({ observedAt: frame.observedAt, sourceIndex: frame.sourceIndex, activity });
  }

  return items.sort(
    (left, right) =>
      left.observedAt.localeCompare(right.observedAt) || left.sourceIndex - right.sourceIndex,
  );
}

/** Bounded compatibility presentation for known generated orchestration prompts. */
export function projectJarvisMessagePresentation(message: JarvisConversationMessage) {
  if (message.role !== "user") return null;
  const match =
    /^You are the PR review orchestrator\. Review pull request #(\d+) in ([^.\s]+)\./u.exec(
      message.content.trim(),
    );
  if (!match) return null;
  return {
    summary: `Review ${match[2]} #${match[1]} with two independent code agents.`,
    disclosure: { label: "Review instructions", text: message.content },
  };
}

function compareOrderedMessages(
  left: { readonly message: JarvisConversationMessage; readonly replayKey: string },
  right: { readonly message: JarvisConversationMessage; readonly replayKey: string },
): number {
  const observed = left.message.observed_at.localeCompare(right.message.observed_at);
  if (observed !== 0) return observed;
  const leftSequence = left.message.sequence;
  const rightSequence = right.message.sequence;
  if (leftSequence !== undefined && rightSequence !== undefined) {
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.replayKey.localeCompare(right.replayKey);
  }
  if (leftSequence !== undefined) return -1;
  if (rightSequence !== undefined) return 1;
  return left.replayKey.localeCompare(right.replayKey);
}

function projectActivityFrame(
  message: JarvisConversationMessage,
  replayKey: string,
): ActivityFrame | null {
  const allowLegacyProse = message.type === undefined || message.type === "legacy";
  const legacyWatch = allowLegacyProse
    ? /^Watching (\d+) child work session\(s\) for completion\.$/u.exec(message.content)
    : null;
  if (message.type === "child_watch" || (message.role === "system" && legacyWatch)) {
    const status = activityStatus(message.phase, message.status, "waiting");
    const relatedConversationIds = unique(message.child_chat_ids ?? []);
    const count = relatedConversationIds.length || Number.parseInt(legacyWatch?.[1] ?? "0", 10);
    return {
      groupKey: clean(message.watch_id)
        ? `watch:${clean(message.watch_id)}`
        : `legacy-watch:${replayKey}`,
      correlationId: clean(message.watch_id) ?? `legacy-watch:${replayKey}`,
      replayKey,
      family: "watch",
      kind: watchKind(status),
      status,
      title: watchTitle(status, count),
      summary: null,
      toolName: null,
      relatedConversationIds,
      observedAt: message.observed_at,
      completedAt: terminalStatus(status)
        ? (clean(message.completed_at) ?? message.observed_at)
        : null,
      error: clean(message.error),
      expectedChildren: count,
    };
  }

  const legacyTerminal = allowLegacyProse
    ? /^Child (.+) \(([^)]+)\) reached ([^:]+)(?:: (.*))?\.$/u.exec(message.content)
    : null;
  if (message.type === "child_terminal" || (message.role === "system" && legacyTerminal)) {
    const childId = clean(message.child_chat_id) ?? legacyTerminal?.[2] ?? "unknown-child";
    const title = clean(message.title) ?? legacyTerminal?.[1] ?? "Child code agent";
    const status = activityStatus(message.phase ?? legacyTerminal?.[3], message.status, "waiting");
    const error = clean(message.error) ?? clean(legacyTerminal?.[4]);
    return {
      groupKey: `child:${childId}`,
      correlationId: childId,
      replayKey,
      family: "terminal",
      kind: childKind(status),
      status,
      title: childTitle(title, status),
      summary: error,
      toolName: null,
      relatedConversationIds: [childId],
      observedAt: message.observed_at,
      completedAt: terminalStatus(status)
        ? (clean(message.completed_at) ?? message.observed_at)
        : null,
      error,
    };
  }

  const legacyTool = allowLegacyProse
    ? /^(?:tool\.(call|result)|tool_(call|result))\b[:\s-]*(.*)$/su.exec(message.content.trim())
    : null;
  if (message.type === "tool.call" || message.type === "tool.result" || legacyTool) {
    const isResult =
      message.type === "tool.result" ||
      legacyTool?.[1] === "result" ||
      legacyTool?.[2] === "result";
    const detail = clean(legacyTool?.[3]) ?? clean(message.content) ?? "Tool activity";
    const toolName = /^([\w.-]+)/u.exec(detail)?.[1] ?? null;
    const fallbackStatus = isResult ? "completed" : "requested";
    const status = activityStatus(message.phase, message.status, fallbackStatus);
    const correlation = clean(message.call_id) ?? clean(message.correlation_id);
    return {
      groupKey: correlation ? `tool:${correlation}` : `legacy-tool:${toolName ?? detail}`,
      correlationId: correlation ?? `legacy-tool:${toolName ?? detail}`,
      replayKey,
      family: "tool",
      kind: toolKind(status),
      status,
      title: toolTitle(toolName, status),
      summary: detail,
      toolName,
      relatedConversationIds: [],
      observedAt: message.observed_at,
      completedAt: terminalStatus(status)
        ? (clean(message.completed_at) ?? message.observed_at)
        : null,
      error: clean(message.error),
      ...(correlation
        ? {}
        : { legacyToolPhase: isResult ? ("result" as const) : ("call" as const) }),
    };
  }

  return null;
}

function assignLegacyToolOccurrence(
  frame: ActivityFrame,
  occurrences: Map<string, { pendingGroupKeys: Array<string> }>,
): ActivityFrame {
  if (!frame.legacyToolPhase) return frame;
  const state = occurrences.get(frame.groupKey) ?? { pendingGroupKeys: [] };
  let groupKey: string;
  if (frame.legacyToolPhase === "call") {
    groupKey = `legacy-tool-call:${frame.replayKey}`;
    state.pendingGroupKeys.push(groupKey);
  } else if (state.pendingGroupKeys.length > 0) {
    groupKey = state.pendingGroupKeys.shift()!;
  } else {
    groupKey = `legacy-tool-result:${frame.replayKey}`;
  }
  occurrences.set(frame.groupKey, state);
  return {
    ...frame,
    groupKey,
    correlationId: groupKey,
  };
}

function mergeActivity(
  current: ActivityAccumulator,
  next: ActivityFrame,
  sourceIndex: number,
): ActivityAccumulator {
  const status = preferStatus(current.status, next.status);
  const first = current.observedAt.localeCompare(next.observedAt) <= 0 ? current : next;
  const latest = current.observedAt.localeCompare(next.observedAt) <= 0 ? next : current;
  const toolName = current.toolName ?? next.toolName;
  const relatedConversationIds = unique([
    ...current.relatedConversationIds,
    ...next.relatedConversationIds,
  ]);
  const count =
    relatedConversationIds.length || next.expectedChildren || current.expectedChildren || 0;
  return {
    ...current,
    kind:
      current.family === "tool"
        ? toolKind(status)
        : current.family === "watch"
          ? watchKind(status)
          : childKind(status),
    status,
    title:
      current.family === "tool"
        ? toolTitle(toolName, status)
        : current.family === "watch"
          ? watchTitle(status, count)
          : latest.title,
    summary: latest.summary ?? current.summary,
    toolName,
    relatedConversationIds,
    observedAt: first.observedAt,
    completedAt: terminalStatus(status)
      ? (next.completedAt ?? current.completedAt ?? latest.observedAt)
      : null,
    error: latest.error ?? current.error,
    expectedChildren: Math.max(current.expectedChildren ?? 0, next.expectedChildren ?? 0),
    sourceIndex: Math.min(current.sourceIndex, sourceIndex),
  };
}

function completeLegacyWatches(activities: Map<string, ActivityAccumulator>): void {
  const ordered = [...activities.entries()].sort(
    ([, left], [, right]) =>
      left.observedAt.localeCompare(right.observedAt) || left.sourceIndex - right.sourceIndex,
  );
  const claimedTerminals = new Set<string>();
  for (let watchIndex = 0; watchIndex < ordered.length; watchIndex += 1) {
    const [key, watch] = ordered[watchIndex]!;
    if (watch.family !== "watch" || !key.startsWith("legacy-watch:")) continue;
    const children: Array<[string, ActivityAccumulator]> = [];
    for (const candidate of ordered.slice(watchIndex + 1)) {
      const [candidateKey, activity] = candidate;
      if (activity.family === "watch") break;
      if (activity.family !== "terminal" || claimedTerminals.has(candidateKey)) continue;
      children.push(candidate);
      if (children.length >= (watch.expectedChildren ?? 0)) break;
    }
    if (children.length === 0) continue;
    for (const [terminalKey] of children) claimedTerminals.add(terminalKey);
    const relatedConversationIds = unique(
      children.flatMap(([, child]) => child.relatedConversationIds),
    );
    const expected = watch.expectedChildren ?? 0;
    const complete = expected > 0 && children.length >= expected;
    const failed = children.some(([, child]) => child.status === "failed");
    const cancelled = children.some(([, child]) => child.status === "cancelled");
    const status: ConversationActivityStatus = failed
      ? "failed"
      : cancelled
        ? "cancelled"
        : complete
          ? "completed"
          : watch.status;
    activities.set(key, {
      ...watch,
      kind: watchKind(status),
      status,
      title: watchTitle(status, expected),
      relatedConversationIds,
      completedAt: terminalStatus(status) ? (children.at(-1)?.[1].completedAt ?? null) : null,
      error: children.find(([, child]) => child.error)?.[1].error ?? watch.error,
    });
  }
}

function activityStatus(
  phase: string | null | undefined,
  status: string | null | undefined,
  fallback: ConversationActivityStatus,
): ConversationActivityStatus {
  let sawUnknown = false;
  for (const value of [status, phase]) {
    if (!value) continue;
    switch (value?.toLowerCase()) {
      case "requested":
        return "requested";
      case "claimed":
      case "running":
      case "working":
        return "running";
      case "waiting":
      case "pending":
        return "waiting";
      case "completed":
      case "succeeded":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
      case "canceled":
        return "cancelled";
      default:
        sawUnknown = true;
    }
  }
  return sawUnknown && fallback === "completed" ? "waiting" : fallback;
}

function preferStatus(
  current: ConversationActivityStatus,
  next: ConversationActivityStatus,
): ConversationActivityStatus {
  const rank: Record<ConversationActivityStatus, number> = {
    requested: 0,
    waiting: 1,
    running: 2,
    completed: 3,
    cancelled: 4,
    failed: 5,
  };
  return rank[next] >= rank[current] ? next : current;
}

function terminalStatus(status: ConversationActivityStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function watchKind(status: ConversationActivityStatus): string {
  if (status === "completed") return "children.joined";
  if (status === "failed") return "children.failed";
  if (status === "cancelled") return "children.cancelled";
  return "children.waiting";
}

function watchTitle(status: ConversationActivityStatus, count: number): string {
  const children = `${count} child conversation${count === 1 ? "" : "s"}`;
  if (status === "completed") return `Joined ${children}`;
  if (status === "failed") return `Failed while waiting for ${children}`;
  if (status === "cancelled") return `Cancelled wait for ${children}`;
  return `Waiting for ${children}`;
}

function childKind(status: ConversationActivityStatus): string {
  if (status === "completed") return "child.completed";
  if (status === "failed") return "child.failed";
  if (status === "cancelled") return "child.cancelled";
  return "child.waiting";
}

function childTitle(title: string, status: ConversationActivityStatus): string {
  if (status === "completed") return `${title} completed`;
  if (status === "failed") return `${title} failed`;
  if (status === "cancelled") return `${title} cancelled`;
  return `${title} state unknown`;
}

function toolKind(status: ConversationActivityStatus): string {
  if (status === "completed") return "tool.completed";
  if (status === "failed") return "tool.failed";
  if (status === "cancelled") return "tool.cancelled";
  return "tool.requested";
}

function toolTitle(toolName: string | null, status: ConversationActivityStatus): string {
  const tool = toolName ?? "tool";
  if (status === "completed") return `Completed ${tool}`;
  if (status === "failed") return `Failed ${tool}`;
  if (status === "cancelled") return `Cancelled ${tool}`;
  return `Requested ${tool}`;
}

function projectWorkspace(
  workspace: JarvisConversationWorkspace | null | undefined,
): ConversationWorkspace | null {
  if (!workspace) return null;
  return {
    workspaceId: clean(workspace.workspace_id),
    rootLabel: clean(workspace.root_label),
    cwdLabel: clean(workspace.cwd_label),
    status: clean(workspace.status),
    provisionPhase: clean(workspace.provision_phase),
    worktrees: workspace.worktrees.map((worktree) => ({
      name: clean(worktree.name),
      repository: clean(worktree.repo),
      pathLabel: clean(worktree.path_label),
      branch: clean(worktree.branch),
      baseRef: clean(worktree.base_ref),
      status: clean(worktree.status),
      provisionPhase: clean(worktree.provision_phase),
    })),
  };
}

function projectExecutionDiagnostics(workspace: JarvisConversationWorkspace | null | undefined) {
  if (!workspace) return null;
  return {
    provider: clean(workspace.engine),
    workerId: clean(workspace.worker_id),
    sessionId: clean(workspace.session_id),
    status: clean(workspace.status),
    provisionPhase: clean(workspace.provision_phase),
    worktrees: workspace.worktrees.map((worktree) => ({
      repository: clean(worktree.repo),
      status: clean(worktree.status),
      provisionPhase: clean(worktree.provision_phase),
    })),
  };
}

function projectLifecycle(thread: JarvisConversationDetail): ConversationLifecycle {
  if (thread.lifecycle && LIFECYCLES.has(thread.lifecycle)) return thread.lifecycle;
  return clean(thread.archived_at) ? "archived" : "open";
}

function projectOperationalState(
  thread: JarvisConversationDetail,
  lifecycle: ConversationLifecycle,
): ConversationOperationalState {
  if (lifecycle === "archived") return "archived";
  if (thread.operational_state && OPERATIONAL_STATES.has(thread.operational_state)) {
    return thread.operational_state;
  }
  switch (thread.status) {
    case "pending":
    case "starting":
      return "starting";
    case "running":
    case "working":
      return "working";
    case "blocked":
      return "blocked";
    case "failed":
      return "degraded";
    default:
      return "idle";
  }
}

function projectRole(role: string): ConversationMessageRole {
  switch (role) {
    case "user":
    case "assistant":
    case "system":
      return role;
    default:
      return "unknown";
  }
}

function isRedundantTechnicalAcknowledgement(message: JarvisConversationMessage): boolean {
  if (message.type !== undefined && message.type !== "legacy") return false;
  const content = message.content.trim();
  return (
    content.startsWith("Automatic orchestration continuation:") ||
    (message.role !== "user" &&
      content.startsWith("Spawned both required child review sessions and registered the watch."))
  );
}

function unique(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function clean(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function safeRepositoryRemote(remote: string): string {
  try {
    const url = new URL(remote);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return remote;
  }
}

function stableId(namespace: string, value: string): string {
  let hash = 0xcbf29ce484222325n;
  const input = `${namespace}\u0000${value}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${namespace}-${hash.toString(36)}`;
}
