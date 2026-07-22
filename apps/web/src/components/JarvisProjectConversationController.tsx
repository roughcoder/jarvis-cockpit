/** Jarvis runtime controller for the shared provider-neutral conversation screen. */
import {
  ApprovalRequestId,
  JarvisRequestId,
  MessageId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import type {
  EnvironmentId,
  JarvisApprovalDecision,
  JarvisProjectThreadTurnInput,
  JarvisProjectThread,
  JarvisTurnAttachment,
  JarvisTurnWorkspaceInput,
  ProviderApprovalDecision,
  ServerProvider,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  adaptJarvisProjectThread,
  enrichAgentConversationWithJarvisContext,
} from "@t3tools/client-runtime/conversation";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  MessageSquareIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { isElectron } from "../env";
import {
  primaryServerKeybindingsAtom,
  primaryServerProvidersAtom,
  serverEnvironment,
} from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { cn, randomUUID } from "../lib/utils";
import { readFileAsDataUrl } from "../lib/fileAttachments";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useEnvironmentSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
import { useComposerHandleContext } from "../composerHandleContext";
import {
  type ComposerImageAttachment,
  type PersistedComposerImageAttachment,
  jarvisProjectThreadDraftId,
  useComposerDraftStore,
} from "../composerDraftStore";
import type { TerminalContextDraft } from "../lib/terminalContext";
import type { ElementContextDraft } from "../lib/elementContext";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  archivedProjectConversationSummary,
  extractProjectConversationReply,
  formatJarvisCommandFailure,
  formatProjectConversationFailure,
  isProjectConversationArchived,
  isProjectConversationDetailRouteGap,
  sortProjectConversations,
  buildProjectConversationRouteParams,
  visibleProjectFiles,
  type ProjectConversationLocalTurnView,
} from "../jarvisProjectConversations.logic";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  LEGACY_PROJECT_CONVERSATION_CONTEXT_PANEL_COLLAPSED_KEY,
  projectConversationContextContributions,
  projectConversationContextPanelInitialization,
} from "../projectConversationContext.logic";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import {
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "../rightPanelStore";
import {
  buildProjectConversationTurnAttachments,
  isProjectConversationComposerDraftEmpty,
  projectConversationComposerMatchesSubmission,
} from "./projectConversationComposer.logic";
import {
  buildTurnEffortInput,
  buildTurnModelInput,
  buildTurnSpeedInput,
  buildTurnWorkspaceInput,
  clearProjectConversationWorkspaceRepos,
  createProjectConversationWorkspaceStaging,
  projectConversationModelMatchesSubmission,
  projectConversationPreferenceMatchesSubmission,
  projectConversationWorkspaceMatchesSubmission,
  syncProjectConversationWorkspaceSelection,
  workspaceEngineOptionsFromWorkers,
  type ProjectConversationWorkspaceStaging,
} from "./projectConversationWorkspace.logic";
import { projectConversationCapabilities } from "./composer/composerCapabilities";
import {
  buildProjectConversationRenameInput,
  buildProjectConversationTitleGenerationContext,
  resolveProjectConversationHeaderStatus,
  resolveProjectConversationTitle,
} from "./projectConversationHeader.logic";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Spinner } from "./ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { toastManager } from "./ui/toast";
import { ChatComposer, type ChatComposerHandle } from "./chat/ChatComposer";
import { mergeJarvisThreadToolEventsWithReply } from "../jarvisThreadToolEvents.logic";
import {
  mergeAgentConversationTimelineOverlay,
  type AgentConversationTimelineOverlayResult,
} from "../agentConversationTimelineOverlay.logic";
import { projectConversationTimelineOverlayTurns } from "../projectConversationTimelineOverlay.logic";
import { ChatHeaderTitle } from "./chat/ChatHeaderTitle";
import { AgentConversationTimeline } from "./chat/AgentConversationTimeline";
import { ConversationComposer } from "./chat/ConversationComposer";
import { ConversationScreen } from "./chat/ConversationScreen";
import {
  resolveProjectConversationNavigationTarget,
  type ProjectConversationNavigationTarget,
} from "./projectConversationTree.logic";
import { useConversationTimelineController } from "./chat/useConversationTimelineController";
import { cloneComposerImageForRetry } from "./ChatView.logic";
import { ConversationContextPanel } from "./ConversationContextPanel";
import { RightPanelTabs } from "./RightPanelTabs";
import { RightPanelSheet } from "./RightPanelSheet";
import { buildConversationRoutineContext, RoutineLauncherControl } from "./routines";
import {
  cachedProjectConversationControlKey,
  projectConversationComposerRuntime,
  projectConversationRouteIdentity,
  releaseProjectConversationSend,
  tryClaimProjectConversationSend,
} from "../projectConversationRuntime.logic";
import {
  buildPendingUserInputAnswers,
  derivePendingUserInputProgress,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../pendingUserInput";

interface JarvisProjectConversationControllerProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly threadId: ThreadId;
}

type LocalTurn = ProjectConversationLocalTurnView;

interface ProjectConversationSubmissionSnapshot {
  readonly prompt: string;
  readonly attachments: ReadonlyArray<JarvisTurnAttachment>;
  readonly composerImages: ReadonlyArray<ComposerImageAttachment>;
  readonly workspace: JarvisTurnWorkspaceInput | null;
  readonly model: string | null;
  readonly effort: string | null;
  readonly speed: string | null;
}

interface ActiveProjectConversationTurn {
  readonly routeIdentity: string;
  readonly turnId: string;
  readonly submission: ProjectConversationSubmissionSnapshot;
  readonly input: JarvisProjectThreadTurnInput;
  readonly restoreDraftOnFailure: boolean;
  readonly clearWorkspaceOnSuccess: boolean;
}

const PROJECT_CONVERSATION_FILE_DATA_URL_READ_MESSAGES = {
  nonStringResult: "File reader returned a non-string data URL.",
  readFailure: "File read failed.",
};

const EMPTY_RIGHT_PANEL_PENDING_IDS = new Set<string>();
const EMPTY_RIGHT_PANEL_PREVIEW_SESSIONS = {};
const EMPTY_RIGHT_PANEL_TERMINAL_LABELS = new Map<string, string>();
const EMPTY_AGENT_CONVERSATION_TIMELINE: AgentConversationTimelineOverlayResult = {
  timelineEntries: [],
  isWorking: false,
};

const PROJECT_APPROVAL_DECISIONS: Record<ProviderApprovalDecision, JarvisApprovalDecision> = {
  accept: "approved",
  acceptForSession: "approved_for_session",
  decline: "declined",
  cancel: "cancelled",
};

function showControlFailure(title: string, fallback: string, error: unknown): void {
  const description =
    error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
  toastManager.add({ type: "error", title, description });
}

function absoluteWorkspacePathLabel(pathLabel: string | null | undefined): string | null {
  const value = pathLabel?.trim();
  if (!value) {
    return null;
  }
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value) ? value : null;
}

function projectConversationWorkspaceCwd(
  workspace: JarvisProjectThread["workspace"] | null | undefined,
): string | null {
  for (const worktree of workspace?.worktrees ?? []) {
    const cwd = absoluteWorkspacePathLabel(worktree.path_label);
    if (cwd) {
      return cwd;
    }
  }
  return null;
}

