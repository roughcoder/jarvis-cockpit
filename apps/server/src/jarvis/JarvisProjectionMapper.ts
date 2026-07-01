import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  CheckpointRef,
  EventId,
  JarvisRun,
  JarvisRunsSnapshot,
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisWorkerSession,
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationProject,
  OrchestrationProjectShell,
  OrchestrationReadModel,
  OrchestrationSession,
  type OrchestrationSessionStatus,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadActivityTone,
  OrchestrationThreadShell,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

export const JARVIS_PROJECT_ID_PREFIX = "jarvis-run_";
export const JARVIS_THREAD_ID_PREFIX = "jarvis-session_";

export const jarvisProjectIdForRun = (runId: string): ProjectId =>
  ProjectId.make(`${JARVIS_PROJECT_ID_PREFIX}${runId}`);

export const jarvisThreadIdForSession = (sessionRef: string): ThreadId =>
  ThreadId.make(`${JARVIS_THREAD_ID_PREFIX}${sessionRef}`);

export const isJarvisThreadId = (threadId: string): boolean =>
  threadId.startsWith(JARVIS_THREAD_ID_PREFIX);

export const jarvisSessionIdFromThreadId = (threadId: string): string | null =>
  isJarvisThreadId(threadId) ? threadId.slice(JARVIS_THREAD_ID_PREFIX.length) : null;

export function mapJarvisRunsSnapshotToShellSnapshot(
  snapshot: JarvisRunsSnapshot,
): OrchestrationShellSnapshot {
  const runsById = new Map(snapshot.runs.map((run) => [run.run_id, run]));
  return {
    snapshotSequence: 0,
    projects: snapshot.runs.map((run) => mapRunToProjectShell(run, snapshot.sessions)),
    threads: snapshot.sessions.map((session) =>
      mapSessionToThreadShell(
        session,
        session.run_id !== undefined ? runsById.get(session.run_id) : undefined,
      ),
    ),
    updatedAt: snapshot.generated_at,
  };
}

export function mapJarvisRunsSnapshotToReadModel(input: {
  readonly snapshot: JarvisRunsSnapshot;
  readonly eventsBySession: ReadonlyMap<string, ReadonlyArray<JarvisSessionEvent>>;
  readonly checkpointsBySession?: ReadonlyMap<string, ReadonlyArray<JarvisSessionCheckpoint>>;
}): OrchestrationReadModel {
  const runsById = new Map(input.snapshot.runs.map((run) => [run.run_id, run]));
  return {
    snapshotSequence: 0,
    projects: input.snapshot.runs.map((run) => mapRunToProject(run, input.snapshot.sessions)),
    threads: input.snapshot.sessions.map((session) => {
      const run = session.run_id !== undefined ? runsById.get(session.run_id) : undefined;
      return run
        ? mapJarvisSessionToThreadDetail({
            session,
            run,
            events: input.eventsBySession.get(session.session_ref) ?? [],
            checkpoints: input.checkpointsBySession?.get(session.session_ref) ?? [],
          })
        : mapJarvisSessionToThreadDetail({
            session,
            events: input.eventsBySession.get(session.session_ref) ?? [],
            checkpoints: input.checkpointsBySession?.get(session.session_ref) ?? [],
          });
    }),
    updatedAt: input.snapshot.generated_at,
  };
}

