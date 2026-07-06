import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectMemoryResult,
  JarvisProjectThreadTurnResult,
  ThreadId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BrainIcon,
  FileTextIcon,
  GitBranchIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { isElectron } from "../env";
import { serverEnvironment } from "../state/server";
import { type EnvironmentQueryView, useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { cn } from "../lib/utils";
import { formatRelativeTimeLabel } from "../timestampFormat";
import {
  archivedProjectConversationSummary,
  defaultProjectRepo,
  extractProjectConversationReply,
  formatProjectConversationFailure,
  isProjectConversationArchived,
  isProjectConversationDetailRouteGap,
  projectConversationHistoryMessages,
  sortProjectConversations,
  visibleProjectFiles,
  type ProjectConversationMessageView,
  type ProjectConversationSendStatus,
} from "../jarvisProjectConversations.logic";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

interface ProjectConversationViewProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly threadId: ThreadId;
}

interface LocalTurn {
  readonly id: string;
  readonly prompt: string;
  readonly response: string;
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
  readonly createdAt: string;
}

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
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<LocalTurn[]>([]);
  const turnCounter = useRef(0);
  const sendBusy = turns.some((turn) => turn.status === "pending" || turn.status === "streaming");
  const projectName = project?.name ?? projectId;
  const defaultRepo = defaultProjectRepo(project);
  const archived = isProjectConversationArchived(conversation);
  const archiveSummary = archivedProjectConversationSummary(conversation);
  const detailFallback =
    threadDetailQuery.data?.ok === false &&
    isProjectConversationDetailRouteGap(threadDetailQuery.data.error?.message)
      ? formatProjectConversationFailure("detail", threadDetailQuery.data.error?.message)
      : null;

  const refreshConversationData = () => {
    threadsQuery.refresh();
    threadDetailQuery.refresh();
    memoryQuery.refresh();
    filesQuery.refresh();
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

  const sendPrompt = async (prompt: string, existingTurnId?: string) => {
    const text = prompt.trim();
    if (text.length === 0 || sendBusy || archived) return;

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
    setDraft("");

    const result = await sendTurn({
      environmentId,
      input: {
        projectId,
        threadId: String(threadId),
        input: { text },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const message = formatProjectConversationFailure("send", squashAtomCommandFailure(result));
        markTurn(turnId, { status: "failed", error: message });
        setDraft(text);
        toastManager.add({
          type: "error",
          title: "Could not send project turn",
          description: message,
        });
      }
      return;
    }
    if (!result.value.ok || !result.value.result) {
      const message = formatProjectConversationFailure(
        "send",
        result.value.error?.message ?? "Jarvis did not return a project conversation turn result.",
      );
      markTurn(turnId, { status: "failed", error: message });
      setDraft(text);
      toastManager.add({
        type: "error",
        title: "Could not send project turn",
        description: message,
      });
      return;
    }

    const reply = projectConversationReplyLabel(result.value.result);
    markTurn(turnId, { status: "completed", response: reply, error: null });
    refreshConversationData();
  };

  const writeArchiveState = async (action: "archive" | "unarchive") => {
    if (conversation === null) {
      return;
    }
    if (
      action === "archive" &&
      !window.confirm(
        "Archive this project conversation? Jarvis will hide it from the default conversation list.",
      )
    ) {
      return;
    }

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
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-medium text-foreground">
                  {conversation?.title ?? "Project conversation"}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {projectName}
                  {defaultRepo ? ` · ${defaultRepo.remote}` : ""}
                  {archived ? " · Archived" : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {archived ? <Badge variant="secondary">Archived</Badge> : null}
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
              <Button
                size="xs"
                variant="outline"
                disabled={conversation === null}
                onClick={() => void writeArchiveState(archived ? "unarchive" : "archive")}
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

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                {conversation !== null && historyMessages.length === 0 && turns.length === 0 ? (
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
                {historyMessages.map((message) => (
                  <ProjectConversationMessageRow key={message.id} message={message} />
                ))}
                {turns.map((turn) => (
                  <ProjectConversationTurnRow
                    key={turn.id}
                    turn={turn}
                    onRetry={() => void sendPrompt(turn.prompt, turn.id)}
                    retryDisabled={sendBusy}
                  />
                ))}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-2">
              <div className="mx-auto w-full max-w-3xl px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-5">
                <div className="pointer-events-auto rounded-t-2xl border border-border/70 bg-background/95 p-2 shadow-lg shadow-black/5 backdrop-blur">
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    placeholder={
                      archived
                        ? "Unarchive this conversation to send a turn"
                        : "Send a project conversation turn"
                    }
                    aria-label="Project conversation message"
                    disabled={conversation === null || sendBusy || archived}
                    className="border-transparent shadow-none before:shadow-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      {archived
                        ? "Archived conversations are read-only"
                        : sendBusy
                          ? "Sending to Jarvis"
                          : "Jarvis project context attached"}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void sendPrompt(draft)}
                      disabled={
                        conversation === null || draft.trim().length === 0 || sendBusy || archived
                      }
                    >
                      {sendBusy ? <Spinner className="size-4" /> : <SendIcon className="size-4" />}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </main>
          <ProjectConversationContextPanel
            project={project}
            files={files}
            memoryQuery={memoryQuery}
          />
        </div>
      </div>
    </div>
  );
}

function ProjectConversationTurnRow({
  turn,
  onRetry,
  retryDisabled,
}: {
  readonly turn: LocalTurn;
  readonly onRetry: () => void;
  readonly retryDisabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {turn.prompt}
      </div>
      <div className="max-w-[85%] rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-sm text-foreground">
        {turn.status === "pending" || turn.status === "streaming" ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            {turn.response || "Waiting for Jarvis"}
          </div>
        ) : null}
        {turn.status === "completed" ? (
          <div className="whitespace-pre-wrap">{turn.response}</div>
        ) : null}
        {turn.status === "failed" ? (
          <div className="space-y-2">
            <div className="text-destructive">{turn.error}</div>
            <Button size="xs" variant="outline" onClick={onRetry} disabled={retryDisabled}>
              <RotateCcwIcon className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProjectConversationMessageRow({
  message,
}: {
  readonly message: ProjectConversationMessageView;
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
      <div className="whitespace-pre-wrap">{message.content}</div>
    </div>
  );
}

function ProjectConversationContextPanel({
  project,
  files,
  memoryQuery,
}: {
  readonly project: JarvisProject | null;
  readonly files: JarvisProjectFile[];
  readonly memoryQuery: EnvironmentQueryView<JarvisProjectMemoryResult>;
}) {
  const defaultRepo = defaultProjectRepo(project);
  const memory = memoryQuery.data?.ok === true ? memoryQuery.data.memory : null;
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

function projectConversationReplyLabel(result: JarvisProjectThreadTurnResult): string {
  return extractProjectConversationReply(result) || "Jarvis completed the turn.";
}
