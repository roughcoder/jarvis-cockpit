import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  CheckpointRef,
  EventId,
  JARVIS_WORK_PURPOSE_WORKER_READINESS,
  JarvisRun,
  JarvisRunsSnapshot,
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisWorkerSession,
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
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
import { JARVIS_START_PROJECT_ID } from "./JarvisIds.ts";
import {
  type CockpitCheckpoint,
  type CockpitLatestTurn,
  type CockpitTimelineActivity,
  type CockpitTimelineMessage,
  projectJarvisSessionForCockpit,
} from "./JarvisCockpitProjection.ts";

type LinkedJarvisWorkerSession = JarvisWorkerSession & {
  readonly run_id: JarvisRun["run_id"];
};

function isLinkedJarvisWorkerSession(
  session: JarvisWorkerSession,
): session is LinkedJarvisWorkerSession {
  return session.run_id !== null;
}

export function mapJarvisRunsSnapshotToShellSnapshot(
  snapshot: JarvisRunsSnapshot,
): OrchestrationShellSnapshot {
  return mapJarvisRunsSnapshotToShellSnapshotWithSessions(
    snapshot,
    activeJarvisRuns(snapshot),
    activeJarvisSessionsForSnapshot(snapshot),
    { includeStartWorkProject: true },
  );
}

export function mapJarvisArchivedRunsSnapshotToShellSnapshot(
  snapshot: JarvisRunsSnapshot,
): OrchestrationShellSnapshot {
  return mapJarvisRunsSnapshotToShellSnapshotWithSessions(
    snapshot,
    archivedJarvisRuns(snapshot),
    archivedJarvisSessionsForSnapshot(snapshot),
    { includeStartWorkProject: false },
  );
}

