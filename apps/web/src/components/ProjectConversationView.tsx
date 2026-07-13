import { ProjectId } from "@t3tools/contracts";
import type {
  EnvironmentId,
  JarvisTurnAttachment,
  JarvisTurnWorkspaceInput,
  ServerProvider,
  ThreadId,
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
import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatRelativeTimeLabel } from "../timestampFormat";
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
  projectConversationHistoryMessages,
  projectConversationMergedMessages,
  sortProjectConversations,
  visibleProjectFiles,
  type ProjectConversationLocalTurnView,
  type ProjectConversationMessageView,
} from "../jarvisProjectConversations.logic";
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
  buildTurnWorkspaceInput,
  clearProjectConversationWorkspaceRepos,
  createProjectConversationWorkspaceStaging,
  projectConversationWorkspaceMatchesSubmission,
  setProjectConversationWorkspaceEngine,
  type ProjectConversationWorkspaceStaging,
} from "./projectConversationWorkspace.logic";
import { projectConversationCapabilities } from "./composer/composerCapabilities";
import { BrainWorkspaceStrip } from "./composer/BrainWorkspaceStrip";
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
import type { ExpandedImagePreview } from "./chat/ExpandedImagePreview";
import { mergeJarvisThreadToolEventsWithReply } from "../jarvisThreadToolEvents.logic";
import { agentConversationTimelineRenderMode } from "../agentConversationTimeline.logic";
import { ProjectConversationMessage } from "./ProjectConversationMessage";
import { ChatHeaderTitle } from "./chat/ChatHeaderTitle";
import { AgentConversationTimeline } from "./chat/AgentConversationTimeline";
import { cloneComposerImageForRetry } from "./ChatView.logic";
import { ConversationContextPanel } from "./ConversationContextPanel";
import { RightPanelTabs } from "./RightPanelTabs";
import { RightPanelSheet } from "./RightPanelSheet";

interface ProjectConversationViewProps {
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
}

const PROJECT_CONVERSATION_FILE_DATA_URL_READ_MESSAGES = {
  nonStringResult: "File reader returned a non-string data URL.",
  readFailure: "File read failed.",
};

const EMPTY_RIGHT_PANEL_PENDING_IDS = new Set<string>();
const EMPTY_RIGHT_PANEL_PREVIEW_SESSIONS = {};
const EMPTY_RIGHT_PANEL_TERMINAL_LABELS = new Map<string, string>();

