import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  EventId,
  JarvisRun,
  JarvisRunsSnapshot,
  JarvisSessionEvent,
  JarvisWorkerSession,
  MessageId,
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

export const jarvisThreadIdForSession = (sessionId: string): ThreadId =>
  ThreadId.make(`${JARVIS_THREAD_ID_PREFIX}${sessionId}`);

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
            events: input.eventsBySession.get(session.session_id) ?? [],
          })
        : mapJarvisSessionToThreadDetail({
            session,
            events: input.eventsBySession.get(session.session_id) ?? [],
          });
    }),
    updatedAt: input.snapshot.generated_at,
  };
}

export function mapJarvisSessionToThreadDetail(input: {
  readonly session: JarvisWorkerSession;
  readonly run?: JarvisRun;
  readonly events: ReadonlyArray<JarvisSessionEvent>;
  readonly snapshotSequence?: number;
}): OrchestrationThread {
  const threadId = jarvisThreadIdForSession(input.session.session_id);
  const projectId = jarvisProjectIdForRun(
    input.session.run_id ?? `session-${input.session.session_id}`,
  );
  const sortedEvents = [...input.events].sort((a, b) => a.time.localeCompare(b.time));
  const messages = sortedEvents.flatMap((event) => eventToMessages(event));
  const activities = sortedEvents.map((event, index) => eventToActivity(event, index));
  const latestTurnEvent = sortedEvents.toReversed().find((event) => readTurnId(event) !== null);
  const latestTurnId = latestTurnEvent ? readTurnId(latestTurnEvent) : null;
  return {
    id: threadId,
    projectId,
    title: titleForSession(input.session, input.run),
    modelSelection: modelSelectionForSession(input.session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: input.session.branch ?? input.run?.branch ?? null,
    worktreePath: input.session.cwd ?? input.run?.cwd ?? null,
    latestTurn:
      latestTurnId !== null && latestTurnEvent
        ? {
            turnId: TurnId.make(latestTurnId),
            state: latestTurnStateForEvent(latestTurnEvent),
            requestedAt: latestTurnEvent.time,
            startedAt: latestTurnEvent.type === "turn.started" ? latestTurnEvent.time : null,
            completedAt:
              latestTurnEvent.type === "turn.completed" || latestTurnEvent.type === "turn.failed"
                ? latestTurnEvent.time
                : null,
            assistantMessageId:
              messages.find((message) => message.turnId === latestTurnId)?.id ?? null,
          }
        : null,
    createdAt: input.session.created_at,
    updatedAt: latestEventTime(sortedEvents) ?? input.session.updated_at,
    archivedAt: null,
    deletedAt: null,
    messages,
    proposedPlans: [],
    activities,
    checkpoints: [],
    session: sessionForWorkerSession(input.session),
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
    run.cwd ??
    matchingSessions.find((session) => session.cwd !== undefined && session.cwd !== null)?.cwd ??
    run.repo ??
    `/jarvis/${run.run_id}`;
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
    id: jarvisThreadIdForSession(session.session_id),
    projectId: jarvisProjectIdForRun(session.run_id ?? `session-${session.session_id}`),
    title: titleForSession(session, run),
    modelSelection: modelSelectionForSession(session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: session.branch ?? run?.branch ?? null,
    worktreePath: session.cwd ?? run?.cwd ?? null,
    latestTurn: null,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    archivedAt: null,
    session: sessionForWorkerSession(session),
    latestUserMessageAt: null,
    hasPendingApprovals: session.status === "needs_approval" || run?.needs_approval === true,
    hasPendingUserInput: session.status === "needs_input" || run?.needs_input === true,
    hasActionableProposedPlan: false,
  };
}

function sessionForWorkerSession(session: JarvisWorkerSession): OrchestrationSession {
  return {
    threadId: jarvisThreadIdForSession(session.session_id),
    status: sessionStatusForWorkerStatus(session.status),
    providerName: session.provider,
    providerInstanceId: ProviderInstanceId.make(jarvisProviderInstanceId(session.provider)),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    activeTurnId: null,
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
      id: MessageId.make(`jarvis-message:${event.event_id}`),
      role: "assistant",
      text,
      turnId: readTurnId(event) ? TurnId.make(readTurnId(event) ?? "") : null,
      streaming: event.type === "assistant.delta",
      createdAt: event.time,
      updatedAt: event.time,
    },
  ];
}

function eventToActivity(event: JarvisSessionEvent, index: number): OrchestrationThreadActivity {
  return {
    id: EventId.make(`jarvis-event:${event.event_id}`),
    tone: toneForEvent(event),
    kind: event.type,
    summary: summaryForEvent(event),
    payload: event.data,
    turnId: readTurnId(event) ? TurnId.make(readTurnId(event) ?? "") : null,
    sequence: index,
    createdAt: event.time,
  };
}

function titleForSession(session: JarvisWorkerSession, run: JarvisRun | undefined): string {
  return session.title ?? run?.title ?? session.session_id;
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
  return typeof event.data.turn_id === "string" && event.data.turn_id.trim().length > 0
    ? event.data.turn_id
    : null;
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
  return [...events].sort((a, b) => b.time.localeCompare(a.time))[0]?.time ?? null;
}