function mapJarvisRunsSnapshotToShellSnapshotWithSessions(
  snapshot: JarvisRunsSnapshot,
  runs: ReadonlyArray<JarvisRun>,
  sessions: ReadonlyArray<LinkedJarvisWorkerSession>,
  options: {
    readonly includeStartWorkProject: boolean;
  },
): OrchestrationShellSnapshot {
  const runsById = new Map(snapshot.runs.map((run) => [run.run_id, run]));
  const projects = mapRunsAndSessionsToProjectShells(runs, sessions);
  return {
    snapshotSequence: 0,
    projects: startWorkProjectShellsForSnapshot(snapshot, projects, options),
    threads: sessions.map((session) =>
      mapSessionToThreadShell(session, runsById.get(session.run_id)),
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
  const activeRuns = activeJarvisRuns(input.snapshot);
  const activeSessions = activeJarvisSessionsForSnapshot(input.snapshot);
  const projects = mapRunsAndSessionsToProjectShells(activeRuns, activeSessions);
  return {
    snapshotSequence: 0,
    projects: startWorkProjectShellsForSnapshot(input.snapshot, projects, {
      includeStartWorkProject: true,
    }).map((project) => ({
      ...project,
      deletedAt: null,
    })),
    threads: activeSessions.map((session) => {
      const run = runsById.get(session.run_id);
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

// Internal diagnostics work (worker readiness probes) is tagged via start-work
// metadata.purpose and hidden from user-facing project/work projections.
function hasInternalWorkPurpose(metadata: Readonly<Record<string, unknown>> | undefined): boolean {
  return metadata?.["purpose"] === JARVIS_WORK_PURPOSE_WORKER_READINESS;
}

// A run counts as internal when it carries the tag itself, or when every one of
// its sessions does (Jarvis may echo start-work metadata on sessions only).
function internalPurposeRunIds(snapshot: JarvisRunsSnapshot): ReadonlySet<JarvisRun["run_id"]> {
  const internal = new Set(
    snapshot.runs.filter((run) => hasInternalWorkPurpose(run.metadata)).map((run) => run.run_id),
  );
  const sessionCounts = new Map<JarvisRun["run_id"], { total: number; tagged: number }>();
  for (const session of snapshot.sessions) {
    if (session.run_id === null) {
      continue;
    }
    const counts = sessionCounts.get(session.run_id) ?? { total: 0, tagged: 0 };
    counts.total += 1;
    if (hasInternalWorkPurpose(session.metadata)) {
      counts.tagged += 1;
    }
    sessionCounts.set(session.run_id, counts);
  }
  for (const [runId, counts] of sessionCounts) {
    if (counts.tagged === counts.total) {
      internal.add(runId);
    }
  }
  return internal;
}

export function activeJarvisSessionsForSnapshot(
  snapshot: JarvisRunsSnapshot,
): ReadonlyArray<LinkedJarvisWorkerSession> {
  const archivedRunIds = new Set(archivedJarvisRuns(snapshot).map((run) => run.run_id));
  const internalRunIds = internalPurposeRunIds(snapshot);
  return snapshot.sessions.filter(
    (session): session is LinkedJarvisWorkerSession =>
      isLinkedJarvisWorkerSession(session) &&
      session.archived_at == null &&
      !archivedRunIds.has(session.run_id) &&
      !internalRunIds.has(session.run_id) &&
      !hasInternalWorkPurpose(session.metadata),
  );
}

function archivedJarvisSessionsForSnapshot(
  snapshot: JarvisRunsSnapshot,
): ReadonlyArray<LinkedJarvisWorkerSession> {
  const archivedRunIds = new Set(
    snapshot.runs.filter((run) => run.archived_at != null).map((run) => run.run_id),
  );
  const internalRunIds = internalPurposeRunIds(snapshot);
  return snapshot.sessions.filter(
    (session): session is LinkedJarvisWorkerSession =>
      isLinkedJarvisWorkerSession(session) &&
      (session.archived_at != null || archivedRunIds.has(session.run_id)) &&
      !internalRunIds.has(session.run_id) &&
      !hasInternalWorkPurpose(session.metadata),
  );
}

function activeJarvisRuns(snapshot: JarvisRunsSnapshot): ReadonlyArray<JarvisRun> {
  const internalRunIds = internalPurposeRunIds(snapshot);
  return snapshot.runs.filter((run) => run.archived_at == null && !internalRunIds.has(run.run_id));
}

function archivedJarvisRuns(snapshot: JarvisRunsSnapshot): ReadonlyArray<JarvisRun> {
  const internalRunIds = internalPurposeRunIds(snapshot);
  return snapshot.runs.filter((run) => run.archived_at != null && !internalRunIds.has(run.run_id));
}

export function mapJarvisSessionToThreadDetail(input: {
  readonly session: JarvisWorkerSession;
  readonly run?: JarvisRun;
  readonly events: ReadonlyArray<JarvisSessionEvent>;
  readonly checkpoints?: ReadonlyArray<JarvisSessionCheckpoint>;
  readonly snapshotSequence?: number;
}): OrchestrationThread {
  if (input.session.run_id === null) {
    throw new Error("Cannot project a worker-local session without a Jarvis run");
  }
  const session: LinkedJarvisWorkerSession = {
    ...input.session,
    run_id: input.session.run_id,
  };
  const threadId = jarvisThreadIdForSession(session.session_ref);
  const projectId = jarvisProjectIdForRun(session.run_id);
  const cockpit = projectJarvisSessionForCockpit({
    session,
    events: input.events,
    checkpoints: input.checkpoints ?? [],
  });
  const messages = cockpit.messages.map(mapCockpitMessage);
  const activities = cockpit.activities.map(mapCockpitActivity);
  const latestTurn = cockpit.latestTurn ? mapCockpitLatestTurn(cockpit.latestTurn) : null;
  return {
    id: threadId,
    projectId,
    jarvisRegistryProjectId: jarvisRegistryProjectIdForSession(session, input.run),
    title: titleForSession(session, input.run),
    modelSelection: modelSelectionForSession(session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: branchForSession(session, input.run),
    worktreePath: null,
    latestTurn,
    createdAt: session.created_at,
    updatedAt: cockpit.latestEventTime ?? session.updated_at,
    archivedAt: session.archived_at ?? input.run?.archived_at ?? null,
    deletedAt: null,
    messages,
    proposedPlans: [],
    activities,
    checkpoints: cockpit.checkpoints.map(mapCockpitCheckpoint),
    session: sessionForWorkerSession(session, latestTurn),
  };
}

function mapRunToProjectShell(
  run: JarvisRun,
  _sessions: ReadonlyArray<LinkedJarvisWorkerSession>,
): OrchestrationProjectShell {
  return {
    id: jarvisProjectIdForRun(run.run_id),
    title: run.title,
    workspaceRoot: jarvisWorkspaceRootForRun(run.run_id),
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  };
}

function mapRunsAndSessionsToProjectShells(
  runs: ReadonlyArray<JarvisRun>,
  sessions: ReadonlyArray<LinkedJarvisWorkerSession>,
): ReadonlyArray<OrchestrationProjectShell> {
  const mappedRunIds = new Set(runs.map((run) => run.run_id));
  const projects = runs.map((run) => mapRunToProjectShell(run, sessions));
  const synthesizedRunIds = new Set<string>();
  for (const session of sessions) {
    if (mappedRunIds.has(session.run_id) || synthesizedRunIds.has(session.run_id)) {
      continue;
    }
    synthesizedRunIds.add(session.run_id);
    projects.push(mapSessionToProjectShell(session));
  }
  return projects;
}

function startWorkProjectShellsForSnapshot(
  snapshot: JarvisRunsSnapshot,
  projects: ReadonlyArray<OrchestrationProjectShell>,
  options: {
    readonly includeStartWorkProject: boolean;
  },
): ReadonlyArray<OrchestrationProjectShell> {
  if (!options.includeStartWorkProject || snapshot.workers.length === 0) {
    return projects;
  }
  if (projects.some((project) => project.id === JARVIS_START_PROJECT_ID)) {
    return projects;
  }
  return [startWorkProjectShell(snapshot.generated_at), ...projects];
}

function startWorkProjectShell(generatedAt: string): OrchestrationProjectShell {
  return {
    id: JARVIS_START_PROJECT_ID,
    title: "Start Jarvis work",
    workspaceRoot: "jarvis://start",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

function mapSessionToProjectShell(session: LinkedJarvisWorkerSession): OrchestrationProjectShell {
  return {
    id: jarvisProjectIdForRun(session.run_id),
    title: normalizeJarvisPublicLabel(session.repo) ?? session.title,
    workspaceRoot: jarvisWorkspaceRootForRun(session.run_id),
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

function jarvisWorkspaceRootForRun(runId: string): string {
  return `jarvis://runs/${encodeURIComponent(runId)}`;
}

function mapSessionToThreadShell(
  session: LinkedJarvisWorkerSession,
  run: JarvisRun | undefined,
): OrchestrationThreadShell {
  return {
    id: jarvisThreadIdForSession(session.session_ref),
    projectId: jarvisProjectIdForRun(session.run_id),
    jarvisRegistryProjectId: jarvisRegistryProjectIdForSession(session, run),
    title: titleForSession(session, run),
    modelSelection: modelSelectionForSession(session),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: branchForSession(session, run),
    worktreePath: null,
    latestTurn: null,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    archivedAt: session.archived_at ?? run?.archived_at ?? null,
    session: sessionForWorkerSession(session, null),
    latestUserMessageAt: null,
    hasPendingApprovals: session.pending_approval_count > 0 || session.status === "needs_approval",
    hasPendingUserInput: session.pending_input_count > 0 || session.status === "needs_input",
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
  return normalizeJarvisPublicLabel(session.title) ?? run?.title ?? session.session_ref;
}

// The registry project a run/session is linked to (e.g. "jarvis"), so the sidebar can nest
// dispatched work under its project instead of a synthetic per-run row. Null when unlinked.
function jarvisRegistryProjectIdForSession(
  session: JarvisWorkerSession,
  run: JarvisRun | undefined,
): string | null {
  return session.project_id?.trim() || run?.project_id?.trim() || null;
}

function branchForSession(session: JarvisWorkerSession, run: JarvisRun | undefined): string | null {
  return normalizeJarvisPublicLabel(session.branch) ?? normalizeJarvisPublicLabel(run?.branch);
}

function normalizeJarvisPublicLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function modelSelectionForSession(session: JarvisWorkerSession) {
  const model = normalizeJarvisPublicLabel(session.model) ?? session.engine;
  return {
    instanceId: ProviderInstanceId.make(jarvisProviderInstanceId(session.provider)),
    model,
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