export function ProjectConversationView({
  environmentId,
  projectId,
  threadId,
}: ProjectConversationViewProps) {
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
  const filesQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectFiles({
      environmentId,
      input: { projectId, includeRetracted: false },
    }),
  );
  const sendTurn = useAtomCommand(serverEnvironment.sendJarvisProjectThreadTurn, {
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
  const historyMessages = useMemo(
    () => projectConversationHistoryMessages(threadDetailStream.data ?? null),
    [threadDetailStream.data],
  );
  const files = useMemo(
    () => visibleProjectFiles(filesQuery.data?.ok === true ? (filesQuery.data.files ?? []) : []),
    [filesQuery.data],
  );
  const providerStatuses = useAtomValue(primaryServerProvidersAtom);
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
  const composerRef = useComposerHandleContext() ?? localComposerRef;
  const clearComposerContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const messages = useMemo(
    () => projectConversationMergedMessages({ historyMessages, localTurns: turns }),
    [historyMessages, turns],
  );
  const agentConversation = useMemo(
    () =>
      threadDetailStream.data === null || threadDetailStream.data === undefined
        ? null
        : enrichAgentConversationWithJarvisContext(
            adaptJarvisProjectThread(threadDetailStream.data),
            {
              project,
              memory: memoryQuery.data?.ok === true ? (memoryQuery.data.memory ?? null) : null,
              files,
            },
          ),
    [files, memoryQuery.data, project, threadDetailStream.data],
  );
  const localMessages = useMemo(
    () => messages.filter((message) => message.source === "local"),
    [messages],
  );
  const agentTimelineRenderMode = agentConversationTimelineRenderMode({
    hasAgentConversation: agentConversation !== null,
    timelineEntryCount: agentConversation?.timeline.length ?? 0,
    localMessageCount: localMessages.length,
  });
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
      }),
    [conversation?.engine],
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
    turnCounter.current = 0;
  }, [threadId]);

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
    const engine = conversationWorkspace?.engine?.trim().toLowerCase();
    if (engine !== "codex" && engine !== "claude") {
      return;
    }
    setWorkspaceStagingByThread((existing) => ({
      ...existing,
      [workspaceStagingKey]: setProjectConversationWorkspaceEngine(
        existing[workspaceStagingKey] ?? createProjectConversationWorkspaceStaging(),
        engine,
      ),
    }));
  }, [conversationWorkspace?.engine, workspaceStagingKey]);

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
          messages,
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
    options: { readonly existingTurnId?: string } = {},
  ) => {
    const text = submission.prompt.trim();
    if (text.length === 0 || sendBusy || archived) return;
    const existingTurnId = options.existingTurnId;
    const turnAttachments = submission.attachments;
    const turnWorkspace = submission.workspace;
    const workspaceMatchesSubmission = projectConversationWorkspaceMatchesSubmission(
      buildTurnWorkspaceInput(workspaceStaging),
      turnWorkspace,
    );
    const clearMatchingRetryDraft =
      existingTurnId !== undefined &&
      workspaceMatchesSubmission &&
      projectConversationComposerMatchesSubmission({
        draftPrompt: promptRef.current,
        draftImageIds: composerImagesRef.current.map((image) => image.id),
        terminalContextCount: composerTerminalContextsRef.current.length,
        elementContextCount: composerElementContextsRef.current.length,
        submissionPrompt: submission.prompt,
        submissionImageIds: submission.composerImages.map((image) => image.id),
      });

    const turnId = existingTurnId ?? `project-turn-${Date.now()}-${turnCounter.current++}`;
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

    const result = await sendTurn({
      environmentId,
      input: {
        projectId,
        threadId: String(threadId),
        input: {
          text,
          ...(turnAttachments.length > 0 ? { attachments: turnAttachments } : {}),
          ...(turnWorkspace !== null ? { workspace: turnWorkspace } : {}),
        },
      },
    });
    if (result._tag === "Failure") {
      const interrupted = isAtomCommandInterrupted(result);
      const message = interrupted
        ? "Project conversation send interrupted."
        : formatProjectConversationSendFailure(squashAtomCommandFailure(result));
      markTurn(turnId, { status: "failed", error: message });
      if (!existingTurnId || clearMatchingRetryDraft) restoreFailedSubmission(submission);
      if (!interrupted) {
        toastManager.add({
          type: "error",
          title: "Could not send project turn",
          description: message,
        });
      }
      return;
    }
    if (!result.value.ok || !result.value.result) {
      const message = formatProjectConversationSendFailure(
        result.value.error?.message ?? "Jarvis did not return a project conversation turn result.",
      );
      markTurn(turnId, { status: "failed", error: message });
      if (!existingTurnId || clearMatchingRetryDraft) restoreFailedSubmission(submission);
      toastManager.add({
        type: "error",
        title: "Could not send project turn",
        description: message,
      });
      return;
    }

    const toolItems = mergeJarvisThreadToolEventsWithReply(result.value.result);
    const mergedReply = toolItems
      .filter((item) => item.kind === "reply")
      .map((item) => item.text)
      .join("")
      .trim();
    const reply = mergedReply || extractProjectConversationReply(result.value.result);
    markTurn(turnId, { status: "completed", response: reply, toolItems, error: null });
    // Clear only the workspace snapshot that actually succeeded. A replacement
    // staged while this request was in flight remains available for the next turn.
    if (turnWorkspace !== null && workspaceMatchesSubmission) {
      clearWorkspaceRepoStaging();
    }
    refreshConversationData();
  };

  const handleComposerSend = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    if (sendBusy || archived || conversation === null) return;
    const sendContext = composerRef.current?.getSendContext();
    if (!sendContext) return;
    const workspace = buildTurnWorkspaceInput(workspaceStaging);
    const attachments = await prepareProjectTurnAttachments({
      images: sendContext.images,
      persistedImages: sendContext.persistedImages,
    });
    if (attachments === null) {
      return;
    }
    await sendPrompt({
      prompt: sendContext.prompt,
      attachments,
      composerImages: [...sendContext.images],
      workspace: workspace ?? null,
    });
  };

  const retryMessage = (message: ProjectConversationMessageView): (() => void) | undefined => {
    const retryPrompt = message.retryPrompt;
    const localTurnId = message.localTurnId;
    if (!retryPrompt || !localTurnId) {
      return undefined;
    }
    return () =>
      void sendPrompt(
        {
          prompt: retryPrompt,
          attachments: message.retryAttachments ?? [],
          composerImages: message.retryComposerImages ?? [],
          workspace: message.retryWorkspace,
        },
        { existingTurnId: localTurnId },
      );
  };

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
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
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

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "min-h-0 flex-1",
                agentConversation
                  ? "flex flex-col overflow-hidden"
                  : "overflow-y-auto px-3 py-4 sm:px-5",
              )}
            >
              {agentTimelineRenderMode === "native" && agentConversation ? (
                <div className="min-h-0 flex-1">
                  <AgentConversationTimeline
                    conversation={agentConversation}
                    environmentId={environmentId}
                    routeThreadKey={`${environmentId}:${String(threadId)}`}
                    resolvedTheme={resolvedTheme}
                    timestampFormat={settings.timestampFormat}
                    showEmptyState={localMessages.length === 0}
                  />
                </div>
              ) : agentTimelineRenderMode === "legacy" ? (
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
                  {conversation !== null && messages.length === 0 ? (
                    <Empty className="min-h-80">
                      <EmptyHeader>
                        <MessageSquareIcon className="mb-4 size-7 text-muted-foreground" />
                        <EmptyTitle>{conversation.title}</EmptyTitle>
                        <EmptyDescription>
                          {conversation.workspace
                            ? `Updated ${formatRelativeTimeLabel(conversation.updated_at)}. Continue the workspace conversation from this surface.`
                            : "Planning conversation - no repo access. Attach a repo to let it inspect code."}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                  {messages.map((message) => (
                    <ProjectConversationMessage
                      key={message.id}
                      message={message}
                      workspaceProvisionPhase={conversationWorkspace?.provision_phase ?? null}
                      onRetry={retryMessage(message)}
                      retryDisabled={sendBusy}
                    />
                  ))}
                </div>
              ) : null}
              {agentConversation && localMessages.length > 0 ? (
                <div
                  className={cn(
                    "overflow-y-auto px-3 pt-2 sm:px-5",
                    agentConversation.timeline.length === 0
                      ? "min-h-0 flex-1"
                      : "max-h-[40%] shrink-0 border-t border-border/40",
                  )}
                >
                  <div className="mx-auto flex w-full max-w-3xl flex-col">
                    {localMessages.map((message) => (
                      <ProjectConversationMessage
                        key={message.id}
                        message={message}
                        workspaceProvisionPhase={conversationWorkspace?.provision_phase ?? null}
                        onRetry={retryMessage(message)}
                        retryDisabled={sendBusy}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t border-border/40 bg-background pt-2">
              <div className="mx-auto w-full max-w-3xl px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
                <div>
                  <ChatComposer
                    capabilities={composerCapabilities}
                    composerRef={composerRef}
                    composerDraftTarget={composerDraftTarget}
                    environmentId={environmentId}
                    routeKind="draft"
                    routeThreadRef={routeThreadRef}
                    draftId={composerDraftTarget}
                    activeThreadId={conversation === null ? null : threadId}
                    activeThreadEnvironmentId={environmentId}
                    activeThread={undefined}
                    isServerThread={false}
                    isLocalDraftThread={false}
                    isJarvisCockpitEnvironment={true}
                    showJarvisResumeSendHint={false}
                    phase="ready"
                    isConnecting={false}
                    isSendBusy={sendBusy}
                    isPreparingWorktree={false}
                    composerDisabledReason={composerDisabledReason}
                    environmentUnavailable={null}
                    activePendingApproval={null}
                    pendingApprovals={[]}
                    pendingUserInputs={[]}
                    activePendingProgress={null}
                    activePendingResolvedAnswers={null}
                    activePendingIsResponding={false}
                    activePendingDraftAnswers={{}}
                    activePendingQuestionIndex={0}
                    respondingRequestIds={[]}
                    showPlanFollowUpPrompt={false}
                    activeProposedPlan={null}
                    activePlan={null}
                    sidebarProposedPlan={null}
                    planSidebarLabel="Plan"
                    planSidebarOpen={false}
                    runtimeMode="full-access"
                    interactionMode="default"
                    lockedProvider={null}
                    providerStatuses={providerStatuses as ServerProvider[]}
                    activeProjectDefaultModelSelection={null}
                    activeThreadModelSelection={null}
                    activeThreadActivities={undefined}
                    resolvedTheme={resolvedTheme}
                    settings={settings}
                    keybindings={keybindings}
                    idlePlaceholder="Send a project conversation turn"
                    belowComposer={
                      <BrainWorkspaceStrip
                        compact={false}
                        project={project}
                        workspace={conversationWorkspace}
                        staging={workspaceStaging}
                        disabled={conversation === null || archived || sendBusy}
                        onStagingChange={setWorkspaceStaging}
                      />
                    }
                    terminalOpen={false}
                    gitCwd={null}
                    promptRef={promptRef}
                    composerImagesRef={composerImagesRef}
                    composerTerminalContextsRef={composerTerminalContextsRef}
                    composerElementContextsRef={composerElementContextsRef}
                    onSend={(event) => void handleComposerSend(event)}
                    onInterrupt={() => {}}
                    onImplementPlanInNewThread={() => {}}
                    onRespondToApproval={async () => undefined}
                    onSelectActivePendingUserInputOption={() => {}}
                    onAdvanceActivePendingUserInput={() => {}}
                    onPreviousActivePendingUserInputQuestion={() => {}}
                    onChangeActivePendingUserInputCustomAnswer={() => {}}
                    onProviderModelSelect={() => {}}
                    getModelDisabledReason={() => null}
                    toggleInteractionMode={() => {}}
                    handleRuntimeModeChange={() => {}}
                    handleInteractionModeChange={() => {}}
                    togglePlanSidebar={() => {}}
                    focusComposer={() => composerRef.current?.focusAtEnd()}
                    scheduleComposerFocus={() =>
                      window.requestAnimationFrame(() => composerRef.current?.focusAtEnd())
                    }
                    setThreadError={(_threadId, error) => {
                      if (error) {
                        showAttachmentError(error);
                      }
                    }}
                    onExpandImage={(_preview: ExpandedImagePreview) => {}}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
        {shouldUseRightPanelSheet && rightPanelState.isOpen ? (
          <RightPanelSheet open onClose={() => useRightPanelStore.getState().close(routeThreadRef)}>
            {contextRightPanel("sheet")}
          </RightPanelSheet>
        ) : null}
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
      </div>
      {!shouldUseRightPanelSheet && rightPanelState.isOpen ? contextRightPanel("inline") : null}
    </div>
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
