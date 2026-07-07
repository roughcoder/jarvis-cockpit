import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectFile,
  JarvisProjectThreadDetail,
  JarvisProjectThreadMessage,
  JarvisProjectThread,
  JarvisProjectThreadTurnResult,
  ThreadId,
} from "@t3tools/contracts";

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
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
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
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
  readonly createdAt: string;
}

export interface ProjectConversationMessageView {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly observedAt: string;
  readonly peerId: string | null;
  readonly source: "history" | "local";
  readonly status: ProjectConversationSendStatus;
  readonly error: string | null;
  readonly localTurnId: string | null;
  readonly retryPrompt: string | null;
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
  readonly shellError: string | null;
  readonly shellHasSnapshot: boolean;
  readonly shellPending: boolean;
}): ProjectConversationRouteRenderState {
  if (input.params === null) {
    return { status: "invalid" };
  }
  if (input.shellError !== null) {
    return { status: "error", message: input.shellError };
  }
  if (input.shellPending && !input.shellHasSnapshot) {
    return { status: "loading" };
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
  return (thread?.messages ?? [])
    .map((message, index) => historyMessageView(message, index))
    .filter((message) => message.content.trim().length > 0)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
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
  const localMessages = input.localTurns
    .flatMap(localTurnMessages)
    .filter((message) => !isConfirmedByHistory(message, historyMatches));

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
  return {
    id: `history-${index}-${message.observed_at}`,
    role: message.role,
    content: message.content,
    observedAt: message.observed_at,
    peerId: message.peer_id?.trim() || null,
    source: "history",
    status: "completed",
    error: null,
    localTurnId: null,
    retryPrompt: null,
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
      observedAt: turn.createdAt,
      peerId: null,
      source: "local",
      status: turn.status,
      error: null,
      localTurnId: turn.id,
      retryPrompt: null,
    });
  }

  const response = turn.response.trim();
  if (turn.status === "pending" || turn.status === "streaming") {
    messages.push(localAssistantMessage(turn, response));
  } else if (turn.status === "failed") {
    messages.push(localAssistantMessage(turn, turn.error?.trim() ?? ""));
  } else if (response.length > 0) {
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
    observedAt: turn.createdAt,
    peerId: null,
    source: "local",
    status: turn.status,
    error: turn.error,
    localTurnId: turn.id,
    retryPrompt: turn.prompt,
  };
}

function isConfirmedByHistory(
  localMessage: ProjectConversationMessageView,
  historyMatches: Array<{
    readonly index: number;
    readonly message: ProjectConversationMessageView;
    claimed: boolean;
  }>,
): boolean {
  if (localMessage.source !== "local") {
    return false;
  }
  if (
    localMessage.role === "assistant" &&
    localMessage.status !== "completed" &&
    localMessage.status !== "streaming"
  ) {
    return false;
  }
  if (localMessage.content.trim().length === 0) {
    return false;
  }

  const match = historyMatches.find(
    (candidate) =>
      !candidate.claimed && isHistoryEchoOfLocalMessage(candidate.message, localMessage),
  );
  if (!match) {
    return false;
  }
  match.claimed = true;
  return true;
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
