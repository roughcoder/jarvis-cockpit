import { ProjectId } from "@t3tools/contracts";
import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectMemoryResult,
  JarvisTurnAttachment,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BrainIcon,
  CheckIcon,
  FileTextIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { isElectron } from "../env";
import {
  primaryServerKeybindingsAtom,
  primaryServerProvidersAtom,
  serverEnvironment,
} from "../state/server";
import { type EnvironmentQueryView, useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { cn, randomUUID } from "../lib/utils";
import { readFileAsDataUrl } from "../lib/fileAttachments";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useEnvironmentSettings } from "../hooks/useSettings";
import { useTheme } from "../hooks/useTheme";
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
  defaultProjectRepo,
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
import { buildProjectConversationTurnAttachments } from "./projectConversationComposer.logic";
import { projectConversationCapabilities } from "./composer/composerCapabilities";
import {
  buildProjectConversationRenameInput,
  PROJECT_CONTEXT_PANEL_COLLAPSED_STORAGE_KEY,
  resolveProjectConversationHeaderStatus,
  resolveProjectContextPanelToggleState,
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

interface ProjectConversationViewProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly threadId: ThreadId;
}

type LocalTurn = ProjectConversationLocalTurnView;

const PROJECT_CONVERSATION_FILE_DATA_URL_READ_MESSAGES = {
  nonStringResult: "File reader returned a non-string data URL.",
  readFailure: "File read failed.",
};

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
  const threadDetailQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectThread({
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
    threadDetailQuery.data?.ok === true && threadDetailQuery.data.thread
      ? threadDetailQuery.data.thread
      : (conversations.find((candidate) => candidate.thread_id === String(threadId)) ?? null);
  const historyMessages = useMemo(
    () =>
      projectConversationHistoryMessages(
        threadDetailQuery.data?.ok === true ? (threadDetailQuery.data.thread ?? null) : null,
      ),
    [threadDetailQuery.data],
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
  const promptRef = useRef("");
  const composerImagesRef = useRef<ComposerImageAttachment[]>([]);
  const composerTerminalContextsRef = useRef<TerminalContextDraft[]>([]);
  const composerElementContextsRef = useRef<ElementContextDraft[]>([]);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const clearComposerContent = useComposerDraftStore((store) => store.clearComposerContent);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const messages = useMemo(
    () => projectConversationMergedMessages({ historyMessages, localTurns: turns }),
    [historyMessages, turns],
  );
  const [pendingArchiveConfirmation, setPendingArchiveConfirmation] = useState(false);
  const [renamingConversation, setRenamingConversation] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [contextPanelCollapsed, setContextPanelCollapsed] = useLocalStorage(
    PROJECT_CONTEXT_PANEL_COLLAPSED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const turnCounter = useRef(0);
  const sendBusy = turns.some((turn) => turn.status === "pending" || turn.status === "streaming");
  const projectName = project?.name ?? projectId;
  const archived = isProjectConversationArchived(conversation);
  const archiveSummary = archivedProjectConversationSummary(conversation);
  const conversationTitle = resolveProjectConversationTitle({
    serverTitle: conversation?.title ?? "Project conversation",
  });
  const conversationStatus = resolveProjectConversationHeaderStatus({
    status: conversation?.status,
    endedReason: conversation?.ended_reason,
  });
  const contextPanelToggleState = resolveProjectContextPanelToggleState(contextPanelCollapsed);
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
    threadDetailQuery.data?.ok === false &&
    isProjectConversationDetailRouteGap(threadDetailQuery.data.error?.message)
      ? formatProjectConversationFailure("detail", threadDetailQuery.data.error?.message)
      : null;

  useEffect(() => {
    // Param-only navigation between conversations reuses this component, so reset all
    // per-thread local state — otherwise the previous conversation's optimistic turns
    // and rename state leak into the next one. Composer content is keyed by thread.
    setRenamingConversation(false);
    setRenameDraft("");
    setTurns([]);
    turnCounter.current = 0;
  }, [threadId]);

  const refreshConversationData = () => {
    threadsQuery.refresh();
    threadDetailQuery.refresh();
    memoryQuery.refresh();
    filesQuery.refresh();
  };

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
    threadDetailQuery.refresh();
  };

  const markTurn = (
    turnId: string,
    patch: Pick<LocalTurn, "status"> & Partial<Pick<LocalTurn, "response" | "error">>,
  ) => {
    setTurns((existing) =>
      existing.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              ...patch,
              response: patch.response ?? turn.response,
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

  const sendPrompt = async (
    prompt: string,
    options: {
      readonly attachments?: ReadonlyArray<JarvisTurnAttachment>;
      readonly existingTurnId?: string;
    } = {},
  ) => {
    const text = prompt.trim();
    if (text.length === 0 || sendBusy || archived) return;
    const existingTurnId = options.existingTurnId;
    const turnAttachments = existingTurnId ? [] : (options.attachments ?? []);

    const turnId = existingTurnId ?? `project-turn-${Date.now()}-${turnCounter.current++}`;
    if (existingTurnId) {
      markTurn(turnId, { status: "pending", response: "", error: null });
    } else {
      setTurns((existing) => [
        ...existing,
        {
          id: turnId,
          prompt: text,
          response: "",
          status: "pending",
          error: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    if (!existingTurnId) {
      setComposerDraftPrompt(composerDraftTarget, "");
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
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const message = formatProjectConversationSendFailure(squashAtomCommandFailure(result));
        markTurn(turnId, { status: "failed", error: message });
        if (!existingTurnId) {
          setComposerDraftPrompt(composerDraftTarget, text);
          composerRef.current?.resetCursorState({ cursor: text.length, prompt: text });
        }
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
      if (!existingTurnId) {
        setComposerDraftPrompt(composerDraftTarget, text);
        composerRef.current?.resetCursorState({ cursor: text.length, prompt: text });
      }
      toastManager.add({
        type: "error",
        title: "Could not send project turn",
        description: message,
      });
      return;
    }

    const reply = extractProjectConversationReply(result.value.result);
    markTurn(turnId, { status: "completed", response: reply, error: null });
    if (!existingTurnId) {
      clearComposerContent(composerDraftTarget);
      composerRef.current?.resetCursorState({ cursor: 0, prompt: "" });
    }
    refreshConversationData();
  };

  const handleComposerSend = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    if (sendBusy || archived || conversation === null) return;
    const sendContext = composerRef.current?.getSendContext();
    if (!sendContext) return;
    const attachments = await prepareProjectTurnAttachments({
      images: sendContext.images,
      persistedImages: sendContext.persistedImages,
    });
    if (attachments === null) {
      return;
    }
    await sendPrompt(sendContext.prompt, { attachments });
  };

  const retryMessage = (message: ProjectConversationMessageView): (() => void) | undefined => {
    const retryPrompt = message.retryPrompt;
    const localTurnId = message.localTurnId;
    if (!retryPrompt || !localTurnId) {
      return undefined;
    }
    return () => void sendPrompt(retryPrompt, { existingTurnId: localTurnId });
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
                          type="submit"
                          size="icon-xs"
                          variant="outline"
                          aria-label="Save conversation title"
                          disabled={renameBusy}
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
                    <h2 className="truncate text-sm font-medium text-foreground">
                      {conversationTitle.title}
                    </h2>
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
                      aria-label={contextPanelToggleState.ariaLabel}
                      onClick={() =>
                        setContextPanelCollapsed(contextPanelToggleState.nextCollapsed)
                      }
                    >
                      {contextPanelCollapsed ? (
                        <PanelRightOpenIcon className="size-3.5" />
                      ) : (
                        <PanelRightCloseIcon className="size-3.5" />
                      )}
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">{contextPanelToggleState.tooltip}</TooltipPopup>
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

        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 overflow-hidden",
            contextPanelCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_20rem]",
          )}
        >
          <main className="relative flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-40">
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
                        Updated {formatRelativeTimeLabel(conversation.updated_at)}. Continue the
                        Jarvis project conversation from this surface.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}
                {messages.map((message) => (
                  <ProjectConversationMessageRow
                    key={message.id}
                    message={message}
                    onRetry={retryMessage(message)}
                    retryDisabled={sendBusy}
                  />
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-2">
              <div className="mx-auto w-full max-w-3xl px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
                <div className="pointer-events-auto">
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
          <ProjectConversationContextPanel
            project={project}
            files={files}
            memoryQuery={memoryQuery}
            collapsed={contextPanelCollapsed}
          />
        </div>
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
  if (/validation[_ -]?failed/i.test(message)) {
    return `Jarvis rejected the turn attachments: ${message}`;
  }
  return message;
}

function ProjectConversationMessageRow({
  message,
  onRetry,
  retryDisabled,
}: {
  readonly message: ProjectConversationMessageView;
  readonly onRetry: (() => void) | undefined;
  readonly retryDisabled: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        isUser
          ? "ml-auto bg-primary text-primary-foreground"
          : "border border-border/70 bg-card/40 text-foreground",
      )}
    >
      {isUser ? <div className="whitespace-pre-wrap">{message.content}</div> : null}
      {!isUser && (message.status === "pending" || message.status === "streaming") ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-4" />
          {message.content || "Waiting for Jarvis"}
        </div>
      ) : null}
      {!isUser && message.status === "completed" ? (
        <div className="whitespace-pre-wrap">{message.content}</div>
      ) : null}
      {!isUser && message.status === "failed" ? (
        <div className="space-y-2">
          <div className="text-destructive">{message.error ?? message.content}</div>
          {onRetry ? (
            <Button size="xs" variant="outline" onClick={onRetry} disabled={retryDisabled}>
              <RotateCcwIcon className="size-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProjectConversationContextPanel({
  project,
  files,
  memoryQuery,
  collapsed,
}: {
  readonly project: JarvisProject | null;
  readonly files: JarvisProjectFile[];
  readonly memoryQuery: EnvironmentQueryView<JarvisProjectMemoryResult>;
  readonly collapsed: boolean;
}) {
  const defaultRepo = defaultProjectRepo(project);
  const memory = memoryQuery.data?.ok === true ? memoryQuery.data.memory : null;
  if (collapsed) {
    return null;
  }
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-border/70 bg-muted/15 px-4 py-4 lg:block">
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <GitBranchIcon className="size-3.5" />
            Project
          </div>
          <div className="text-sm font-medium text-foreground">{project?.name ?? "Project"}</div>
          {defaultRepo ? (
            <Badge variant="outline" className="max-w-full justify-start truncate">
              {defaultRepo.remote}
            </Badge>
          ) : (
            <div className="text-xs text-muted-foreground">No default repo</div>
          )}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <BrainIcon className="size-3.5" />
            Memory
          </div>
          {memory ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="line-clamp-5">
                {memory.representation || "No representation recorded."}
              </p>
              {memory.conclusions.slice(0, 3).map((conclusion) => (
                <div key={conclusion.id} className="border-t border-border/60 pt-2">
                  <div className="text-xs font-medium text-foreground">
                    {conclusion.artifact_type}
                  </div>
                  <div className="line-clamp-3">{conclusion.content}</div>
                </div>
              ))}
            </div>
          ) : memoryQuery.isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading memory
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No memory summary available.</div>
          )}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <FileTextIcon className="size-3.5" />
            Files
          </div>
          {files.length > 0 ? (
            <div className="space-y-2">
              {files.slice(0, 8).map((file) => (
                <div
                  key={file.doc_id}
                  className="min-w-0 border-t border-border/60 pt-2 first:border-0 first:pt-0"
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {file.title || file.doc_id}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {file.artifact_type || "file"} · {file.doc_id}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No project files recorded.</div>
          )}
        </section>
      </div>
    </aside>
  );
}