export function mapJarvisSessionToThreadDetail(input: {
  readonly session: JarvisWorkerSession;
  readonly run?: JarvisRun;
  readonly events: ReadonlyArray<JarvisSessionEvent>;
  readonly checkpoints?: ReadonlyArray<JarvisSessionCheckpoint>;
  readonly snapshotSequence?: number;
}): OrchestrationThread {
  const threadId = jarvisThreadIdForSession(input.session.session_ref);
  const projectId = jarvisProjectIdForRun(input.session.run_id);
  const sortedEvents = [...input.events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const messages = sortedEvents.flatMap((event) => eventToMessages(event));
  const activities = sortedEvents.map((event, index) => eventToActivity(event, index));
  const latestTurn = latestTurnForEvents(sortedEvents, messages);
  return {
    id: threadId,
    projectId,
    title: titleForSession(input.session, input.run),
    modelSelection: modelSelectionForSession(input.session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: input.session.branch ?? input.run?.branch ?? null,
    worktreePath: input.session.cwd_label ?? input.session.repo ?? input.run?.repo ?? null,
    latestTurn,
    createdAt: input.session.created_at,
    updatedAt: latestEventTime(sortedEvents) ?? input.session.updated_at,
    archivedAt: null,
    deletedAt: null,
    messages,
    proposedPlans: [],
    activities,
    checkpoints: checkpointsForSession({
      session: input.session,
      checkpoints: input.checkpoints ?? [],
      messages,
    }),
    session: sessionForWorkerSession(input.session, latestTurn),
  };
}

function mapRunToProject(
  run: JarvisRun,
  sessions: ReadonlyArray<JarvisWorkerSession>,
): OrchestrationProject {
  return {
    ...mapRunToProjectShell(run, sessions),
    deletedAt: null,
  };
}

function mapRunToProjectShell(
  run: JarvisRun,
  sessions: ReadonlyArray<JarvisWorkerSession>,
): OrchestrationProjectShell {
  const matchingSessions = sessions.filter((session) => session.run_id === run.run_id);
  const workspaceRoot =
    run.repo ??
    matchingSessions.find(
      (session) => session.cwd_label !== undefined && session.cwd_label !== null,
    )?.cwd_label ??
    run.title;
  return {
    id: jarvisProjectIdForRun(run.run_id),
    title: run.title,
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

function mapSessionToThreadShell(
  session: JarvisWorkerSession,
  run: JarvisRun | undefined,
): OrchestrationThreadShell {
  return {
    id: jarvisThreadIdForSession(session.session_ref),
    projectId: jarvisProjectIdForRun(session.run_id),
    title: titleForSession(session, run),
    modelSelection: modelSelectionForSession(session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: session.branch ?? run?.branch ?? null,
    worktreePath: session.cwd_label ?? session.repo ?? run?.repo ?? null,
    latestTurn: null,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    archivedAt: null,
    session: sessionForWorkerSession(session, null),
    latestUserMessageAt: null,
    hasPendingApprovals:
      session.pending_approval_count > 0 ||
      session.status === "needs_approval" ||
      (run?.pending_approval_count ?? 0) > 0,
    hasPendingUserInput:
      session.pending_input_count > 0 ||
      session.status === "needs_input" ||
      (run?.pending_input_count ?? 0) > 0,
    hasActionableProposedPlan: false,
  };
}

function sessionForWorkerSession(
  session: JarvisWorkerSession,
  latestTurn: NonNullable<OrchestrationThread["latestTurn"]> | null,
): OrchestrationSession {
  const status = sessionStatusForWorkerStatus(session.status);
  return {
    threadId: jarvisThreadIdForSession(session.session_ref),
    status,
    providerName: session.provider,
    providerInstanceId: ProviderInstanceId.make(jarvisProviderInstanceId(session.provider)),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    activeTurnId:
      status === "running" && latestTurn?.state === "running" ? latestTurn.turnId : null,
    lastError: session.status === "failed" ? "Jarvis session failed" : null,
    updatedAt: session.updated_at,
  };
}

function eventToMessages(event: JarvisSessionEvent): ReadonlyArray<OrchestrationMessage> {
  if (event.type !== "assistant.message" && event.type !== "assistant.delta") {
    return [];
  }
  const text = readText(event) ?? "";
  return [
    {
      id: MessageId.make(
        `jarvis-message:${event.message_id ?? readTurnId(event) ?? event.event_id}`,
      ),
      role: "assistant",
      text,
      turnId: readTurnId(event) ? TurnId.make(readTurnId(event) ?? "") : null,
      streaming: event.type === "assistant.delta",
      createdAt: event.occurred_at,
      updatedAt: event.occurred_at,
    },
  ];
}

function eventToActivity(event: JarvisSessionEvent, index: number): OrchestrationThreadActivity {
  return {
    id: EventId.make(`jarvis-event:${event.event_id}`),
    tone: toneForEvent(event),
    kind: activityKindForEvent(event),
    summary: summaryForEvent(event),
    payload: activityPayloadForEvent(event),
    turnId: readTurnId(event) ? TurnId.make(readTurnId(event) ?? "") : null,
    sequence: index,
    createdAt: event.occurred_at,
  };
}

function latestTurnForEvents(
  events: ReadonlyArray<JarvisSessionEvent>,
  messages: ReadonlyArray<OrchestrationMessage>,
): OrchestrationThread["latestTurn"] {
  const latestTurnEvent = events.toReversed().find((event) => readTurnId(event) !== null);
  const latestTurnId = latestTurnEvent ? readTurnId(latestTurnEvent) : null;
  if (latestTurnId === null || !latestTurnEvent) {
    return null;
  }
  const turnEvents = events.filter((event) => readTurnId(event) === latestTurnId);
  const startedEvent = turnEvents.find((event) => event.type === "turn.started");
  const terminalEvent = turnEvents
    .toReversed()
    .find((event) => event.type === "turn.completed" || event.type === "turn.failed");
  return {
    turnId: TurnId.make(latestTurnId),
    state: latestTurnStateForEvent(terminalEvent ?? latestTurnEvent),
    requestedAt:
      startedEvent?.occurred_at ?? turnEvents[0]?.occurred_at ?? latestTurnEvent.occurred_at,
    startedAt: startedEvent?.occurred_at ?? null,
    completedAt: terminalEvent?.occurred_at ?? null,
    assistantMessageId:
      messages.find((message) => message.turnId === TurnId.make(latestTurnId))?.id ?? null,
  };
}

function checkpointsForSession(input: {
  readonly session: JarvisWorkerSession;
  readonly checkpoints: ReadonlyArray<JarvisSessionCheckpoint>;
  readonly messages: ReadonlyArray<OrchestrationMessage>;
}): ReadonlyArray<OrchestrationCheckpointSummary> {
  return input.checkpoints.map((checkpoint, index) => {
    const eventTurnId = readJsonString(checkpoint.event, "turn_id", "turnId");
    const turnId = TurnId.make(eventTurnId ?? checkpoint.checkpoint_id);
    return {
      turnId,
      checkpointTurnCount: index + 1,
      checkpointRef: CheckpointRef.make(
        `jarvis:${input.session.session_ref}:${checkpoint.checkpoint_id}`,
      ),
      status: "ready",
      files: [],
      assistantMessageId: input.messages.find((message) => message.turnId === turnId)?.id ?? null,
      completedAt:
        readJsonString(checkpoint.event, "occurred_at", "time", "created_at", "createdAt") ??
        input.session.updated_at,
    };
  });
}

function titleForSession(session: JarvisWorkerSession, run: JarvisRun | undefined): string {
  return session.title ?? run?.title ?? session.session_ref;
}

function modelSelectionForSession(session: JarvisWorkerSession) {
  return {
    instanceId: ProviderInstanceId.make(jarvisProviderInstanceId(session.provider)),
    model: session.engine,
  };
}

function jarvisProviderInstanceId(provider: string): string {
  const normalized = provider.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `jarvis_${normalized.length > 0 ? normalized : "provider"}`;
}

function sessionStatusForWorkerStatus(
  status: JarvisWorkerSession["status"],
): OrchestrationSessionStatus {
  switch (status) {
    case "created":
      return "starting";
    case "running":
    case "waiting_provider":
    case "needs_input":
    case "needs_approval":
      return "running";
    case "interrupted":
      return "interrupted";
    case "stopped":
      return "stopped";
    case "completed":
      return "ready";
    case "failed":
      return "error";
  }
}

function latestTurnStateForEvent(event: JarvisSessionEvent) {
  switch (event.type) {
    case "session.interrupted":
      return "interrupted" as const;
    case "turn.completed":
      return "completed" as const;
    case "turn.failed":
      return "error" as const;
    default:
      return "running" as const;
  }
}

function toneForEvent(event: JarvisSessionEvent): OrchestrationThreadActivityTone {
  if (event.type === "turn.failed") return "error";
  if (event.type.startsWith("tool.")) return "tool";
  if (event.type.startsWith("approval.")) return "approval";
  return "info";
}

function activityKindForEvent(event: JarvisSessionEvent): string {
  switch (event.type) {
    case "input.requested":
      return "user-input.requested";
    case "input.received":
      return "user-input.resolved";
    default:
      return event.type;
  }
}

function activityPayloadForEvent(event: JarvisSessionEvent): Record<string, unknown> {
  const requestId = readRequestId(event);
  if (event.type === "approval.requested") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
      requestKind: approvalRequestKindForEvent(event),
      requestType: readJsonString(event.data, "requestType", "request_type"),
      detail: readText(event) ?? summaryForEvent(event),
    };
  }
  if (event.type === "approval.resolved") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (event.type === "input.requested") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
      questions: readQuestions(event) ?? [defaultUserInputQuestion(event)],
    };
  }
  if (event.type === "input.received") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
    };
  }
  return event.data;
}