export function JarvisProjectConversationController({
  environmentId,
  projectId,
  threadId,
}: JarvisProjectConversationControllerProps) {
  const navigate = useNavigate();
  const projectsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjects({
      environmentId,
      input: { includeArchived: false },
    }),
  );
  const threadsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectThreads({
      environmentId,
      input: { projectId, includeArchived: true },
    }),
  );
  const threadDetailStream = useEnvironmentQuery(
    serverEnvironment.jarvisProjectThreadStream({
      environmentId,
      input: { projectId, threadId: String(threadId) },
    }),
  );
  const memoryQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectMemory({
      environmentId,
      input: { projectId },
    }),
  );
  const [memoryMentionQuery, setMemoryMentionQuery] = useState("");
  const memoryMentionRequestQuery = memoryMentionQuery.trim();
  const filesQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectFiles({
      environmentId,
      input: {
        projectId,
        includeRetracted: false,
        ...(memoryMentionRequestQuery.length > 0 ? { query: memoryMentionRequestQuery } : {}),
      },
    }),
  );
  const respondToApproval = useAtomCommand(serverEnvironment.respondJarvisProjectThreadApproval, {
    reportFailure: false,
  });
  const respondToUserInput = useAtomCommand(serverEnvironment.respondJarvisProjectThreadInput, {
    reportFailure: false,
  });
  const interruptTurn = useAtomCommand(serverEnvironment.interruptJarvisProjectThread, {
    reportFailure: false,
  });
  const archiveThread = useAtomCommand(serverEnvironment.archiveJarvisProjectThread, {
    reportFailure: false,
  });
  const unarchiveThread = useAtomCommand(serverEnvironment.unarchiveJarvisProjectThread, {
    reportFailure: false,
  });
  const renameThread = useAtomCommand(serverEnvironment.renameJarvisProjectThread, {
    reportFailure: false,
  });
  const generateThreadTitle = useAtomCommand(serverEnvironment.generateThreadTitle, {
    reportFailure: false,
  });
  const project =
    projectsQuery.data?.ok === true
      ? ((projectsQuery.data.projects ?? []).find((candidate) => candidate.id === projectId) ??
        null)
      : null;
  const conversations = useMemo(
    () =>
      sortProjectConversations(
        threadsQuery.data?.ok === true ? (threadsQuery.data.threads ?? []) : [],
      ),
    [threadsQuery.data],
  );
  const conversation =
    threadDetailStream.data !== null && threadDetailStream.data !== undefined
      ? threadDetailStream.data
      : (conversations.find((candidate) => candidate.thread_id === String(threadId)) ?? null);
  const routineContext = useMemo(
    () =>
      buildConversationRoutineContext({
        conversationTitle: conversation?.title ?? "Project conversation",
        projectName: project?.name ?? projectId,
      }),
    [conversation?.title, project?.name, projectId],
  );
  const files = useMemo(
    () => visibleProjectFiles(filesQuery.data?.ok === true ? (filesQuery.data.files ?? []) : []),
    [filesQuery.data],
  );
  const providerStatuses = useAtomValue(primaryServerProvidersAtom);
  const jarvisSnapshotQuery = useEnvironmentQuery(
    serverEnvironment.jarvisSnapshot({ environmentId, input: {} }),
  );
  const workspaceEngineOptions = useMemo(
    () => workspaceEngineOptionsFromWorkers(jarvisSnapshotQuery.data?.snapshot?.workers ?? []),
    [jarvisSnapshotQuery.data?.snapshot?.workers],
  );
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const settings = useEnvironmentSettings(environmentId);
  const { resolvedTheme } = useTheme();
  const composerDraftTarget = useMemo(
    () => jarvisProjectThreadDraftId(environmentId, ProjectId.make(projectId), threadId),
    [environmentId, projectId, threadId],
  );
  const routeThreadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const routeThreadKey = useMemo(() => scopedThreadKey(routeThreadRef), [routeThreadRef]);
  const routeIdentity = projectConversationRouteIdentity({
    environmentId,
    projectId,
    threadId: String(threadId),
  });
  const routeIdentityRef = useRef(routeIdentity);
  routeIdentityRef.current = routeIdentity;
  const rightPanelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, routeThreadRef),
  );
  const activeRightPanelSurface = rightPanelState.isOpen
    ? (rightPanelState.surfaces.find((surface) => surface.id === rightPanelState.activeSurfaceId) ??
      null)
    : null;
  const shouldUseRightPanelSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const initializedRightPanelThreadKeyRef = useRef<string | null>(null);
  const promptRef = useRef("");
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>([]);
  const composerElementContextsRef = useRef<ElementContextDraft[]>([]);
  const localComposerRef = useRef<ChatComposerHandle | null>(null);
  const controlIdempotencyKeysRef = useRef(new Map<string, string>());
  const sendInFlightRef = useRef(false);
  const composerRef = useComposerHandleContext() ?? localComposerRef;
  const clearComposerContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const [activeProjectTurn, setActiveProjectTurn] = useState<ActiveProjectConversationTurn | null>(
    null,
  );
  const projectTurnStreamAtom = useMemo(
    () =>
      activeProjectTurn === null || activeProjectTurn.routeIdentity !== routeIdentity
        ? null
        : serverEnvironment.jarvisProjectThreadTurnStream({
            environmentId,
            input: {
              projectId,
              threadId: String(threadId),
              input: activeProjectTurn.input,
            },
          }),
    [activeProjectTurn, environmentId, projectId, routeIdentity, threadId],
  );
  const projectTurnStream = useEnvironmentQuery(projectTurnStreamAtom);
  const [respondingRequestIds, setRespondingRequestIds] = useState<ApprovalRequestId[]>([]);
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Record<string, Record<string, PendingUserInputDraftAnswer>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Record<string, number>>({});
  const projectedConversationDetail = useMemo(
    () =>
      threadDetailStream.data ?? (conversation === null ? null : { ...conversation, messages: [] }),
    [conversation, threadDetailStream.data],
  );
  const agentConversation = useMemo(
    () =>
      projectedConversationDetail === null
        ? null
        : enrichAgentConversationWithJarvisContext(
            adaptJarvisProjectThread(projectedConversationDetail),
            {
              project,
              memory: memoryQuery.data?.ok === true ? (memoryQuery.data.memory ?? null) : null,
              files,
            },
          ),
    [files, memoryQuery.data, project, projectedConversationDetail],
  );
  const composerRuntime = useMemo(
    () => projectConversationComposerRuntime(agentConversation),
    [agentConversation],
  );
  const activePendingApproval = composerRuntime.pendingApprovals[0] ?? null;
  const activePendingUserInput = composerRuntime.pendingUserInputs[0] ?? null;
  const activePendingDraftAnswers = useMemo(
    () =>
      activePendingUserInput
        ? (pendingUserInputAnswersByRequestId[activePendingUserInput.requestId] ?? {})
        : {},
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = useMemo(
    () =>
      activePendingUserInput
        ? derivePendingUserInputProgress(
            activePendingUserInput.questions,
            activePendingDraftAnswers,
            activePendingQuestionIndex,
          )
        : null,
    [activePendingDraftAnswers, activePendingQuestionIndex, activePendingUserInput],
  );
  const activePendingResolvedAnswers = useMemo(
    () =>
      activePendingUserInput
        ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingDraftAnswers)
        : null,
    [activePendingDraftAnswers, activePendingUserInput],
  );
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;
  const timelineOverlayTurns = useMemo(
    () => projectConversationTimelineOverlayTurns(turns),
    [turns],
  );
  const conversationTimeline = useMemo(
    () =>
      agentConversation === null
        ? null
        : mergeAgentConversationTimelineOverlay(agentConversation, timelineOverlayTurns),
    [agentConversation, timelineOverlayTurns],
  );
  const conversationTargetById = useMemo(() => {
    const targets = new Map<string, ProjectConversationNavigationTarget>();
    const targetIds = new Set(
      agentConversation?.activities.flatMap((activity) => activity.relatedConversationIds) ?? [],
    );
    const workerSessions = jarvisSnapshotQuery.data?.snapshot?.sessions ?? [];
    for (const targetId of targetIds) {
      targets.set(
        targetId,
        resolveProjectConversationNavigationTarget({
          targetId,
          projectThreads: conversations,
          workerSessions,
        }),
      );
    }
    return targets;
  }, [agentConversation?.activities, conversations, jarvisSnapshotQuery.data?.snapshot?.sessions]);
  const resolvedConversationTimeline = useMemo(() => {
    const base = conversationTimeline ?? EMPTY_AGENT_CONVERSATION_TIMELINE;
    return {
      ...base,
      timelineEntries: base.timelineEntries.map((entry) => {
        if (entry.kind !== "work" || !entry.entry.conversationTargets) return entry;
        return {
          ...entry,
          entry: {
            ...entry.entry,
            conversationTargets: entry.entry.conversationTargets.map((target) => {
              const resolved = conversationTargetById.get(target.id);
              return resolved?.availability === "resolvable"
                ? { ...target, availability: "resolvable" as const, unavailableReason: null }
                : {
                    ...target,
                    availability: "unavailable" as const,
                    unavailableReason:
                      resolved?.reason ??
                      "This child has not published a navigable conversation yet.",
                  };
            }),
          },
        };
      }),
    };
  }, [conversationTargetById, conversationTimeline]);
  const timelineController = useConversationTimelineController({
    conversationKey: routeThreadKey,
    timelineEntries: resolvedConversationTimeline.timelineEntries,
  });
  const openConversationTarget = useCallback(
    (targetId: string) => {
      const target = conversationTargetById.get(targetId);
      if (!target || target.availability === "unavailable") {
        toastManager.add({
          type: "warning",
          title: "Child conversation unavailable",
          description:
            target?.reason ?? "This child has not published a navigable conversation yet.",
        });
        return;
      }
      if (target.kind === "project-thread") {
        void navigate({
          to: "/jarvis-project/$environmentId/$projectId/$threadId",
          params: buildProjectConversationRouteParams({
            environmentId,
            projectId,
            threadId: target.threadId,
          }),
        });
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(
          scopeThreadRef(environmentId, ThreadId.make(target.threadId)),
        ),
      });
    },
    [conversationTargetById, environmentId, navigate, projectId],
  );
  const titleContextMessages = useMemo(
    () => [
      ...(agentConversation?.messages.flatMap((message) =>
        message.role === "user" || message.role === "assistant"
          ? [{ role: message.role, content: message.content }]
          : [],
      ) ?? []),
      ...turns.flatMap((turn) => [
        { role: "user" as const, content: turn.prompt },
        ...(turn.response.trim() ? [{ role: "assistant" as const, content: turn.response }] : []),
      ]),
    ],
    [agentConversation?.messages, turns],
  );
  const [pendingArchiveConfirmation, setPendingArchiveConfirmation] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameGenerating, setRenameGenerating] = useState(false);
  const workspaceStagingKey = `${environmentId}:${projectId}:${String(threadId)}`;
  const [workspaceStagingByThread, setWorkspaceStagingByThread] = useState<
    Record<string, ProjectConversationWorkspaceStaging>
  >({});
  const workspaceStaging =
    workspaceStagingByThread[workspaceStagingKey] ?? createProjectConversationWorkspaceStaging();
  const turnCounter = useRef(0);
  const sendBusy = turns.some((turn) => turn.status === "pending" || turn.status === "streaming");
  const projectName = project?.name ?? projectId;
  const archived = isProjectConversationArchived(conversation);
  const conversationWorkspace = conversation?.workspace ?? null;
  const conversationWorkspaceCwd = projectConversationWorkspaceCwd(conversationWorkspace);
  const conversationWorkspaceEngine = conversationWorkspace?.engine ?? conversation?.engine;
  const archiveSummary = archivedProjectConversationSummary(conversation);
  const conversationTitle = resolveProjectConversationTitle({
    serverTitle: conversation?.title ?? "Project conversation",
  });
  const conversationStatus = resolveProjectConversationHeaderStatus({
    status: conversation?.operational_state ?? conversation?.status,
    endedReason: conversation?.ended_reason,
  });
  const contextContributions = useMemo(
    () =>
      projectConversationContextContributions({
        conversation: agentConversation,
        memoryLoading: memoryQuery.isPending,
      }),
    [agentConversation, memoryQuery.isPending],
  );
  // Project-thread conversations run on the brain (engine "jarvis"), which the gating treats
  // as attachment-capable without a catalog lookup — so we intentionally do NOT fetch the
  // (expensive, route-probing) capabilities here on every conversation mount. A worker-linked
  // thread with a non-brain engine would need a lightweight catalog read wired at that point.
  const composerCapabilities = useMemo(
    () =>
      projectConversationCapabilities({
        catalog: null,
        engine: conversation?.engine,
        hasWorkspace: conversationWorkspace !== null,
        hasProjectFiles: files.length > 0,
      }),
    [conversation?.engine, conversationWorkspace, files.length],
  );
  const composerDisabledReason =
    conversation === null
      ? "Project conversation unavailable"
      : archived
        ? "Unarchive this conversation to send a turn"
        : null;
  const detailFallback =
    threadDetailStream.error !== null &&
    isProjectConversationDetailRouteGap(threadDetailStream.error)
      ? formatProjectConversationFailure("detail", threadDetailStream.error)
      : null;

  const setWorkspaceStaging = (staging: ProjectConversationWorkspaceStaging) => {
    setWorkspaceStagingByThread((existing) => ({
      ...existing,
      [workspaceStagingKey]: staging,
    }));
  };

  const clearWorkspaceRepoStaging = () => {
    setWorkspaceStagingByThread((existing) => ({
      ...existing,
      [workspaceStagingKey]: clearProjectConversationWorkspaceRepos(
        existing[workspaceStagingKey] ?? workspaceStaging,
      ),
    }));
  };

  useEffect(() => {
    // Param-only navigation between conversations reuses this component, so reset all
    // per-thread local state — otherwise the previous conversation's optimistic turns
    // and rename state leak into the next one. Composer content is keyed by thread.
    setRenamingConversation(false);
    setRenameDraft("");
    setTurns([]);
    setActiveProjectTurn(null);
    setRespondingRequestIds([]);
    setRespondingUserInputRequestIds([]);
    setPendingUserInputAnswersByRequestId({});
    setPendingUserInputQuestionIndexByRequestId({});
    controlIdempotencyKeysRef.current.clear();
    turnCounter.current = 0;
  }, [environmentId, projectId, threadId]);

  useEffect(() => {
    if (initializedRightPanelThreadKeyRef.current === routeThreadKey) return;
    initializedRightPanelThreadKeyRef.current = routeThreadKey;
    const store = useRightPanelStore.getState();
    const initialization = projectConversationContextPanelInitialization({
      hasPersistedState: routeThreadKey in store.byThreadKey,
      legacyCollapsedRaw: window.localStorage.getItem(
        LEGACY_PROJECT_CONVERSATION_CONTEXT_PANEL_COLLAPSED_KEY,
      ),
    });
    if (initialization === "preserve") return;
    store.open(routeThreadRef, "context");
    if (initialization === "closed") store.close(routeThreadRef);
  }, [routeThreadKey, routeThreadRef]);

  useEffect(() => {
    setWorkspaceStagingByThread((existing) => ({
      ...existing,
      [workspaceStagingKey]: syncProjectConversationWorkspaceSelection(
        existing[workspaceStagingKey] ?? createProjectConversationWorkspaceStaging(),
        {
          engine: conversationWorkspaceEngine,
          model: conversation?.model,
          effort: conversation?.effort,
          speed: conversation?.speed,
        },
      ),
    }));
  }, [
    conversation?.effort,
    conversation?.model,
    conversation?.speed,
    conversationWorkspaceEngine,
    workspaceStagingKey,
  ]);

  const threadsRefreshRef = useRef(threadsQuery.refresh);
  useEffect(() => {
    threadsRefreshRef.current = threadsQuery.refresh;
  }, [threadsQuery.refresh]);

  useEffect(() => {
    // The durable thread subscription is the live path. The list only needs a
    // slow, visible-tab reconciliation so archive/rename state remains correct.
    const id = window.setInterval(() => {
      if (!document.hidden) threadsRefreshRef.current();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [workspaceStagingKey]);

  const refreshConversationData = () => {
    threadsQuery.refresh();
    memoryQuery.refresh();
    filesQuery.refresh();
  };

  const toggleContextPanel = () => {
    const store = useRightPanelStore.getState();
    if (rightPanelState.isOpen) {
      store.close(routeThreadRef);
      return;
    }
    if (rightPanelState.surfaces.some((surface) => surface.kind === "context")) {
      store.show(routeThreadRef);
      store.activateSurface(routeThreadRef, "context");
      return;
    }
    store.open(routeThreadRef, "context");
  };

  const activateRightPanelSurface = (surface: RightPanelSurface) =>
    useRightPanelStore.getState().activateSurface(routeThreadRef, surface.id);
  const closeRightPanelSurface = (surface: RightPanelSurface) => {
    const store = useRightPanelStore.getState();
    if (surface.kind === "context") {
      store.close(routeThreadRef);
      return;
    }
    store.closeSurface(routeThreadRef, surface.id);
  };
  const closeOtherRightPanelSurfaces = (surface: RightPanelSurface) =>
    useRightPanelStore.getState().closeOtherSurfaces(routeThreadRef, surface.id);
  const closeRightPanelSurfacesToRight = (surface: RightPanelSurface) =>
    useRightPanelStore.getState().closeSurfacesToRight(routeThreadRef, surface.id);
  const closeAllRightPanelSurfaces = () => useRightPanelStore.getState().close(routeThreadRef);
  const openContextRightPanel = () => useRightPanelStore.getState().open(routeThreadRef, "context");

  const contextRightPanel = (mode: "inline" | "sheet") => (
    <RightPanelTabs
      mode={mode}
      surfaces={rightPanelState.surfaces}
      activeSurfaceId={activeRightPanelSurface?.id ?? null}
      pendingSurfaceIds={EMPTY_RIGHT_PANEL_PENDING_IDS}
      previewSessions={EMPTY_RIGHT_PANEL_PREVIEW_SESSIONS}
      terminalLabelsById={EMPTY_RIGHT_PANEL_TERMINAL_LABELS}
      onActivate={activateRightPanelSurface}
      onCloseSurface={closeRightPanelSurface}
      onCloseOtherSurfaces={closeOtherRightPanelSurfaces}
      onCloseSurfacesToRight={closeRightPanelSurfacesToRight}
      onCloseAllSurfaces={closeAllRightPanelSurfaces}
      onAddContext={openContextRightPanel}
      contextAvailable
    >
      {activeRightPanelSurface?.kind === "context" ? (
        <ConversationContextPanel contributions={contextContributions} />
      ) : null}
    </RightPanelTabs>
  );

  const startConversationRename = () => {
    if (conversation === null) return;
    setRenameDraft(conversationTitle.title);
    setRenamingConversation(true);
  };

  const cancelConversationRename = () => {
    setRenamingConversation(false);
    setRenameDraft("");
  };

  const commitConversationRename = async () => {
    if (conversation === null) return;
    const renameInput = buildProjectConversationRenameInput({
      currentTitle: conversation.title,
      draftTitle: renameDraft,
      idempotencyKey: `project-thread-rename-${String(threadId)}-${randomUUID()}`,
    });
    if (renameInput.status === "empty") {
      toastManager.add({
        type: "error",
        title: "Conversation title not changed",
        description: "Enter a title before saving.",
      });
      return;
    }
    if (renameInput.status === "unchanged") {
      setRenameDraft("");
      setRenamingConversation(false);
      return;
    }

    setRenameBusy(true);
    const result = await renameThread({
      environmentId,
      input: {
        projectId,
        threadId: String(threadId),
        input: renameInput.input,
      },
    });
    setRenameBusy(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const message = formatProjectConversationRenameFailure(squashAtomCommandFailure(result));
        toastManager.add({
          type: "error",
          title: "Could not rename conversation",
          description: message,
        });
      }
      return;
    }
    if (!result.value.ok || !result.value.thread) {
      const message = formatProjectConversationRenameFailure(
        result.value.error?.message ?? "Jarvis did not return a renamed project conversation.",
      );
      toastManager.add({
        type: "error",
        title: "Could not rename conversation",
        description: message,
      });
      return;
    }
    setRenameDraft("");
    setRenamingConversation(false);
    threadsQuery.refresh();
  };

  const generateConversationTitle = async () => {
    if (conversation === null) return;
    setRenameGenerating(true);
    const result = await generateThreadTitle({
      environmentId,
      input: {
        message: buildProjectConversationTitleGenerationContext({
          currentTitle: conversation.title,
          messages: titleContextMessages,
        }),
      },
    });
    setRenameGenerating(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not generate a title",
          description: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    setRenameDraft(result.value.title);
  };

  const markTurn = (
    turnId: string,
    patch: Pick<LocalTurn, "status"> & Partial<Pick<LocalTurn, "response" | "error" | "toolItems">>,
  ) => {
    setTurns((existing) =>
      existing.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              ...patch,
              response: patch.response ?? turn.response,
              toolItems: patch.toolItems ?? turn.toolItems ?? [],
              error: patch.error === undefined ? turn.error : patch.error,
            }
          : turn,
      ),
    );
  };

  const showAttachmentError = (description: string) => {
    toastManager.add({
      type: "error",
      title: "Could not attach image",
      description,
    });
  };

  const prepareProjectTurnAttachments = async (input: {
    images: ReadonlyArray<ComposerImageAttachment>;
    persistedImages: ReadonlyArray<PersistedComposerImageAttachment>;
  }): Promise<JarvisTurnAttachment[] | null> => {
    if (input.images.length === 0) {
      return [];
    }
    const persistedById = new Map(input.persistedImages.map((image) => [image.id, image]));
    const preparedPersistedImages: PersistedComposerImageAttachment[] = [];
    for (const image of input.images) {
      const persisted = persistedById.get(image.id);
      if (persisted) {
        preparedPersistedImages.push(persisted);
        continue;
      }
      try {
        preparedPersistedImages.push({
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          dataUrl: await readFileAsDataUrl(
            image.file,
            PROJECT_CONVERSATION_FILE_DATA_URL_READ_MESSAGES,
          ),
        });
      } catch (error) {
        showAttachmentError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : `${image.name || "Image"} could not be read.`,
        );
        return null;
      }
    }

    const result = buildProjectConversationTurnAttachments({
      images: input.images,
      persistedImages: preparedPersistedImages,
    });
    if (!result.ok) {
      showAttachmentError(result.message);
      return null;
    }
    return result.attachments;
  };

  const restoreFailedSubmission = (submission: ProjectConversationSubmissionSnapshot) => {
    if (
      !isProjectConversationComposerDraftEmpty({
        prompt: promptRef.current,
        imageCount: composerImagesRef.current.length,
        terminalContextCount: composerTerminalContextsRef.current.length,
        elementContextCount: composerElementContextsRef.current.length,
      })
    ) {
      return;
    }
    const retryImages = submission.composerImages.map(cloneComposerImageForRetry);
    promptRef.current = submission.prompt;
    composerImagesRef.current = retryImages;
    setComposerDraftPrompt(composerDraftTarget, submission.prompt);
    addComposerDraftImages(composerDraftTarget, retryImages);
    composerRef.current?.resetCursorState({
      cursor: submission.prompt.length,
      prompt: submission.prompt,
      detectTrigger: true,
    });
  };

  const sendPrompt = async (
    submission: ProjectConversationSubmissionSnapshot,
    options: {
      readonly existingTurnId?: string;
      readonly restoreDraftOnFailure?: boolean;
      readonly reserved?: boolean;
    } = {},
  ) => {
    if (routeIdentityRef.current !== routeIdentity) return;
    const text = submission.prompt.trim();
    if (text.length === 0 || (sendBusy && !options.reserved) || archived) return;
    const existingTurnId = options.existingTurnId;
    const turnAttachments = submission.attachments;
    const turnWorkspace = submission.workspace;
    const turnModel = submission.model;
    const turnEffort = submission.effort;
    const turnSpeed = submission.speed;
    const workspaceMatchesSubmission = projectConversationWorkspaceMatchesSubmission(
      buildTurnWorkspaceInput(workspaceStaging, conversationWorkspaceEngine),
      turnWorkspace,
    );
    const modelMatchesSubmission = projectConversationModelMatchesSubmission(
      buildTurnModelInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation?.model,
        workspaceEngineOptions,
      ) ?? null,
      turnModel,
    );
    const effortMatchesSubmission = projectConversationPreferenceMatchesSubmission(
      buildTurnEffortInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation?.effort,
        workspaceEngineOptions,
      ) ?? null,
      turnEffort,
    );
    const speedMatchesSubmission = projectConversationPreferenceMatchesSubmission(
      buildTurnSpeedInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation?.speed,
        workspaceEngineOptions,
      ) ?? null,
      turnSpeed,
    );
    const clearMatchingRetryDraft =
      existingTurnId !== undefined &&
      workspaceMatchesSubmission &&
      modelMatchesSubmission &&
      effortMatchesSubmission &&
      speedMatchesSubmission &&
      projectConversationComposerMatchesSubmission({
        draftPrompt: promptRef.current,
        draftImageIds: composerImagesRef.current.map((image) => image.id),
        terminalContextCount: composerTerminalContextsRef.current.length,
        elementContextCount: composerElementContextsRef.current.length,
        submissionPrompt: submission.prompt,
        submissionImageIds: submission.composerImages.map((image) => image.id),
      });

    const turnId = existingTurnId ?? `project-turn-${Date.now()}-${turnCounter.current++}`;
    timelineController.beginAnchoredTurn(MessageId.make(`overlay:${turnId}:user`));
    if (existingTurnId) {
      markTurn(turnId, { status: "pending", response: "", toolItems: [], error: null });
    } else {
      setTurns((existing) => [
        ...existing,
        {
          id: turnId,
          prompt: text,
          response: "",
          toolItems: [],
          workspaceInput: turnWorkspace,
          modelInput: turnModel,
          effortInput: turnEffort,
          speedInput: turnSpeed,
          attachments: turnAttachments,
          composerImages: submission.composerImages,
          status: "pending",
          error: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    if (!existingTurnId || clearMatchingRetryDraft) {
      promptRef.current = "";
      composerImagesRef.current = [];
      clearComposerContent(composerDraftTarget);
      composerRef.current?.resetCursorState({ cursor: 0, prompt: "" });
    }

    setActiveProjectTurn({
      routeIdentity,
      turnId,
      submission,
      restoreDraftOnFailure:
        options.restoreDraftOnFailure ?? (!existingTurnId || clearMatchingRetryDraft),
      clearWorkspaceOnSuccess: turnWorkspace !== null && workspaceMatchesSubmission,
      input: {
        text,
        idempotency_key: `project-thread-turn-${turnId}`,
        ...(turnModel !== null ? { model: turnModel } : {}),
        ...(turnEffort !== null ? { effort: turnEffort } : {}),
        ...(turnSpeed !== null ? { speed: turnSpeed } : {}),
        ...(turnAttachments.length > 0 ? { attachments: [...turnAttachments] } : {}),
        ...(turnWorkspace !== null ? { workspace: turnWorkspace } : {}),
      },
    });
  };

  useEffect(() => {
    if (activeProjectTurn === null || activeProjectTurn.routeIdentity !== routeIdentity) return;
    const stream = projectTurnStream.data;
    const streamError = projectTurnStream.error;
    if (streamError !== null || stream?.phase === "failed") {
      const message = formatProjectConversationSendFailure(
        streamError ?? stream?.error ?? "Jarvis did not complete the project conversation turn.",
      );
      markTurn(activeProjectTurn.turnId, { status: "failed", error: message });
      if (activeProjectTurn.restoreDraftOnFailure) {
        restoreFailedSubmission(activeProjectTurn.submission);
      }
      toastManager.add({
        type: "error",
        title: "Could not send project turn",
        description: message,
      });
      setActiveProjectTurn(null);
      return;
    }
    if (stream === null) return;

    const streamedResult = {
      ok: stream.result?.ok ?? true,
      text: stream.text,
      events: stream.events,
    };
    const toolItems = mergeJarvisThreadToolEventsWithReply(streamedResult);
    const mergedReply = toolItems
      .filter((item) => item.kind === "reply")
      .map((item) => item.text)
      .join("")
      .trim();
    const durableReply = extractProjectConversationReply(streamedResult);
    const reply =
      stream.phase === "completed" ? durableReply || mergedReply : mergedReply || durableReply;

    if (stream.phase === "streaming") {
      markTurn(activeProjectTurn.turnId, {
        status: "streaming",
        response: reply,
        toolItems,
        error: null,
      });
      return;
    }

    if (!streamedResult.ok) {
      const message = formatProjectConversationSendFailure(
        "Jarvis did not complete the project conversation turn.",
      );
      markTurn(activeProjectTurn.turnId, { status: "failed", error: message });
      if (activeProjectTurn.restoreDraftOnFailure) {
        restoreFailedSubmission(activeProjectTurn.submission);
      }
      toastManager.add({
        type: "error",
        title: "Could not send project turn",
        description: message,
      });
      setActiveProjectTurn(null);
      return;
    }

    markTurn(activeProjectTurn.turnId, {
      status: "completed",
      response: reply,
      toolItems,
      error: null,
    });
    // Clear only the workspace snapshot that actually succeeded. A replacement
    // staged while this request was in flight remains available for the next turn.
    if (activeProjectTurn.clearWorkspaceOnSuccess) {
      clearWorkspaceRepoStaging();
    }
    refreshConversationData();
    setActiveProjectTurn(null);
  }, [activeProjectTurn, projectTurnStream.data, projectTurnStream.error, routeIdentity]);

  const handleComposerSend = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    if (sendBusy || archived || conversation === null) return;
    const sendContext = composerRef.current?.getSendContext();
    if (!sendContext) return;
    const prompt = sendContext.prompt.trim();
    if (prompt.length === 0 || !tryClaimProjectConversationSend(sendInFlightRef)) return;
    const workspace = buildTurnWorkspaceInput(workspaceStaging, conversationWorkspaceEngine);
    const model =
      buildTurnModelInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation.model,
        workspaceEngineOptions,
      ) ?? null;
    const effort =
      buildTurnEffortInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation.effort,
        workspaceEngineOptions,
      ) ?? null;
    const speed =
      buildTurnSpeedInput(
        workspaceStaging,
        conversationWorkspaceEngine,
        conversation.speed,
        workspaceEngineOptions,
      ) ?? null;
    const turnId = `project-turn-${Date.now()}-${turnCounter.current++}`;
    const pendingSubmission: ProjectConversationSubmissionSnapshot = {
      prompt,
      attachments: [],
      composerImages: [...sendContext.images],
      workspace: workspace ?? null,
      model,
      effort,
      speed,
    };
    timelineController.beginAnchoredTurn(MessageId.make(`overlay:${turnId}:user`));
    setTurns((existing) => [
      ...existing,
      {
        id: turnId,
        prompt,
        response: "",
        toolItems: [],
        workspaceInput: pendingSubmission.workspace,
        modelInput: model,
        effortInput: effort,
        speedInput: speed,
        attachments: [],
        composerImages: pendingSubmission.composerImages,
        status: "pending",
        error: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    promptRef.current = "";
    composerImagesRef.current = [];
    clearComposerContent(composerDraftTarget);
    composerRef.current?.resetCursorState({ cursor: 0, prompt: "" });

    try {
      const attachments = await prepareProjectTurnAttachments({
        images: sendContext.images,
        persistedImages: sendContext.persistedImages,
      });
      if (attachments === null || routeIdentityRef.current !== routeIdentity) {
        setTurns((existing) => existing.filter((turn) => turn.id !== turnId));
        if (routeIdentityRef.current === routeIdentity) {
          restoreFailedSubmission(pendingSubmission);
        }
        return;
      }
      const submission = { ...pendingSubmission, attachments };
      setTurns((existing) =>
        existing.map((turn) => (turn.id === turnId ? { ...turn, attachments } : turn)),
      );
      await sendPrompt(submission, {
        existingTurnId: turnId,
        restoreDraftOnFailure: true,
        reserved: true,
      });
    } finally {
      releaseProjectConversationSend(sendInFlightRef);
    }
  };

  const retryTurn = (localTurnId: string) => {
    const turn = turns.find((candidate) => candidate.id === localTurnId);
    if (!turn) return;
    void sendPrompt(
      {
        prompt: turn.prompt,
        attachments: turn.attachments ?? [],
        composerImages: turn.composerImages ?? [],
        workspace: turn.workspaceInput ?? null,
        model: turn.modelInput ?? null,
        effort: turn.effortInput ?? null,
        speed: turn.speedInput ?? null,
      },
      { existingTurnId: localTurnId },
    );
  };

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      setRespondingRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      const result = await respondToApproval({
        environmentId,
        input: {
          projectId,
          threadId: String(threadId),
          input: {
            request_id: JarvisRequestId.make(String(requestId)),
            decision: PROJECT_APPROVAL_DECISIONS[decision],
            idempotency_key: cachedProjectConversationControlKey(
              controlIdempotencyKeysRef.current,
              `approval:${String(requestId)}`,
              decision,
              () => `project-thread-approval-${String(requestId)}-${randomUUID()}`,
            ),
          },
        },
      });
      setRespondingRequestIds((existing) => existing.filter((id) => id !== requestId));
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          showControlFailure(
            "Could not submit approval",
            "Jarvis rejected the approval decision.",
            squashAtomCommandFailure(result),
          );
        }
        return result;
      }
      if (!result.value.ok || !result.value.result) {
        showControlFailure(
          "Could not submit approval",
          result.value.error?.message ?? "Jarvis rejected the approval decision.",
          result.value.error?.message,
        );
        return result;
      }
      threadDetailStream.refresh();
      return result;
    },
    [environmentId, projectId, respondToApproval, threadDetailStream, threadId],
  );

  const onRespondToUserInput = useCallback(
    async (requestId: ApprovalRequestId, answers: Record<string, unknown>) => {
      setRespondingUserInputRequestIds((existing) =>
        existing.includes(requestId) ? existing : [...existing, requestId],
      );
      const result = await respondToUserInput({
        environmentId,
        input: {
          projectId,
          threadId: String(threadId),
          input: {
            request_id: JarvisRequestId.make(String(requestId)),
            answers,
            idempotency_key: cachedProjectConversationControlKey(
              controlIdempotencyKeysRef.current,
              `input:${String(requestId)}`,
              JSON.stringify(answers),
              () => `project-thread-input-${String(requestId)}-${randomUUID()}`,
            ),
          },
        },
      });
      setRespondingUserInputRequestIds((existing) => existing.filter((id) => id !== requestId));
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          showControlFailure(
            "Could not submit input",
            "Jarvis rejected the conversation input.",
            squashAtomCommandFailure(result),
          );
        }
        return result;
      }
      if (!result.value.ok || !result.value.result) {
        showControlFailure(
          "Could not submit input",
          result.value.error?.message ?? "Jarvis rejected the conversation input.",
          result.value.error?.message,
        );
        return result;
      }
      setPendingUserInputAnswersByRequestId((existing) => {
        const next = { ...existing };
        delete next[String(requestId)];
        return next;
      });
      threadDetailStream.refresh();
      return result;
    },
    [environmentId, projectId, respondToUserInput, threadDetailStream, threadId],
  );

  const setActivePendingUserInputQuestionIndex = useCallback(
    (nextQuestionIndex: number) => {
      if (!activePendingUserInput) return;
      setPendingUserInputQuestionIndexByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: nextQuestionIndex,
      }));
    },
    [activePendingUserInput],
  );

  const onSelectActivePendingUserInputOption = useCallback(
    (questionId: string, optionLabel: string) => {
      if (!activePendingUserInput) return;
      setPendingUserInputAnswersByRequestId((existing) => {
        const question =
          (activePendingProgress?.activeQuestion?.id === questionId
            ? activePendingProgress.activeQuestion
            : undefined) ??
          activePendingUserInput.questions.find((entry) => entry.id === questionId);
        if (!question) return existing;
        return {
          ...existing,
          [activePendingUserInput.requestId]: {
            ...existing[activePendingUserInput.requestId],
            [questionId]: togglePendingUserInputOptionSelection(
              question,
              existing[activePendingUserInput.requestId]?.[questionId],
              optionLabel,
            ),
          },
        };
      });
      promptRef.current = "";
      composerRef.current?.resetCursorState({ cursor: 0 });
    },
    [activePendingProgress?.activeQuestion, activePendingUserInput, composerRef],
  );

  const onChangeActivePendingUserInputCustomAnswer = useCallback(
    (questionId: string, value: string, nextCursor: number, expandedCursor: number) => {
      if (!activePendingUserInput) return;
      promptRef.current = value;
      setPendingUserInputAnswersByRequestId((existing) => ({
        ...existing,
        [activePendingUserInput.requestId]: {
          ...existing[activePendingUserInput.requestId],
          [questionId]: setPendingUserInputCustomAnswer(
            existing[activePendingUserInput.requestId]?.[questionId],
            value,
          ),
        },
      }));
      const snapshot = composerRef.current?.readSnapshot();
      if (
        snapshot?.value !== value ||
        snapshot.cursor !== nextCursor ||
        snapshot.expandedCursor !== expandedCursor
      ) {
        composerRef.current?.focusAt(nextCursor);
      }
    },
    [activePendingUserInput, composerRef],
  );

  const onAdvanceActivePendingUserInput = useCallback(() => {
    if (!activePendingUserInput || !activePendingProgress) return;
    if (activePendingProgress.isLastQuestion) {
      if (activePendingResolvedAnswers) {
        void onRespondToUserInput(activePendingUserInput.requestId, activePendingResolvedAnswers);
      }
      return;
    }
    setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
  }, [
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingUserInput,
    onRespondToUserInput,
    setActivePendingUserInputQuestionIndex,
  ]);

  const onPreviousActivePendingUserInputQuestion = useCallback(() => {
    if (!activePendingProgress) return;
    setActivePendingUserInputQuestionIndex(Math.max(activePendingProgress.questionIndex - 1, 0));
  }, [activePendingProgress, setActivePendingUserInputQuestionIndex]);

  const onInterrupt = useCallback(async () => {
    if (!composerRuntime.activeTurnId || !composerRuntime.canInterrupt) return;
    const result = await interruptTurn({
      environmentId,
      input: {
        projectId,
        threadId: String(threadId),
        input: {
          turn_id: composerRuntime.activeTurnId,
          idempotency_key: cachedProjectConversationControlKey(
            controlIdempotencyKeysRef.current,
            `interrupt:${composerRuntime.activeTurnId}`,
            "interrupt",
            () => `project-thread-interrupt-${composerRuntime.activeTurnId}-${randomUUID()}`,
          ),
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        showControlFailure(
          "Could not stop turn",
          "Jarvis could not interrupt the active turn.",
          squashAtomCommandFailure(result),
        );
      }
      return;
    }
    if (!result.value.ok || !result.value.result) {
      showControlFailure(
        "Could not stop turn",
        result.value.error?.message ?? "Jarvis could not interrupt the active turn.",
        result.value.error?.message,
      );
      return;
    }
    threadDetailStream.refresh();
  }, [
    composerRuntime.activeTurnId,
    composerRuntime.canInterrupt,
    environmentId,
    interruptTurn,
    projectId,
    threadDetailStream,
    threadId,
  ]);

  const writeArchiveState = async (action: "archive" | "unarchive") => {
    if (conversation === null) {
      return;
    }
    setPendingArchiveConfirmation(false);

    const result =
      action === "archive"
        ? await archiveThread({
            environmentId,
            input: {
              projectId,
              threadId: String(threadId),
              input: {},
            },
          })
        : await unarchiveThread({
            environmentId,
            input: {
              projectId,
              threadId: String(threadId),
            },
          });

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const message = formatProjectConversationFailure(action, squashAtomCommandFailure(result));
        toastManager.add({
          type: "error",
          title:
            action === "archive"
              ? "Could not archive conversation"
              : "Could not unarchive conversation",
          description: message,
        });
      }
      return;
    }
    if (!result.value.ok || !result.value.thread) {
      const message = formatProjectConversationFailure(
        action,
        result.value.error?.message ?? "Jarvis did not return the project conversation.",
      );
      toastManager.add({
        type: "error",
        title:
          action === "archive"
            ? "Could not archive conversation"
            : "Could not unarchive conversation",
        description: message,
      });
      return;
    }

    refreshConversationData();
    toastManager.add({
      type: "success",
      title: action === "archive" ? "Conversation archived" : "Conversation unarchived",
    });
  };

  const projectQueryFailed = projectsQuery.error !== null || projectsQuery.data?.ok === false;
  const threadsQueryFailed = threadsQuery.error !== null || threadsQuery.data?.ok === false;
  const loadingProject =
    (projectsQuery.isPending && !projectsQuery.data) ||
    (threadsQuery.isPending && !threadsQuery.data);

  return (
    <ConversationScreen
      header={
        <header
          className={cn(
            "border-b border-border px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            isElectron ? "workspace-topbar drag-region" : "workspace-topbar",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <div className="flex w-full min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 pt-0.5">
              <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
              {renamingConversation ? (
                <form
                  className="flex min-w-0 items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitConversationRename();
                  }}
                >
                  <input
                    className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={renameDraft}
                    aria-label="Conversation title"
                    disabled={renameGenerating}
                    onChange={(event) => setRenameDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelConversationRename();
                      }
                    }}
                    autoFocus
                  />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="outline"
                          aria-label="Generate conversation title with AI"
                          disabled={renameBusy || renameGenerating}
                          onClick={() => void generateConversationTitle()}
                        >
                          {renameGenerating ? (
                            <Spinner className="size-3.5" />
                          ) : (
                            <SparklesIcon className="size-3.5" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipPopup side="bottom">Generate with AI</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="submit"
                          size="icon-xs"
                          variant="outline"
                          aria-label="Save conversation title"
                          disabled={renameBusy || renameGenerating}
                        >
                          {renameBusy ? (
                            <Spinner className="size-3.5" />
                          ) : (
                            <CheckIcon className="size-3.5" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipPopup side="bottom">Save title</TooltipPopup>
                  </Tooltip>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Cancel conversation rename"
                    onClick={cancelConversationRename}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="group/title flex min-w-0 cursor-pointer items-center gap-1.5 text-left outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"
                    onClick={startConversationRename}
                    disabled={conversation === null}
                    title="Rename conversation"
                  >
                    <ChatHeaderTitle title={conversationTitle.title} />
                    {conversation !== null ? (
                      <PencilIcon className="size-3 shrink-0 text-muted-foreground/0 transition-colors group-hover/title:text-muted-foreground group-focus-visible/title:text-muted-foreground" />
                    ) : null}
                  </button>
                  {conversationStatus ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={conversationStatus.variant} className="h-5 text-[10px]">
                        {conversationStatus.label}
                      </Badge>
                      {conversationStatus.endedNote ? (
                        <span className="text-xs text-muted-foreground">
                          {conversationStatus.endedNote}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {archived ? <Badge variant="secondary">Archived</Badge> : null}
              <RoutineLauncherControl
                context={routineContext}
                environmentId={environmentId}
                projectId={projectId}
                showLabel
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="outline"
                      aria-label={
                        rightPanelState.isOpen
                          ? "Hide conversation context panel"
                          : "Show conversation context panel"
                      }
                      onClick={toggleContextPanel}
                    >
                      {rightPanelState.isOpen ? (
                        <PanelRightCloseIcon className="size-3.5" />
                      ) : (
                        <PanelRightOpenIcon className="size-3.5" />
                      )}
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">
                  {rightPanelState.isOpen
                    ? "Hide conversation context"
                    : "Show conversation context"}
                </TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="outline"
                      aria-label="Refresh project conversation"
                      onClick={refreshConversationData}
                    >
                      <RefreshCwIcon
                        className={cn("size-3.5", threadsQuery.isPending && "animate-spin")}
                      />
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">Refresh</TooltipPopup>
              </Tooltip>
              <Button
                size="xs"
                variant="outline"
                disabled={conversation === null}
                onClick={() =>
                  archived
                    ? void writeArchiveState("unarchive")
                    : setPendingArchiveConfirmation(true)
                }
              >
                {archived ? (
                  <ArchiveRestoreIcon className="size-3.5" />
                ) : (
                  <ArchiveIcon className="size-3.5" />
                )}
                {archived ? "Unarchive" : "Archive"}
              </Button>
            </div>
          </div>
        </header>
      }
      banners={
        <>
          {detailFallback ? (
            <div className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-5">
              <Alert variant="info">
                <MessageSquareIcon />
                <AlertTitle>History unavailable</AlertTitle>
                <AlertDescription>{detailFallback}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {archiveSummary ? (
            <div className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-5">
              <Alert variant="info">
                <ArchiveIcon />
                <AlertTitle>Archived conversation</AlertTitle>
                <AlertDescription>{archiveSummary}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {projectQueryFailed || threadsQueryFailed ? (
            <div className="mx-auto w-full max-w-5xl px-3 pt-3 sm:px-5">
              <Alert variant="error">
                <TriangleAlertIcon />
                <AlertTitle>Project conversation unavailable</AlertTitle>
                <AlertDescription>
                  {projectsQuery.data?.ok === false
                    ? projectsQuery.data.error?.message
                    : threadsQuery.data?.ok === false
                      ? threadsQuery.data.error?.message
                      : projectsQuery.error || threadsQuery.error || "Jarvis did not return data."}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </>
      }
      timeline={
        <div
          className={cn(
            "min-h-0 flex-1",
            agentConversation
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto px-3 py-4 sm:px-5",
          )}
        >
          {agentConversation ? (
            <div className="min-h-0 flex-1">
              <AgentConversationTimeline
                conversation={agentConversation}
                timeline={resolvedConversationTimeline}
                controller={timelineController}
                environmentId={environmentId}
                routeThreadKey={`${environmentId}:${String(threadId)}`}
                resolvedTheme={resolvedTheme}
                timestampFormat={settings.timestampFormat}
                onRecoveryAction={retryTurn}
                onOpenConversationTarget={openConversationTarget}
                recoveryActionsDisabled={sendBusy}
              />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col pb-4">
              {loadingProject ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  Loading project conversation
                </div>
              ) : null}
              {!loadingProject && conversation === null ? (
                <Empty className="min-h-80">
                  <EmptyHeader>
                    <EmptyTitle>Conversation not found</EmptyTitle>
                    <EmptyDescription>
                      Jarvis did not return this project conversation for {projectName}.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </div>
          )}
        </div>
      }
      composer={
        <ConversationComposer
          controller={timelineController}
          lowerChromeClassName="pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <ChatComposer
            capabilities={composerCapabilities}
            composerRef={composerRef}
            composerDraftTarget={composerDraftTarget}
            environmentId={environmentId}
            routeKind="agent"
            routeThreadRef={routeThreadRef}
            draftId={null}
            activeThreadId={conversation === null ? null : threadId}
            activeThreadEnvironmentId={environmentId}
            activeThread={undefined}
            isServerThread={true}
            isLocalDraftThread={false}
            isJarvisCockpitEnvironment={true}
            showJarvisResumeSendHint={false}
            phase={composerRuntime.phase}
            allowSendWhileRunning={composerRuntime.canQueue}
            isConnecting={false}
            isSendBusy={sendBusy}
            isPreparingWorktree={false}
            composerDisabledReason={composerDisabledReason}
            environmentUnavailable={null}
            activePendingApproval={activePendingApproval}
            pendingApprovals={composerRuntime.pendingApprovals}
            pendingUserInputs={composerRuntime.pendingUserInputs}
            activePendingProgress={activePendingProgress}
            activePendingResolvedAnswers={activePendingResolvedAnswers}
            activePendingIsResponding={activePendingIsResponding}
            activePendingDraftAnswers={activePendingDraftAnswers}
            activePendingQuestionIndex={activePendingQuestionIndex}
            respondingRequestIds={respondingRequestIds}
            showPlanFollowUpPrompt={false}
            activeProposedPlan={null}
            activePlan={null}
            sidebarProposedPlan={null}
            planSidebarLabel="Plan"
            planSidebarOpen={false}
            lockedProvider={null}
            providerStatuses={providerStatuses as ServerProvider[]}
            activeProjectDefaultModelSelection={null}
            activeThreadModelSelection={null}
            activeThreadActivities={undefined}
            resolvedTheme={resolvedTheme}
            settings={settings}
            keybindings={keybindings}
            brainWorkspace={{
              project,
              workspace: conversationWorkspace,
              staging: workspaceStaging,
              disabled: conversation === null || archived || sendBusy,
              onStagingChange: setWorkspaceStaging,
            }}
            terminalOpen={false}
            gitCwd={conversationWorkspaceCwd}
            memoryMentionFiles={files}
            memoryMentionFilesQuery={
              filesQuery.data?.ok === true ? (filesQuery.data.query ?? null) : null
            }
            memoryMentionFilesPending={filesQuery.isPending}
            onMemoryMentionQueryChange={setMemoryMentionQuery}
            promptRef={promptRef}
            composerImagesRef={composerImagesRef}
            composerTerminalContextsRef={composerTerminalContextsRef}
            composerElementContextsRef={composerElementContextsRef}
            onSend={(event) => void handleComposerSend(event)}
            onInterrupt={() => void onInterrupt()}
            onRespondToApproval={onRespondToApproval}
            onSelectActivePendingUserInputOption={onSelectActivePendingUserInputOption}
            onAdvanceActivePendingUserInput={onAdvanceActivePendingUserInput}
            onPreviousActivePendingUserInputQuestion={onPreviousActivePendingUserInputQuestion}
            onChangeActivePendingUserInputCustomAnswer={onChangeActivePendingUserInputCustomAnswer}
            focusComposer={() => composerRef.current?.focusAtEnd()}
            scheduleComposerFocus={() =>
              window.requestAnimationFrame(() => composerRef.current?.focusAtEnd())
            }
            setThreadError={(_threadId, error) => {
              if (error) {
                showAttachmentError(error);
              }
            }}
            onExpandImage={timelineController.onExpandImage}
          />
        </ConversationComposer>
      }
      inlinePanel={
        !shouldUseRightPanelSheet && rightPanelState.isOpen ? contextRightPanel("inline") : null
      }
      sheetPanel={
        shouldUseRightPanelSheet && rightPanelState.isOpen ? (
          <RightPanelSheet open onClose={() => useRightPanelStore.getState().close(routeThreadRef)}>
            {contextRightPanel("sheet")}
          </RightPanelSheet>
        ) : null
      }
      overlays={
        <AlertDialog
          open={pendingArchiveConfirmation}
          onOpenChange={(open) => {
            if (!open) {
              setPendingArchiveConfirmation(false);
            }
          }}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive project conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                Archive this project conversation? Jarvis will hide it from the default conversation
                list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
              <Button variant="destructive" onClick={() => void writeArchiveState("archive")}>
                Archive
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      }
    />
  );
}

function formatProjectConversationRenameFailure(error: unknown): string {
  const message = formatJarvisCommandFailure(
    error,
    "The Jarvis project conversation rename request failed.",
  );
  if (/projects\.threads\.rename.*HTTP (404|405|501)/u.test(message)) {
    return "This Jarvis brain does not expose project conversation rename yet. Cockpit reached Jarvis, but the conversation rename route is unavailable.";
  }
  if (/HTTP 403/u.test(message)) {
    return "Jarvis denied the project conversation rename.";
  }
  return message;
}

function formatProjectConversationSendFailure(error: unknown): string {
  const message = formatProjectConversationFailure("send", error);
  if (/thread_archived|HTTP 409/u.test(message)) {
    return "This conversation was archived before the turn could be sent. Unarchive it to continue.";
  }
  if (/validation[_ -]?failed/i.test(message)) {
    return `Jarvis rejected the turn attachments: ${message}`;
  }
  return message;
}
