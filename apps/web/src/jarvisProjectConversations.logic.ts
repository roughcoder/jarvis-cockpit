import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectThreadDetail,
  JarvisProjectThreadMessage,
  JarvisProjectThread,
  JarvisProjectThreadTurnResult,
  JarvisTurnWorkspaceInput,
  ThreadId,
} from "@t3tools/contracts";
import { projectJarvisMessagePresentation } from "@t3tools/client-runtime/conversation";
import type { JarvisThreadTurnMergedItem } from "./jarvisThreadToolEvents.logic";

export type ProjectConversationSendStatus =
  | "idle"
  | "pending"
  | "streaming"
  | "completed"
  | "failed";

export interface ProjectConversationRouteParams {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly threadId: ThreadId;
}

export type ProjectConversationRouteRenderState =
  | { readonly status: "invalid" }
  | { readonly status: "ready"; readonly params: ProjectConversationRouteParams };

export interface ProjectConversationTurnDraft {
  readonly prompt: string;
  readonly response: string;
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
}

export interface ProjectConversationLocalTurnView {
  readonly id: string;
  readonly prompt: string;
  readonly response: string;
  readonly toolItems?: ReadonlyArray<JarvisThreadTurnMergedItem>;
  readonly workspaceInput?: JarvisTurnWorkspaceInput | null;
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface ProjectConversationMessageView {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly technicalContent: string | null;
  readonly observedAt: string;
  readonly peerId: string | null;
  readonly source: "history" | "local";
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
  readonly toolItems: ReadonlyArray<JarvisThreadTurnMergedItem>;
  readonly workspaceProvisionRequested: boolean;
  readonly localTurnId: string | null;
  readonly retryPrompt: string | null;
  readonly retryWorkspace: JarvisTurnWorkspaceInput | null;
  readonly orchestrationLifecycle: OrchestrationLifecycleView | null;
}

export interface OrchestrationLifecycleChildView {
  readonly id: string;
  readonly title: string;
  readonly phase: string;
  readonly status: "waiting" | "running" | "completed" | "failed";
  readonly error: string | null;
}

export interface OrchestrationLifecycleView {
  readonly watchId: string;
  readonly phase: string;
  readonly status: "waiting" | "running" | "completed" | "failed";
  readonly children: ReadonlyArray<OrchestrationLifecycleChildView>;
}

export function projectConversationOrchestrationLifecycles(
  thread: Pick<JarvisProjectThreadDetail, "messages"> | null,
): OrchestrationLifecycleView[] {
  return orchestrationLifecycleMessages(thread?.messages ?? []).flatMap((message) =>
    message.orchestrationLifecycle ? [message.orchestrationLifecycle] : [],
  );
}

export interface ProjectConversationRouteInput {
  readonly environmentId: EnvironmentId | string;
  readonly projectId: string;
  readonly threadId: ThreadId | string;
}

export function buildProjectConversationRouteParams(
  input: ProjectConversationRouteInput,
): ProjectConversationRouteParams {
  return {
    environmentId: input.environmentId as EnvironmentId,
    projectId: input.projectId,
    threadId: input.threadId as ThreadId,
  };
}

export function resolveProjectConversationRouteParams(
  params: Partial<Record<"environmentId" | "projectId" | "threadId", string | undefined>>,
): ProjectConversationRouteParams | null {
  if (!params.environmentId || !params.projectId || !params.threadId) {
    return null;
  }
  return buildProjectConversationRouteParams({
    environmentId: params.environmentId,
    projectId: params.projectId,
    threadId: params.threadId,
  });
}

export function resolveProjectConversationRouteRenderState(input: {
  readonly params: ProjectConversationRouteParams | null;
}): ProjectConversationRouteRenderState {
  if (input.params === null) {
    return { status: "invalid" };
  }
  return { status: "ready", params: input.params };
}

export function sortProjectConversations(
  threads: ReadonlyArray<JarvisProjectThread>,
): JarvisProjectThread[] {
  return [...threads].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function isProjectConversationArchived(
  thread: Pick<JarvisProjectThread, "archived_at"> | null,
): boolean {
  return typeof thread?.archived_at === "string" && thread.archived_at.trim().length > 0;
}

export function archivedProjectConversationSummary(
  thread: Pick<JarvisProjectThread, "archived_at" | "archived_by" | "archive_reason"> | null,
): string | null {
  if (thread === null || !isProjectConversationArchived(thread)) {
    return null;
  }
  const parts = [`Archived ${formatArchivedValue(thread.archived_at)}`];
  const actor = thread.archived_by?.trim();
  if (actor) {
    parts.push(`by ${actor}`);
  }
  const reason = thread.archive_reason?.trim();
  if (reason) {
    parts.push(`- ${reason}`);
  }
  return parts.join(" ");
}

export function latestProjectConversation(
  threads: ReadonlyArray<JarvisProjectThread>,
): JarvisProjectThread | null {
  return sortProjectConversations(threads)[0] ?? null;
}

export function defaultProjectRepo(project: Pick<JarvisProject, "repos"> | null): {
  readonly name: string;
  readonly remote: string;
  readonly default: boolean;
} | null {
  return project?.repos.find((repo) => repo.default) ?? project?.repos[0] ?? null;
}

export function visibleProjectFiles(files: ReadonlyArray<JarvisProjectFile>): JarvisProjectFile[] {
  return files.filter((file) => file.retracted !== true);
}

export function formatJarvisCommandFailure(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return fallback;
}

export function formatProjectConversationFailure(
  action: "create" | "detail" | "send" | "archive" | "unarchive",
  error: unknown,
): string {
  const message = formatJarvisCommandFailure(
    error,
    "The Jarvis project conversation request failed.",
  );
  if (action === "detail" && /projects\.threads\.get.*HTTP (404|405|501)/u.test(message)) {
    return "This Jarvis brain does not expose project conversation history yet. Cockpit will show new turns from this session only.";
  }
  if (action === "archive" || action === "unarchive") {
    if (/projects\.threads\.archive.*HTTP (404|405|501)/u.test(message)) {
      return "This Jarvis brain does not expose project conversation archive yet. Cockpit reached Jarvis, but the conversation archive route is unavailable.";
    }
  }
  if (/HTTP 403/u.test(message)) {
    return `Jarvis denied the project conversation ${action}${formatStatusDetail(message)}`;
  }
  return message;
}

export function isProjectConversationDetailRouteGap(error: unknown): boolean {
  return /projects\.threads\.get.*HTTP (404|405|501)/u.test(formatJarvisCommandFailure(error, ""));
}

export function projectConversationHistoryMessages(
  thread: Pick<JarvisProjectThreadDetail, "messages"> | null,
): ProjectConversationMessageView[] {
  const source = thread?.messages ?? [];
  return source
    .filter(
      (message) =>
        !isRawProjectConversationToolFrame(message) &&
        message.type !== "child_watch" &&
        message.type !== "child_terminal" &&
        legacyLifecycleMessageKind(message) === null &&
        !isRedundantOrchestrationAcknowledgement(message),
    )
    .map((message, index) => historyMessageView(message, index))
    .filter((message) => message.content.trim().length > 0)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

function isRedundantOrchestrationAcknowledgement(message: JarvisProjectThreadMessage): boolean {
  const content = message.content.trim();
  if (content.startsWith("Automatic orchestration continuation:")) return true;
  if (message.role === "user") return false;
  return content.startsWith(
    "Spawned both required child review sessions and registered the watch.",
  );
}

function orchestrationLifecycleMessages(
  messages: ReadonlyArray<JarvisProjectThreadMessage>,
): ProjectConversationMessageView[] {
  const terminals = new Map<string, JarvisProjectThreadMessage>();
  for (const message of messages) {
    if (message.type === "child_terminal" && message.child_chat_id) {
      terminals.set(message.child_chat_id, message);
    }
  }
  const latestWatches = new Map<string, JarvisProjectThreadMessage>();
  for (const message of messages) {
    if (message.type === "child_watch" && message.watch_id) {
      latestWatches.set(message.watch_id, message);
    }
  }
  const structured = [...latestWatches.values()].map((watch) => {
    const watchPhase = watch.phase ?? "waiting";
    const children = (watch.child_chat_ids ?? []).map((id) => {
      const terminal = terminals.get(id);
      const phase = terminal?.phase ?? (watchPhase === "waiting" ? "waiting" : "running");
      const failed = phase === "failed" || terminal?.status === "failed";
      return {
        id,
        title: terminal?.title ?? "Child code agent",
        phase,
        status: failed
          ? ("failed" as const)
          : terminal
            ? ("completed" as const)
            : ("running" as const),
        error: terminal?.error ?? null,
      };
    });
    const status =
      watchPhase === "failed"
        ? ("failed" as const)
        : watchPhase === "completed"
          ? ("completed" as const)
          : watchPhase === "claimed"
            ? ("running" as const)
            : ("waiting" as const);
    return {
      id: `orchestration-${watch.watch_id}`,
      role: "assistant" as const,
      content: "",
      technicalContent: null,
      observedAt: watch.observed_at,
      peerId: watch.peer_id?.trim() || null,
      source: "history" as const,
      status: "completed" as const,
      error: null,
      toolItems: [],
      workspaceProvisionRequested: false,
      localTurnId: null,
      retryPrompt: null,
      retryWorkspace: null,
      orchestrationLifecycle: {
        watchId: watch.watch_id ?? "",
        phase: watchPhase,
        status,
        children,
      },
    };
  });
  return [...structured, ...legacyOrchestrationLifecycleMessages(messages)];
}

function legacyLifecycleMessageKind(
  message: JarvisProjectThreadMessage,
): "watch" | "terminal" | "continuation" | null {
  if (message.role !== "system") return null;
  if (/^Watching \d+ child work session\(s\) for completion\.$/u.test(message.content)) {
    return "watch";
  }
  if (/^Child .+ \((run_[^)]+)\) reached [^:]+(?:: .*)?\.$/u.test(message.content)) {
    return "terminal";
  }
  if (message.content.startsWith("Automatic orchestration continuation:")) {
    return "continuation";
  }
  return null;
}

function legacyOrchestrationLifecycleMessages(
  messages: ReadonlyArray<JarvisProjectThreadMessage>,
): ProjectConversationMessageView[] {
  const lifecycles: ProjectConversationMessageView[] = [];
  messages.forEach((message, index) => {
    if (legacyLifecycleMessageKind(message) !== "watch") return;
    const expected = Number.parseInt(/\d+/u.exec(message.content)?.[0] ?? "0", 10);
    const terminals: OrchestrationLifecycleChildView[] = [];
    for (const candidate of messages.slice(index + 1)) {
      if (legacyLifecycleMessageKind(candidate) === "watch") break;
      const match = /^Child (.+) \((run_[^)]+)\) reached ([^:]+)(?:: (.*))?\.$/u.exec(
        candidate.content,
      );
      if (!match) continue;
      const phase = match[3] ?? "completed";
      terminals.push({
        id: match[2] ?? "",
        title: match[1] ?? "Child code agent",
        phase,
        status: phase === "failed" ? "failed" : "completed",
        error: phase === "failed" ? (match[4] ?? null) : null,
      });
      if (terminals.length >= expected) break;
    }
    const complete = expected > 0 && terminals.length >= expected;
    lifecycles.push({
      id: `legacy-orchestration-${message.observed_at}`,
      role: "assistant",
      content: "",
      technicalContent: null,
      observedAt: message.observed_at,
      peerId: message.peer_id?.trim() || null,
      source: "history",
      status: "completed",
      error: null,
      toolItems: [],
      workspaceProvisionRequested: false,
      localTurnId: null,
      retryPrompt: null,
      retryWorkspace: null,
      orchestrationLifecycle: {
        watchId: "legacy transcript",
        phase: complete ? "completed" : "waiting",
        status: terminals.some((child) => child.status === "failed")
          ? "failed"
          : complete
            ? "completed"
            : "waiting",
        children: terminals,
      },
    });
  });
  return lifecycles;
}

export function isRawProjectConversationToolFrame(message: JarvisProjectThreadMessage): boolean {
  if (message.role === "user") {
    return false;
  }
  return /^tool\.(?:call|result)\b/u.test(message.content.trim());
}

export function projectConversationMergedMessages(input: {
  readonly historyMessages: ReadonlyArray<ProjectConversationMessageView>;
  readonly localTurns: ReadonlyArray<ProjectConversationLocalTurnView>;
}): ProjectConversationMessageView[] {
  const historyMessages = input.historyMessages.filter((message) => message.source === "history");
  const historyMatches = historyMessages.map((message, index) => ({
    index,
    message,
    claimed: false,
  }));
  const localMessages: ProjectConversationMessageView[] = [];
  for (const message of input.localTurns.flatMap(localTurnMessages)) {
    const match = claimHistoryEcho(message, historyMatches);
    if (match === null) {
      localMessages.push(message);
      continue;
    }
    // The history echo replaces the local copy, but history rows carry no tool
    // metadata — graft the local turn's tool items onto the confirming history
    // message so ThreadToolCallRow rendering survives the history refresh.
    if (message.toolItems.length > 0 && match.message.toolItems.length === 0) {
      const grafted: ProjectConversationMessageView = {
        ...match.message,
        toolItems: message.toolItems,
        workspaceProvisionRequested: message.workspaceProvisionRequested,
      };
      historyMessages[match.index] = grafted;
      match.message = grafted;
    }
  }

  return [...historyMessages, ...localMessages].sort(compareProjectConversationMessages);
}

export function extractProjectConversationReply(result: JarvisProjectThreadTurnResult): string {
  const explicit = result.text.trim();
  if (explicit.length > 0) {
    return explicit;
  }
  const fromEvents = result.events.flatMap(extractReplyTextFromEvent).join("");
  return fromEvents.trim();
}

export function reduceProjectConversationSendState(
  state: ProjectConversationTurnDraft,
  event:
    | { readonly type: "pending" }
    | { readonly type: "streaming"; readonly delta: string }
    | { readonly type: "completed"; readonly response: string }
    | { readonly type: "failed"; readonly error: string },
): ProjectConversationTurnDraft {
  switch (event.type) {
    case "pending":
      return { ...state, status: "pending", error: null };
    case "streaming":
      return {
        ...state,
        status: "streaming",
        response: `${state.response}${event.delta}`,
        error: null,
      };
    case "completed":
      return { ...state, status: "completed", response: event.response, error: null };
    case "failed":
      return { ...state, status: "failed", error: event.error };
  }
}

function historyMessageView(
  message: JarvisProjectThreadMessage,
  index: number,
): ProjectConversationMessageView {
  const generatedReviewPrompt = projectJarvisMessagePresentation(message);
  return {
    id: `history-${index}-${message.observed_at}`,
    // Contract role is a tolerant string; render "user" on the user side, everything else
    // (assistant / any future role) on the assistant side.
    role: message.role === "user" ? "user" : "assistant",
    content: generatedReviewPrompt?.summary ?? message.content,
    technicalContent: generatedReviewPrompt?.disclosure?.text ?? null,
    observedAt: message.observed_at,
    peerId: message.peer_id?.trim() || null,
    source: "history",
    status: "completed",
    error: null,
    toolItems: [],
    workspaceProvisionRequested: false,
    localTurnId: null,
    retryPrompt: null,
    retryWorkspace: null,
    orchestrationLifecycle: null,
  };
}

function localTurnMessages(
  turn: ProjectConversationLocalTurnView,
): ProjectConversationMessageView[] {
  const prompt = turn.prompt.trim();
  const messages: ProjectConversationMessageView[] = [];
  if (prompt.length > 0) {
    messages.push({
      id: `local-${turn.id}-user`,
      role: "user",
      content: prompt,
      technicalContent: null,
      observedAt: turn.createdAt,
      peerId: null,
      source: "local",
      status: turn.status,
      error: null,
      toolItems: [],
      workspaceProvisionRequested: false,
      localTurnId: turn.id,
      retryPrompt: null,
      retryWorkspace: null,
      orchestrationLifecycle: null,
    });
  }

  const response = turn.response.trim();
  const hasToolItems = (turn.toolItems?.length ?? 0) > 0;
  if (turn.status === "pending" || turn.status === "streaming") {
    messages.push(localAssistantMessage(turn, response));
  } else if (turn.status === "failed") {
    messages.push(localAssistantMessage(turn, turn.error?.trim() ?? ""));
  } else if (response.length > 0 || hasToolItems) {
    messages.push(localAssistantMessage(turn, response));
  }

  return messages;
}

function localAssistantMessage(
  turn: ProjectConversationLocalTurnView,
  content: string,
): ProjectConversationMessageView {
  return {
    id: `local-${turn.id}-assistant`,
    role: "assistant",
    content,
    technicalContent: null,
    observedAt: turn.createdAt,
    peerId: null,
    source: "local",
    status: turn.status,
    error: turn.error,
    toolItems: turn.toolItems ?? [],
    workspaceProvisionRequested: turn.workspaceInput !== undefined && turn.workspaceInput !== null,
    localTurnId: turn.id,
    retryPrompt: turn.prompt,
    retryWorkspace: turn.workspaceInput ?? null,
    orchestrationLifecycle: null,
  };
}

interface HistoryEchoMatch {
  readonly index: number;
  message: ProjectConversationMessageView;
  claimed: boolean;
}

/**
 * Finds and claims the history message that echoes a local message, so the
 * local copy can be dropped (and, for assistant turns, its tool metadata
 * grafted onto the history row). Returns null when the local message should
 * be kept.
 */
function claimHistoryEcho(
  localMessage: ProjectConversationMessageView,
  historyMatches: Array<HistoryEchoMatch>,
): HistoryEchoMatch | null {
  if (localMessage.source !== "local") {
    return null;
  }
  if (
    localMessage.role === "assistant" &&
    localMessage.status !== "completed" &&
    localMessage.status !== "streaming"
  ) {
    return null;
  }
  if (localMessage.content.trim().length === 0) {
    return null;
  }

  const match = historyMatches.find(
    (candidate) =>
      !candidate.claimed && isHistoryEchoOfLocalMessage(candidate.message, localMessage),
  );
  if (!match) {
    return null;
  }
  match.claimed = true;
  return match;
}

function isHistoryEchoOfLocalMessage(
  historyMessage: ProjectConversationMessageView,
  localMessage: ProjectConversationMessageView,
): boolean {
  if (historyMessage.role !== localMessage.role) {
    return false;
  }
  if (
    normalizeMessageContent(historyMessage.content) !==
    normalizeMessageContent(localMessage.content)
  ) {
    return false;
  }

  const historyTime = Date.parse(historyMessage.observedAt);
  const localTime = Date.parse(localMessage.observedAt);
  if (!Number.isFinite(historyTime) || !Number.isFinite(localTime)) {
    return false;
  }

  const delta = historyTime - localTime;
  return delta >= -30_000 && delta <= 10 * 60_000;
}

function compareProjectConversationMessages(
  left: ProjectConversationMessageView,
  right: ProjectConversationMessageView,
): number {
  const observedOrder = left.observedAt.localeCompare(right.observedAt);
  if (observedOrder !== 0) {
    return observedOrder;
  }
  if (left.localTurnId && right.localTurnId && left.localTurnId === right.localTurnId) {
    return roleSortOrder(left.role) - roleSortOrder(right.role);
  }
  if (left.source !== right.source) {
    return left.source === "history" ? -1 : 1;
  }
  return roleSortOrder(left.role) - roleSortOrder(right.role);
}

function roleSortOrder(role: ProjectConversationMessageView["role"]): number {
  return role === "user" ? 0 : 1;
}

function normalizeMessageContent(content: string): string {
  return content.trim().replace(/\s+/gu, " ");
}

function formatArchivedValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "by Jarvis";
}

function extractReplyTextFromEvent(event: Record<string, unknown>): string[] {
  const eventName = String(event.event ?? event.type ?? "");
  if (
    !/(assistant\.delta|assistant\.message|thread\.reply|response\.delta|response\.message)/u.test(
      eventName,
    )
  ) {
    return [];
  }
  return extractTextValues(event);
}

function extractTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractTextValues);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["text", "delta", "content", "message", "data"]
      .flatMap((key) => extractTextValues(record[key]))
      .filter((text) => text.length > 0);
  }
  return [];
}

function formatStatusDetail(message: string): string {
  const detail = message.match(/HTTP 403:\s*(?<detail>.+)$/u)?.groups?.detail?.trim();
  return detail ? `: ${detail}` : ". Check the Jarvis project permissions for this operator.";
}
