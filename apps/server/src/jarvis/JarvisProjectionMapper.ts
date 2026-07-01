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
  OrchestrationThreadShell,
  ProviderInstanceId,
  TurnId,
} from "@t3tools/contracts";

export {
  JARVIS_PROJECT_ID_PREFIX,
  JARVIS_THREAD_ID_PREFIX,
  isJarvisThreadId,
  jarvisProjectIdForRun,
  jarvisSessionIdFromThreadId,
  jarvisThreadIdForSession,
} from "./JarvisIds.ts";
import { jarvisProjectIdForRun, jarvisThreadIdForSession } from "./JarvisIds.ts";
import {
  type CockpitCheckpoint,
  type CockpitLatestTurn,
  type CockpitTimelineActivity,
  type CockpitTimelineMessage,
  projectJarvisSessionForCockpit,
} from "./JarvisCockpitProjection.ts";

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
  const cockpit = projectJarvisSessionForCockpit({
    session: input.session,
    events: input.events,
    checkpoints: input.checkpoints ?? [],
  });
  const messages = cockpit.messages.map(mapCockpitMessage);
  const activities = cockpit.activities.map(mapCockpitActivity);
  const latestTurn = cockpit.latestTurn ? mapCockpitLatestTurn(cockpit.latestTurn) : null;
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
    updatedAt: cockpit.latestEventTime ?? input.session.updated_at,
    archivedAt: null,
    deletedAt: null,
    messages,
    proposedPlans: [],
    activities,
    checkpoints: cockpit.checkpoints.map(mapCockpitCheckpoint),
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

function mapCockpitMessage(message: CockpitTimelineMessage): OrchestrationMessage {
  return {
    id: MessageId.make(message.id),
    role: message.role,
    text: message.text,
    turnId: message.turnId ? TurnId.make(message.turnId) : null,
    streaming: message.streaming,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

function mapCockpitActivity(activity: CockpitTimelineActivity): OrchestrationThreadActivity {
  return {
    id: EventId.make(activity.id),
    tone: activity.tone,
    kind: activity.kind,
    summary: activity.summary,
    payload: activity.payload,
    turnId: activity.turnId ? TurnId.make(activity.turnId) : null,
    sequence: activity.sequence,
    createdAt: activity.createdAt,
  };
}

function mapCockpitLatestTurn(
  latestTurn: CockpitLatestTurn,
): NonNullable<OrchestrationThread["latestTurn"]> {
  return {
    turnId: TurnId.make(latestTurn.turnId),
    state: latestTurn.state,
    requestedAt: latestTurn.requestedAt,
    startedAt: latestTurn.startedAt,
    completedAt: latestTurn.completedAt,
    assistantMessageId: latestTurn.assistantMessageId
      ? MessageId.make(latestTurn.assistantMessageId)
      : null,
  };
}

function mapCockpitCheckpoint(checkpoint: CockpitCheckpoint): OrchestrationCheckpointSummary {
  return {
    turnId: TurnId.make(checkpoint.turnId),
    checkpointTurnCount: checkpoint.checkpointTurnCount,
    checkpointRef: CheckpointRef.make(checkpoint.checkpointRef),
    status: checkpoint.status,
    files: [],
    assistantMessageId: checkpoint.assistantMessageId
      ? MessageId.make(checkpoint.assistantMessageId)
      : null,
    completedAt: checkpoint.completedAt,
  };
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
