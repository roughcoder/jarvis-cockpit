import type {
  JarvisConversationWorkspace,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectMemoryResponse,
  JarvisProjectThreadDetail,
  JarvisProjectThreadQueuedTurn,
} from "@t3tools/contracts";

import { projectThreadMessageKey, type JarvisConversationMessage } from "./jarvisMessageKey.ts";
import type {
  AgentConversation,
  ConversationActivity,
  ConversationActivityPresentation,
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
  readonly turnId: string | null;
  readonly replayKey: string;
  readonly family: "tool" | "watch" | "terminal" | "reasoning" | "commentary";
  readonly kind: string;
  readonly status: ConversationActivityStatus;
  readonly title: string;
  readonly summary: string | null;
  readonly toolName: string | null;
  readonly relatedConversationIds: ReadonlyArray<string>;
  readonly observedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly presentation: ConversationActivityPresentation | null;
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
  const projected = projectItems(conversationId, thread.messages, thread.queued_turns ?? []);
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
  const hasQueuedTurns = (thread.queued_turns?.length ?? 0) > 0;
  if (!execution) {
    return {
      available: true,
      status: operationalState,
      activeTurn: null,
      pendingRequests: [],
      supportedControls: lifecycle === "archived" ? [] : ["turn"],
      supportsSteer: false,
      supportsQueue: hasQueuedTurns,
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
    supportsQueue: execution.supports.queue || hasQueuedTurns,
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
  queuedTurns: ReadonlyArray<JarvisProjectThreadQueuedTurn>,
): ProjectedItem[] {
  const items: ProjectedItem[] = [];
  const activities = new Map<string, ActivityAccumulator>();
  const legacyToolOccurrences = new Map<string, { pendingGroupKeys: Array<string> }>();
  const seen = new Set<string>();

  const orderedSource = source
    .map((sourceMessage, sourceIndex) => {
      const message = normalizeJarvisConversationMessage(sourceMessage);
      return {
        message,
        replayKey: projectThreadMessageKey(message),
        sourceIndex,
      };
    })
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
    // Worker protocol frames are represented as activities above. Unknown
    // event types stay forward-compatible but should not become chat bubbles.
    if (message.role === "event") return;
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
        turnId: messageTurnId(message),
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
      turnId: frame.turnId,
      relatedConversationIds: frame.relatedConversationIds,
      startedAt: frame.observedAt,
      completedAt: frame.completedAt,
      error: frame.error,
      ...(frame.presentation ? { presentation: frame.presentation } : {}),
    };
    items.push({ observedAt: frame.observedAt, sourceIndex: frame.sourceIndex, activity });
  }

  const seenQueueIds = new Set<string>();
  queuedTurns.forEach((turn, queueIndex) => {
    if (seenQueueIds.has(turn.queue_id)) return;
    seenQueueIds.add(turn.queue_id);
    const sourceIndex = orderedSource.length + queueIndex * 2;
    items.push({
      observedAt: turn.queued_at,
      sourceIndex,
      message: {
        id: stableId("queued-message", turn.queue_id),
        conversationId,
        role: "user",
        content: turn.text,
        authorId: null,
        turnId: turn.queue_id,
        observedAt: turn.queued_at,
      },
    });
    items.push({
      observedAt: turn.queued_at,
      sourceIndex: sourceIndex + 1,
      activity: {
        id: stableId("queued-activity", turn.queue_id),
        conversationId,
        kind: "turn.queued",
        status: turn.status === "claimed" ? "running" : "waiting",
        title: turn.status === "claimed" ? "Queued turn running" : "Turn queued",
        summary:
          turn.status === "claimed"
            ? "Jarvis claimed this queued turn."
            : "Waiting for the active turn to finish.",
        toolName: null,
        correlationId: turn.queue_id,
        turnId: turn.queue_id,
        relatedConversationIds: [],
        startedAt: turn.queued_at,
        completedAt: null,
        error: null,
      },
    });
  });

  return sortProjectedItems(items);
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
  left: {
    readonly message: JarvisConversationMessage;
    readonly replayKey: string;
    readonly sourceIndex: number;
  },
  right: {
    readonly message: JarvisConversationMessage;
    readonly replayKey: string;
    readonly sourceIndex: number;
  },
): number {
  const observed = left.message.observed_at.localeCompare(right.message.observed_at);
  if (observed !== 0) return observed;
  const leftSequence = left.message.sequence;
  const rightSequence = right.message.sequence;
  if (leftSequence !== undefined && rightSequence !== undefined) {
    if (leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.sourceIndex - right.sourceIndex;
  }
  if (leftSequence !== undefined) return -1;
  if (rightSequence !== undefined) return 1;
  return left.sourceIndex - right.sourceIndex;
}

interface ProjectedTurnOrder {
  readonly observedAt: string;
  readonly sourceIndex: number;
  readonly anchoredByUser: boolean;
}

function sortProjectedItems(items: ProjectedItem[]): ProjectedItem[] {
  const turnOrder = new Map<string, ProjectedTurnOrder>();
  for (const item of items) {
    const turnId = projectedItemTurnId(item);
    if (turnId === null) continue;
    const anchoredByUser = item.message?.role === "user";
    const current = turnOrder.get(turnId);
    if (
      current === undefined ||
      (anchoredByUser && !current.anchoredByUser) ||
      (anchoredByUser === current.anchoredByUser &&
        (item.observedAt.localeCompare(current.observedAt) < 0 ||
          (item.observedAt === current.observedAt && item.sourceIndex < current.sourceIndex)))
    ) {
      turnOrder.set(turnId, {
        observedAt: item.observedAt,
        sourceIndex: item.sourceIndex,
        anchoredByUser,
      });
    }
  }

  return items.sort((left, right) => {
    const leftTurnId = projectedItemTurnId(left);
    const rightTurnId = projectedItemTurnId(right);
    const leftGroup = leftTurnId === null ? null : turnOrder.get(leftTurnId);
    const rightGroup = rightTurnId === null ? null : turnOrder.get(rightTurnId);
    const groupObserved = (leftGroup?.observedAt ?? left.observedAt).localeCompare(
      rightGroup?.observedAt ?? right.observedAt,
    );
    if (groupObserved !== 0) return groupObserved;
    const groupSource =
      (leftGroup?.sourceIndex ?? left.sourceIndex) - (rightGroup?.sourceIndex ?? right.sourceIndex);
    if (groupSource !== 0) return groupSource;
    if (leftTurnId !== rightTurnId) {
      const groupIdentity = (leftTurnId ?? projectedItemId(left)).localeCompare(
        rightTurnId ?? projectedItemId(right),
      );
      if (groupIdentity !== 0) return groupIdentity;
    }
    const rank = projectedItemTurnRank(left) - projectedItemTurnRank(right);
    if (rank !== 0) return rank;
    return left.observedAt.localeCompare(right.observedAt) || left.sourceIndex - right.sourceIndex;
  });
}

function projectedItemTurnId(item: ProjectedItem): string | null {
  return item.message?.turnId ?? item.activity?.turnId ?? null;
}

function projectedItemTurnRank(item: ProjectedItem): number {
  if (item.message?.role === "user") return 0;
  if (item.activity) return 1;
  if (item.message?.role === "assistant") return 2;
  return 1;
}

function projectedItemId(item: ProjectedItem): string {
  return item.message?.id ?? item.activity?.id ?? String(item.sourceIndex);
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
      turnId: messageTurnId(message),
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
      presentation: null,
      expectedChildren: count,
    };
  }

  const terminalEnvelope = /^Child (.+) \(([^)]+)\) reached ([^:]+)(?:: (.*))?\.$/u.exec(
    message.content,
  );
  if (
    message.type === "child_terminal" ||
    (allowLegacyProse && message.role === "system" && terminalEnvelope)
  ) {
    const childId = clean(message.child_chat_id) ?? terminalEnvelope?.[2] ?? "unknown-child";
    const title = clean(message.title) ?? terminalEnvelope?.[1] ?? "Child code agent";
    const status = activityStatus(
      message.phase ?? terminalEnvelope?.[3],
      message.status,
      "waiting",
    );
    const error = clean(message.error) ?? clean(terminalEnvelope?.[4]);
    return {
      groupKey: `child:${childId}`,
      correlationId: childId,
      turnId: messageTurnId(message),
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
      presentation: null,
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
    const detail =
      clean(legacyTool?.[3]) ?? eventDetail(message) ?? clean(message.content) ?? "Tool activity";
    const toolName = eventToolName(message) ?? /^([\w.-]+)/u.exec(detail)?.[1] ?? null;
    const fallbackStatus = isResult ? "completed" : "requested";
    const status = activityStatus(message.phase, message.status, fallbackStatus);
    const correlation = clean(message.call_id) ?? clean(message.correlation_id);
    return {
      groupKey: correlation ? `tool:${correlation}` : `legacy-tool:${toolName ?? detail}`,
      correlationId: correlation ?? `legacy-tool:${toolName ?? detail}`,
      turnId: messageTurnId(message),
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
      presentation: toolActivityPresentation(message, toolName),
      ...(correlation
        ? {}
        : { legacyToolPhase: isResult ? ("result" as const) : ("call" as const) }),
    };
  }

  if (isReasoningEvent(message.type)) {
    const fallbackStatus = isReasoningCompletionEvent(message.type) ? "completed" : "running";
    const status = activityStatus(message.phase, message.status, fallbackStatus);
    const completed = terminalStatus(status);
    const correlation = clean(message.message_id) ?? clean(message.correlation_id) ?? replayKey;
    return {
      groupKey: `reasoning:${messageTurnId(message) ?? "unknown"}:${correlation}`,
      correlationId: correlation,
      turnId: messageTurnId(message),
      replayKey,
      family: "reasoning",
      kind: completed ? "reasoning.completed" : "reasoning.running",
      status,
      title: "Thinking",
      summary: eventDetail(message),
      toolName: null,
      relatedConversationIds: [],
      observedAt: message.observed_at,
      completedAt: completed ? message.observed_at : null,
      error: null,
      presentation: null,
    };
  }

  if (isCommentaryEvent(message.type)) {
    const correlation = clean(message.message_id) ?? clean(message.correlation_id) ?? replayKey;
    return {
      groupKey: `commentary:${messageTurnId(message) ?? "unknown"}:${correlation}`,
      correlationId: correlation,
      turnId: messageTurnId(message),
      replayKey,
      family: "commentary",
      kind: "commentary",
      status: "completed",
      title: commentaryTitle(message.type),
      summary: eventDetail(message),
      toolName: null,
      relatedConversationIds: [],
      observedAt: message.observed_at,
      completedAt: message.observed_at,
      error: null,
      presentation: null,
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
          : current.family === "reasoning" || current.family === "commentary"
            ? latest.kind
            : childKind(status),
    status,
    title:
      current.family === "tool"
        ? toolTitle(toolName, status)
        : current.family === "watch"
          ? watchTitle(status, count)
          : current.family === "reasoning" || current.family === "commentary"
            ? latest.title
            : latest.title,
    summary:
      current.family === "reasoning" || current.family === "commentary"
        ? mergeActivityText(current.summary, next.summary)
        : (latest.summary ?? current.summary),
    toolName,
    relatedConversationIds,
    observedAt: first.observedAt,
    completedAt: terminalStatus(status)
      ? (next.completedAt ?? current.completedAt ?? latest.observedAt)
      : null,
    error: latest.error ?? current.error,
    presentation: mergeActivityPresentation(current.presentation, next.presentation),
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
  let sawKnown = false;
  let result = fallback;
  for (const value of [status, phase]) {
    if (!value) continue;
    let next: ConversationActivityStatus | null = null;
    switch (value?.toLowerCase()) {
      case "requested":
        next = "requested";
        break;
      case "claimed":
      case "running":
      case "working":
        next = "running";
        break;
      case "waiting":
      case "pending":
        next = "waiting";
        break;
      case "completed":
      case "succeeded":
        next = "completed";
        break;
      case "failed":
        next = "failed";
        break;
      case "cancelled":
      case "canceled":
        next = "cancelled";
        break;
      default:
        sawUnknown = true;
    }
    if (next !== null) {
      sawKnown = true;
      result = preferStatus(result, next);
    }
  }
  return sawUnknown && !sawKnown && fallback === "completed" ? "waiting" : result;
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

/** Normalize Jarvis' durable nested event-message shape into the compatibility
 * shape used by the universal conversation projection. Explicit flattened
 * fields continue to win for older/newer mixed deployments. */
function normalizeJarvisConversationMessage(
  message: JarvisConversationMessage,
): JarvisConversationMessage {
  const event = asRecord(message.event);
  if (!event) return message;
  const eventData = asRecord(event.data);
  const eventItem = asRecord(eventData?.item);
  const normalizedData = eventData as JarvisConversationMessage["data"];
  return {
    ...message,
    event_id: message.event_id ?? readRecordString(event, "event_id") ?? undefined,
    message_id: message.message_id ?? readRecordString(event, "message_id") ?? undefined,
    call_id:
      message.call_id ??
      readRecordString(event, "call_id") ??
      readRecordString(eventData, "call_id", "id") ??
      readRecordString(eventItem, "call_id", "id") ??
      undefined,
    correlation_id:
      message.correlation_id ?? readRecordString(event, "correlation_id") ?? undefined,
    turn_id: message.turn_id ?? readRecordString(event, "turn_id") ?? undefined,
    sequence:
      message.sequence ??
      (typeof event.sequence === "number" && Number.isInteger(event.sequence)
        ? event.sequence
        : undefined),
    type: message.type ?? readRecordString(event, "type") ?? undefined,
    data: message.data ?? normalizedData,
  };
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

function messageTurnId(message: JarvisConversationMessage): string | null {
  return clean(message.turn_id) ?? readDataString(message, "turn_id");
}

function eventDetail(message: JarvisConversationMessage): string | null {
  const preserveIncrementalWhitespace =
    normalizedEventType(message.type)?.endsWith(".delta") === true;
  for (const key of ["text", "delta", "summary", "detail", "content", "output"] as const) {
    const value = message.data?.[key];
    if (typeof value === "string" && value.trim()) {
      return preserveIncrementalWhitespace || key === "delta" ? value : value.trim();
    }
    if (Array.isArray(value)) {
      const text = value.filter((item): item is string => typeof item === "string").join("\n");
      if (text.trim()) return preserveIncrementalWhitespace ? text : text.trim();
    }
  }
  return clean(message.content);
}

function eventToolName(message: JarvisConversationMessage): string | null {
  const item = message.data?.item;
  if (item !== null && typeof item === "object" && !Array.isArray(item)) {
    const name = (item as Record<string, unknown>).name;
    if (typeof name === "string") return clean(name);
  }
  return readDataString(message, "tool_name") ?? readDataString(message, "name");
}

function toolActivityPresentation(
  message: JarvisConversationMessage,
  fallbackToolName: string | null,
): ConversationActivityPresentation | null {
  const data = message.data;
  const item = asRecord(data?.item);
  const itemInput = asRecord(item?.input);
  const itemResult = asRecord(item?.result);
  const dataInput = asRecord(data?.input);
  const dataOutput = asRecord(data?.output) ?? asRecord(data?.result);
  const itemType =
    readRecordString(data, "item_type", "itemType") ??
    readRecordString(item, "item_type", "itemType", "type");
  const toolTitle =
    readRecordString(data, "title", "tool_title", "toolTitle", "tool_name", "toolName") ??
    readRecordString(item, "title", "name") ??
    fallbackToolName;
  const explicitRawCommand = firstCommandValue(
    item?.rawCommand,
    item?.raw_command,
    itemInput?.rawCommand,
    itemInput?.raw_command,
    data?.rawCommand,
    data?.raw_command,
  );
  const commandValue = firstCommandValue(
    item?.command,
    itemInput?.command,
    itemResult?.command,
    data?.command,
    dataInput?.command,
    dataOutput?.command,
    itemType === "command_execution" ? data?.input : undefined,
    explicitRawCommand,
  );
  const command = normalizeCommandValue(commandValue);
  const formattedCommand = formatCommandValue(commandValue);
  const rawCommand =
    formatCommandValue(explicitRawCommand) ??
    (formattedCommand && command && formattedCommand !== command ? formattedCommand : null);
  const changedFiles = extractChangedFiles(data, item, itemType);
  const toolData = extractToolData(data, item, toolTitle);

  if (
    !command &&
    !rawCommand &&
    changedFiles.length === 0 &&
    !toolTitle &&
    toolData === undefined &&
    !itemType
  ) {
    return null;
  }
  return {
    ...(command ? { command } : {}),
    ...(rawCommand ? { rawCommand } : {}),
    ...(changedFiles.length > 0 ? { changedFiles } : {}),
    ...(toolTitle ? { toolTitle } : {}),
    ...(toolData !== undefined ? { toolData } : {}),
    ...(itemType ? { itemType } : {}),
  };
}

function extractToolData(
  data: Record<string, unknown> | undefined,
  item: Record<string, unknown> | null,
  toolTitle: string | null,
): unknown {
  if (item) return item;
  if (!data) return undefined;
  const input = data.input ?? data.arguments;
  const result = data.output ?? data.result ?? data.content;
  if (input === undefined && result === undefined) return undefined;
  return {
    ...(toolTitle ? { name: toolTitle } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(result !== undefined ? { result } : {}),
  };
}

function mergeActivityPresentation(
  current: ConversationActivityPresentation | null,
  next: ConversationActivityPresentation | null,
): ConversationActivityPresentation | null {
  if (!current) return next;
  if (!next) return current;
  const changedFiles = unique([...(current.changedFiles ?? []), ...(next.changedFiles ?? [])]);
  const toolData = mergeToolData(current.toolData, next.toolData);
  return {
    ...((next.command ?? current.command) ? { command: next.command ?? current.command } : {}),
    ...((next.rawCommand ?? current.rawCommand)
      ? { rawCommand: next.rawCommand ?? current.rawCommand }
      : {}),
    ...(changedFiles.length > 0 ? { changedFiles } : {}),
    ...((next.toolTitle ?? current.toolTitle)
      ? { toolTitle: next.toolTitle ?? current.toolTitle }
      : {}),
    ...(toolData !== undefined ? { toolData } : {}),
    ...((next.itemType ?? current.itemType) ? { itemType: next.itemType ?? current.itemType } : {}),
  };
}

function mergeToolData(current: unknown, next: unknown): unknown {
  if (next === undefined) return current;
  if (current === undefined) return next;
  const currentRecord = asRecord(current);
  const nextRecord = asRecord(next);
  return currentRecord && nextRecord ? { ...currentRecord, ...nextRecord } : next;
}

function extractChangedFiles(
  data: Record<string, unknown> | undefined,
  item: Record<string, unknown> | null,
  itemType: string | null,
): string[] {
  const changedFiles: string[] = [];
  const seen = new Set<string>();
  const roots: unknown[] = [
    data?.changedFiles,
    data?.changed_files,
    item?.changedFiles,
    item?.changed_files,
  ];
  if (itemType === "file_change") {
    roots.push(item, data);
  }
  for (const root of roots) {
    collectChangedFiles(root, changedFiles, seen, 0);
  }
  return changedFiles;
}

function collectChangedFiles(
  value: unknown,
  target: string[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 5 || target.length >= 12) return;
  if (typeof value === "string") {
    pushChangedFile(value, target, seen);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectChangedFiles(entry, target, seen, depth + 1);
      if (target.length >= 12) return;
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const key of [
    "path",
    "filePath",
    "relativePath",
    "filename",
    "newPath",
    "oldPath",
  ] as const) {
    pushChangedFile(record[key], target, seen);
  }
  for (const key of [
    "item",
    "result",
    "output",
    "data",
    "changes",
    "changedFiles",
    "changed_files",
    "files",
    "edits",
    "patch",
    "patches",
    "operations",
  ] as const) {
    if (key in record) collectChangedFiles(record[key], target, seen, depth + 1);
  }
}

function pushChangedFile(value: unknown, target: string[], seen: Set<string>): void {
  if (typeof value !== "string") return;
  const path = clean(value);
  if (!path || seen.has(path) || target.length >= 12) return;
  seen.add(path);
  target.push(path);
}

function firstCommandValue(...values: ReadonlyArray<unknown>): unknown {
  return values.find((value) => formatCommandValue(value) !== null);
}

function formatCommandValue(value: unknown): string | null {
  if (typeof value === "string") return clean(value);
  if (!Array.isArray(value)) return null;
  const parts = value.flatMap((part) => (typeof part === "string" && clean(part) ? [part] : []));
  if (parts.length === 0) return null;
  return parts.map((part) => (/\s|["'`]/u.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function normalizeCommandValue(value: unknown): string | null {
  const formatted = formatCommandValue(value);
  if (!formatted) return null;
  const match = /^(?:bash|sh|zsh)\s+-(?:l)?c\s+([\s\S]+)$/u.exec(formatted);
  if (!match?.[1]) return formatted;
  return trimMatchingOuterQuotes(match[1]);
}

function trimMatchingOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readRecordString(
  record: Record<string, unknown> | null | undefined,
  ...keys: ReadonlyArray<string>
): string | null {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && clean(value)) return clean(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readDataString(message: JarvisConversationMessage, key: string): string | null {
  const value = message.data?.[key];
  return typeof value === "string" ? clean(value) : null;
}

function normalizedEventType(type: string | null | undefined): string | null {
  return clean(type)?.toLowerCase() ?? null;
}

function isReasoningEvent(type: string | null | undefined): boolean {
  const normalized = normalizedEventType(type);
  return (
    normalized === "reasoning.delta" ||
    normalized === "reasoning.completed" ||
    normalized === "reasoning" ||
    normalized === "assistant.reasoning" ||
    normalized?.startsWith("assistant.reasoning.") === true ||
    normalized === "thinking" ||
    normalized === "analysis"
  );
}

function isReasoningCompletionEvent(type: string | null | undefined): boolean {
  const normalized = normalizedEventType(type);
  return normalized?.endsWith(".completed") === true || normalized?.endsWith(".done") === true;
}

function isCommentaryEvent(type: string | null | undefined): boolean {
  return (
    type === "assistant.commentary" ||
    type === "commentary" ||
    type === "progress" ||
    type === "update" ||
    type === "action" ||
    type === "step"
  );
}

function commentaryTitle(type: string | null | undefined): string {
  return type === "action" || type === "step" ? "Action" : "Progress update";
}

function mergeActivityText(current: string | null, next: string | null): string | null {
  if (!current) return next;
  if (!next || next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.endsWith(next)) return current;
  return `${current}${next}`;
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