function summaryForEvent(event: JarvisSessionEvent): string {
  const text = readText(event);
  if (text) return text;
  switch (event.type) {
    case "session.created":
      return "Session created";
    case "turn.started":
      return "Turn started";
    case "turn.waiting_provider":
      return "Waiting for provider adapter";
    case "assistant.delta":
    case "assistant.message":
      return "Assistant message";
    case "tool.call":
      return "Tool call";
    case "tool.result":
      return "Tool result";
    case "approval.requested":
      return "Approval requested";
    case "approval.resolved":
      return "Approval resolved";
    case "input.requested":
      return "Input requested";
    case "input.received":
      return "Input received";
    case "checkpoint.created":
      return "Checkpoint created";
    case "checkpoint.restored":
      return "Checkpoint restored";
    case "turn.completed":
      return "Turn completed";
    case "turn.failed":
      return "Turn failed";
    case "session.interrupted":
      return "Session interrupted";
    case "session.stopped":
      return "Session stopped";
    default:
      return `Jarvis event: ${event.type}`;
  }
}

function readTurnId(event: JarvisSessionEvent): string | null {
  if (typeof event.turn_id === "string" && event.turn_id.trim().length > 0) {
    return event.turn_id;
  }
  return typeof event.data.turn_id === "string" && event.data.turn_id.trim().length > 0
    ? event.data.turn_id
    : null;
}

function readRequestId(event: JarvisSessionEvent): string | null {
  return readJsonString(event.data, "request_id", "requestId");
}

function approvalRequestKindForEvent(
  event: JarvisSessionEvent,
): "command" | "file-read" | "file-change" {
  const requestKind = readJsonString(event.data, "requestKind", "request_kind");
  if (requestKind === "command" || requestKind === "file-read" || requestKind === "file-change") {
    return requestKind;
  }
  switch (readJsonString(event.data, "requestType", "request_type")) {
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return "command";
  }
}

function readJsonString(
  data: Record<string, unknown>,
  ...keys: ReadonlyArray<string>
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function readQuestions(event: JarvisSessionEvent): unknown[] | null {
  const questions = event.data.questions;
  return Array.isArray(questions) ? questions : null;
}

function defaultUserInputQuestion(event: JarvisSessionEvent) {
  return {
    id: "response",
    header: "Input",
    question: readText(event) ?? "Jarvis is waiting for input.",
    options: [
      {
        label: "Respond",
        description: "Provide a response in the composer.",
      },
    ],
    multiSelect: false,
  };
}

function readText(event: JarvisSessionEvent): string | null {
  for (const key of ["text", "message", "content", "summary", "prompt"]) {
    const value = event.data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function latestEventTime(events: ReadonlyArray<JarvisSessionEvent>): string | null {
  return (
    [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]?.occurred_at ?? null
  );
}
