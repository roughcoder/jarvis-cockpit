import * as NodeBuffer from "node:buffer";

import {
  JarvisApprovalInput,
  JarvisArchiveInput,
  JarvisArtifact,
  JarvisCockpitCatalog,
  JarvisCapabilitiesResult,
  JarvisCloseSessionInput,
  JarvisConversationWorkspace,
  JarvisControlResult,
  DEFAULT_JARVIS_API_BASE_URL,
  type JsonObject as JsonObjectType,
  type JarvisBrainCheckResult,
  type JarvisBrainConnection,
  type JarvisConnectionSource,
  type JarvisRouteCapability,
  JarvisProject,
  JarvisProjectArchiveInput,
  JarvisProjectCreateInput,
  JarvisProjectCreateThreadInput,
  JarvisProjectDetailResponse,
  JarvisProjectFile,
  JarvisProjectFileRetractInput,
  JarvisProjectFilesResponse,
  JarvisProjectFileUploadInput,
  JarvisProjectId,
  JarvisProjectListResponse,
  JarvisProjectMemoryCorrectInput,
  JarvisProjectMemoryCurationInput,
  JarvisProjectMemoryForgetInput,
  JarvisProjectMemoryResponse,
  JarvisProjectThread,
  JarvisProjectThreadArchiveInput,
  JarvisProjectThreadDetail,
  JarvisProjectThreadDetailResponse,
  JarvisProjectThreadId,
  JarvisProjectThreadsResponse,
  JarvisProjectThreadTurnInput,
  JarvisProjectThreadTurnResult,
  JarvisProjectUpdateInput,
  JarvisDeleteInput,
  JarvisLifecycleResult,
  JarvisMcpStatus,
  JarvisRequestId,
  JarvisRestoreCheckpointInput,
  JarvisRun,
  JarvisRunId,
  JarvisRunsSnapshot,
  JarvisSessionCheckpointsPage,
  JarvisSessionCheckpointsResponse,
  JarvisSessionDetailResponse,
  JarvisSessionEvent,
  JarvisSessionEventsPage,
  JarvisSessionRequestsResponse,
  JarvisSessionRef,
  JarvisSessionRequestsPage,
  JarvisStartWorkInput,
  JarvisStartWorkValidationResult,
  JarvisTurnInput,
  JarvisUserInputInput,
  JarvisWorkerSession,
  JarvisWorkerSessionId,
  JarvisWorkerWorktreePruneResponse,
  type ServerSettings,
  type ServerSettingsError,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../config.ts";
import {
  JARVIS_CAPABILITY_ROUTE_DEFINITIONS,
  makeProbedJarvisCapability,
  makeUnprobedJarvisCapability,
} from "./JarvisCapabilities.ts";
import { isJarvisOAuthConfigured } from "./JarvisOAuth.ts";

export class JarvisClientError extends Error {
  readonly _tag = "JarvisClientError";
  readonly operation: string;
  readonly status: number | null;
  readonly responseBody: string | null;

  constructor(input: {
    readonly operation: string;
    readonly message: string;
    readonly status?: number | null;
    readonly responseBody?: string | null;
    readonly cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.operation = input.operation;
    this.status = input.status ?? null;
    this.responseBody = input.responseBody ?? null;
  }
}

export class JarvisMissingContractError extends Error {
  readonly _tag = "JarvisMissingContractError";
  readonly operation: string;
  readonly missing: string;

  constructor(input: { readonly operation: string; readonly missing: string }) {
    super(`Jarvis contract is missing for ${input.operation}: ${input.missing}`);
    this.operation = input.operation;
    this.missing = input.missing;
  }
}

export interface JarvisClient {
  readonly getCatalog: () => Effect.Effect<JarvisCockpitCatalog, JarvisClientError>;
  readonly getCapabilities: () => Effect.Effect<JarvisCapabilitiesResult, JarvisClientError>;
  readonly getMcpStatus: () => Effect.Effect<JarvisMcpStatus, JarvisClientError>;
  readonly getSnapshot: () => Effect.Effect<JarvisRunsSnapshot, JarvisClientError>;
  readonly getProjects: (options?: {
    readonly includeArchived?: boolean;
  }) => Effect.Effect<ReadonlyArray<JarvisProject>, JarvisClientError>;
  readonly getProject: (projectId: string) => Effect.Effect<JarvisProject, JarvisClientError>;
  readonly getProjectMemory: (
    projectId: string,
  ) => Effect.Effect<JarvisProjectMemoryResponse, JarvisClientError>;
  readonly getProjectFiles: (
    projectId: string,
    options?: { readonly includeRetracted?: boolean },
  ) => Effect.Effect<ReadonlyArray<JarvisProjectFile>, JarvisClientError>;
  readonly getProjectThreads: (
    projectId: string,
    options?: { readonly includeArchived?: boolean },
  ) => Effect.Effect<ReadonlyArray<JarvisProjectThread>, JarvisClientError>;
  readonly getProjectThread: (
    projectId: string,
    threadId: string,
  ) => Effect.Effect<JarvisProjectThreadDetail, JarvisClientError>;
  readonly createProject: (
    input: JarvisProjectCreateInput,
  ) => Effect.Effect<JarvisProject, JarvisClientError>;
  readonly updateProject: (
    projectId: string,
    input: JarvisProjectUpdateInput,
  ) => Effect.Effect<JarvisProject, JarvisClientError>;
  readonly archiveProject: (
    projectId: string,
    input?: JarvisProjectArchiveInput,
  ) => Effect.Effect<JarvisProject, JarvisClientError>;
  readonly deleteProject: (projectId: string) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly recordProjectFinding: (
    projectId: string,
    input: JarvisProjectMemoryCurationInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly recordProjectDecision: (
    projectId: string,
    input: JarvisProjectMemoryCurationInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly forgetProjectMemory: (
    projectId: string,
    input: JarvisProjectMemoryForgetInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly correctProjectMemory: (
    projectId: string,
    input: JarvisProjectMemoryCorrectInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly uploadProjectFile: (
    projectId: string,
    input: JarvisProjectFileUploadInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly retractProjectFile: (
    projectId: string,
    docId: string,
    input?: JarvisProjectFileRetractInput,
  ) => Effect.Effect<JsonObjectType, JarvisClientError>;
  readonly createProjectThread: (
    projectId: string,
    input?: JarvisProjectCreateThreadInput,
  ) => Effect.Effect<JarvisProjectThread, JarvisClientError>;
  readonly archiveProjectThread: (
    projectId: string,
    threadId: string,
    input?: JarvisProjectThreadArchiveInput,
  ) => Effect.Effect<JarvisProjectThread, JarvisClientError>;
  readonly renameProjectThread: (
    projectId: string,
    threadId: string,
    input: JarvisProjectThreadRenameInput,
  ) => Effect.Effect<JarvisProjectThread, JarvisClientError>;
  readonly unarchiveProjectThread: (
    projectId: string,
    threadId: string,
  ) => Effect.Effect<JarvisProjectThread, JarvisClientError>;
  readonly sendProjectThreadTurn: (
    projectId: string,
    threadId: string,
    input: JarvisProjectThreadTurnInput,
  ) => Effect.Effect<JarvisProjectThreadTurnResult, JarvisClientError>;
  readonly getSession: (
    sessionRef: string,
  ) => Effect.Effect<JarvisWorkerSession, JarvisClientError>;
  readonly getSessionEvents: (
    sessionRef: string,
    options?: { readonly after?: string; readonly limit?: number },
  ) => Effect.Effect<JarvisSessionEventsPage, JarvisClientError>;
  readonly getRequests: (
    sessionRef: string,
    options?: { readonly after?: string; readonly limit?: number },
  ) => Effect.Effect<JarvisSessionRequestsPage, JarvisClientError>;
  readonly getCheckpoints: (
    sessionRef: string,
    options?: { readonly after?: string; readonly limit?: number },
  ) => Effect.Effect<JarvisSessionCheckpointsPage, JarvisClientError>;
  readonly startWork: (
    input: JarvisStartWorkInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError | JarvisMissingContractError>;
  readonly validateWork: (
    input: JarvisStartWorkInput,
  ) => Effect.Effect<JarvisStartWorkValidationResult, JarvisClientError>;
  readonly pruneWorkerWorktrees: (
    workerId: string,
  ) => Effect.Effect<JarvisWorkerWorktreePruneResponse, JarvisClientError>;
  readonly sendTurn: (
    sessionRef: string,
    input: JarvisTurnInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly respondApproval: (
    sessionRef: string,
    input: JarvisApprovalInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly respondInput: (
    sessionRef: string,
    input: JarvisUserInputInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly interruptSession: (
    sessionRef: string,
    turnId?: string,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly stopSession: (
    sessionRef: string,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly archiveSession: (
    sessionRef: string,
    input?: JarvisArchiveInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly archiveRun: (
    runId: string,
    input?: JarvisArchiveInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly deleteSession: (
    sessionRef: string,
    input?: JarvisDeleteInput,
  ) => Effect.Effect<JarvisLifecycleResult, JarvisClientError>;
  readonly deleteRun: (
    runId: string,
    input?: JarvisDeleteInput,
  ) => Effect.Effect<JarvisLifecycleResult, JarvisClientError>;
  readonly closeSession: (
    sessionRef: string,
    input?: JarvisCloseSessionInput,
  ) => Effect.Effect<JarvisLifecycleResult, JarvisClientError>;
  readonly restoreCheckpoint: (
    sessionRef: string,
    input: JarvisRestoreCheckpointInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly resumeRun: (
    runId: string,
    input?: Record<string, unknown>,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError | JarvisMissingContractError>;
}

export class JarvisClientService extends Context.Service<JarvisClientService, JarvisClient>()(
  "t3/jarvis/JarvisClient/JarvisClientService",
) {}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface JarvisProjectThreadRenameInput {
  readonly title: string;
  readonly idempotency_key: string;
  readonly metadata?: Record<string, unknown>;
}

type JarvisConnectionConfig = Pick<
  ServerConfig["Service"],
  "jarvisCockpitEnabled" | "jarvisApiBaseUrl" | "jarvisApiToken" | "jarvisFixtureMode"
> &
  Partial<Pick<ServerConfig["Service"], "jarvisFixtureEmptyProjects">> &
  Partial<
    Pick<
      ServerConfig["Service"],
      | "jarvisOAuthIssuer"
      | "jarvisOAuthAudience"
      | "jarvisOAuthScopes"
      | "jarvisOAuthUserEmail"
      | "jarvisOAuthJarvisUser"
    >
  >;

type JarvisAccessTokenProvider = (
  operation: string,
) => Effect.Effect<string | undefined, JarvisClientError>;

interface ResolvedJarvisAuth {
  readonly token?: string | undefined;
  readonly recoveryToken?: string | undefined;
}

// Jarvis is the source of truth for this boundary. Keep endpoint semantics aligned with:
// - https://github.com/roughcoder/jarvis/blob/main/docs/COCKPIT_API.md
// - https://github.com/roughcoder/jarvis/blob/main/docs/FLEET.md
export function resolveJarvisBrainConnection(
  config: JarvisConnectionConfig,
  settings: ServerSettings,
): JarvisBrainConnection {
  const savedApiBaseUrl = settings.jarvis.apiBaseUrl.trim();
  const envApiBaseUrl = config.jarvisApiBaseUrl?.toString();
  const apiBaseUrl = envApiBaseUrl ?? savedApiBaseUrl ?? DEFAULT_JARVIS_API_BASE_URL;
  const apiBaseUrlSource: JarvisConnectionSource =
    envApiBaseUrl !== undefined
      ? "environment"
      : savedApiBaseUrl.length > 0 && savedApiBaseUrl !== DEFAULT_JARVIS_API_BASE_URL
        ? "settings"
        : "default";
  const savedApiToken = settings.jarvis.apiToken.trim();
  const apiTokenSource: JarvisConnectionSource | undefined =
    config.jarvisApiToken !== undefined
      ? "environment"
      : savedApiToken.length > 0 || settings.jarvis.apiTokenRedacted
        ? "settings"
        : undefined;
  const oauthTokenConfigured =
    isJarvisOAuthConfigured(config) && canUseJarvisOAuthForUrl(config, apiBaseUrl);

  return {
    enabled: config.jarvisCockpitEnabled,
    fixtureMode: config.jarvisFixtureMode,
    apiBaseUrl,
    apiBaseUrlSource,
    apiTokenConfigured:
      config.jarvisApiToken !== undefined ||
      savedApiToken.length > 0 ||
      Boolean(settings.jarvis.apiTokenRedacted),
    ...(apiTokenSource !== undefined ? { apiTokenSource } : {}),
    oauthTokenConfigured,
    ...(oauthTokenConfigured ? { oauthTokenSource: "environment" as const } : {}),
  };
}

function makeJarvisClientFromConnection(input: {
  readonly config: JarvisConnectionConfig;
  readonly settings: ServerSettings;
  readonly oauthAccessToken?: JarvisAccessTokenProvider;
}): JarvisClient {
  if (input.config.jarvisFixtureMode) {
    return makeSharedJarvisFixtureClient(
      input.config.jarvisFixtureEmptyProjects === true ? { emptyProjects: true } : undefined,
    );
  }
  if (!input.config.jarvisCockpitEnabled) {
    return makeMissingConfigurationClient("Jarvis cockpit mode is disabled.");
  }
  const connection = resolveJarvisBrainConnection(input.config, input.settings);
  const baseUrl = new URL(connection.apiBaseUrl);
  const token = input.config.jarvisApiToken ?? input.settings.jarvis.apiToken.trim();
  const oauthAccessToken = canUseJarvisOAuthForUrl(input.config, connection.apiBaseUrl)
    ? input.oauthAccessToken
    : undefined;
  return makeJarvisCockpitClient({
    baseUrl,
    ...(token.length > 0 ? { token } : {}),
    ...(oauthAccessToken !== undefined ? { tokenProvider: oauthAccessToken } : {}),
  });
}

const decodeCatalog = Schema.decodeUnknownEffect(JarvisCockpitCatalog);
const decodeMcpStatus = Schema.decodeUnknownEffect(JarvisMcpStatus);
const decodeSnapshot = Schema.decodeUnknownEffect(JarvisRunsSnapshot);
const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeLifecycleResult = Schema.decodeUnknownEffect(JarvisLifecycleResult);
const decodeStartWorkValidationResult = Schema.decodeUnknownEffect(JarvisStartWorkValidationResult);
const decodeProjectListResponse = Schema.decodeUnknownEffect(JarvisProjectListResponse);
const decodeProjectDetailResponse = Schema.decodeUnknownEffect(JarvisProjectDetailResponse);
const decodeProjectMemoryResponse = Schema.decodeUnknownEffect(JarvisProjectMemoryResponse);
const decodeProjectFilesResponse = Schema.decodeUnknownEffect(JarvisProjectFilesResponse);
const decodeProjectThreadsResponse = Schema.decodeUnknownEffect(JarvisProjectThreadsResponse);
const decodeProjectThreadDetailResponse = Schema.decodeUnknownEffect(
  JarvisProjectThreadDetailResponse,
);
const decodeProjectThread = Schema.decodeUnknownEffect(JarvisProjectThread);
const decodeProjectThreadTurnResult = Schema.decodeUnknownEffect(JarvisProjectThreadTurnResult);
const decodeProjectThreadResponse = (operation: string, body: unknown) =>
  Effect.gen(function* () {
    const candidate = projectThreadPayloadFromResponse(operation, body);
    if (candidate instanceof JarvisClientError) {
      return yield* Effect.fail(candidate);
    }
    return yield* decodeFor(operation, decodeProjectThread)(candidate);
  });
const decodeJsonObject = Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json));
const decodeSessionDetail = Schema.decodeUnknownEffect(JarvisSessionDetailResponse);
const decodeSessionEventsPage = Schema.decodeUnknownEffect(JarvisSessionEventsPage);
const decodeSessionRequestsPage = Schema.decodeUnknownEffect(JarvisSessionRequestsPage);
const decodeSessionRequestsResponse = Schema.decodeUnknownEffect(JarvisSessionRequestsResponse);
const decodeSessionCheckpointsPage = Schema.decodeUnknownEffect(JarvisSessionCheckpointsPage);
const decodeSessionCheckpointsResponse = Schema.decodeUnknownEffect(
  JarvisSessionCheckpointsResponse,
);
const decodeWorkerWorktreePruneResponse = Schema.decodeUnknownEffect(
  JarvisWorkerWorktreePruneResponse,
);

const mapDecodeError = (operation: string) => (cause: unknown) =>
  new JarvisClientError({
    operation,
    message: `Jarvis response for ${operation} did not match the expected contract.`,
    cause,
  });

const decodeSessionCandidate = Schema.decodeUnknownEffect(JarvisWorkerSession);

/**
 * One malformed session row must not poison the whole snapshot (fleet view,
 * worker cards, and thread polling all depend on it). When the full decode
 * fails, retry with only the individually-valid session rows and log what was
 * dropped; fail with the original error if that still does not decode.
 */
export const snapshotWithValidSessions = (candidate: unknown) =>
  Effect.gen(function* () {
    if (typeof candidate !== "object" || candidate === null) {
      return null;
    }
    const record = candidate as { readonly sessions?: unknown };
    if (!Array.isArray(record.sessions)) {
      return null;
    }
    const kept: unknown[] = [];
    for (const item of record.sessions) {
      const decoded = yield* decodeSessionCandidate(item).pipe(Effect.option);
      if (Option.isSome(decoded)) {
        kept.push(item);
      }
    }
    if (kept.length === record.sessions.length) {
      return null;
    }
    return {
      candidate: { ...record, sessions: kept },
      dropped: record.sessions.length - kept.length,
    };
  });

const decodeSnapshotDroppingMalformedSessions =
  (decode: (input: unknown) => Effect.Effect<JarvisRunsSnapshot, JarvisClientError>) =>
  (candidate: unknown) =>
    decode(candidate).pipe(
      Effect.catch((error: JarvisClientError) =>
        snapshotWithValidSessions(candidate).pipe(
          Effect.flatMap((sanitized) =>
            sanitized === null
              ? Effect.fail(error)
              : decode(sanitized.candidate).pipe(
                  Effect.tap(() =>
                    Effect.logWarning(
                      `Dropped ${sanitized.dropped} malformed session row(s) from Jarvis cockpit snapshot`,
                    ),
                  ),
                  Effect.mapError(() => error),
                ),
          ),
        ),
      ),
    );

const decodeFor =
  <A>(operation: string, decoder: (input: unknown) => Effect.Effect<A, Schema.SchemaError>) =>
  (input: unknown): Effect.Effect<A, JarvisClientError> =>
    decoder(input).pipe(Effect.mapError(mapDecodeError(operation)));

const withSurfaceMetadata = <Input extends object>(
  input: Input,
): Input & { readonly metadata: Record<string, unknown> } => {
  const metadata = "metadata" in input && isRecord(input.metadata) ? input.metadata : {};
  return {
    ...input,
    metadata: {
      ...metadata,
      surface: "jarvis-cockpit",
    },
  };
};

const withoutWriteMetadata = <Input extends object>(input: Input): Omit<Input, "metadata"> => {
  const { metadata: _metadata, ...payload } = input as Input & { readonly metadata?: unknown };
  return payload;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstStringId(body: unknown, collectionKey: string, idKey: string): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const collection = body[collectionKey];
  if (!Array.isArray(collection)) {
    return null;
  }
  for (const item of collection) {
    if (!isRecord(item)) {
      continue;
    }
    const id = item[idKey];
    if (typeof id === "string" && id.trim().length > 0) {
      return id;
    }
  }
  return null;
}

function projectThreadPayloadFromResponse(
  operation: string,
  body: unknown,
): unknown | JarvisClientError {
  if (!isRecord(body)) {
    return body;
  }
  if ("thread" in body) {
    return body.thread;
  }
  if ("threads" in body) {
    const threads = body.threads;
    if (Array.isArray(threads) && threads.length > 0) {
      return threads[0];
    }
    return new JarvisClientError({
      operation,
      message: "Jarvis returned no project thread.",
    });
  }
  return body;
}

function projectThreadKey(projectId: string, threadId: string): string {
  return `${projectId}/${threadId}`;
}

function findProjectThread(
  threadsByProject: ReadonlyMap<string, ReadonlyArray<JarvisProjectThread>>,
  projectId: string,
  threadId: string,
): JarvisProjectThread | undefined {
  return threadsByProject.get(projectId)?.find((candidate) => candidate.thread_id === threadId);
}

function isProjectThreadArchived(thread: Pick<JarvisProjectThread, "archived_at">): boolean {
  return typeof thread.archived_at === "string" && thread.archived_at.trim().length > 0;
}

function fixtureConversationWorkspace(
  input: JarvisProjectThreadTurnInput["workspace"],
): JarvisConversationWorkspace | undefined {
  if (input === undefined) {
    return undefined;
  }
  const engine = input.engine ?? "codex";
  return {
    worker_id: "fixture-worker",
    session_id: `conv_fixture_${engine}`,
    engine,
    workspace_id: `jarvis-fixture-${engine}`,
    root_label: `jarvis-fixture-${engine}`,
    cwd_label: input.repos?.[0]?.name ?? `jarvis-fixture-${engine}`,
    status: "ready",
    provision_phase: "running",
    worktrees: (input.repos ?? []).map((repo) => ({
      name: repo.name,
      repo: repo.name,
      path_label: repo.name,
      branch: `jarvis/fixture-${repo.name}`,
      base_ref: repo.base_ref,
      status: "ready",
      provision_phase: "running",
    })),
  };
}

function resolveRequestAuth(
  input: {
    readonly token?: string;
    readonly tokenProvider?: JarvisAccessTokenProvider;
  },
  operation: string,
): Effect.Effect<ResolvedJarvisAuth, JarvisClientError> {
  if (input.tokenProvider === undefined) {
    return Effect.succeed({ token: input.token });
  }
  return input.tokenProvider(operation).pipe(
    Effect.catch((error) => (input.token ? Effect.succeed(input.token) : Effect.fail(error))),
    Effect.map((token) =>
      token !== undefined && token !== input.token
        ? { token, recoveryToken: input.token }
        : { token: token ?? input.token },
    ),
  );
}

function isAuthRejectedStatus(status: number): boolean {
  return status === 401;
}

function isSameOrigin(candidate: string, configured: string): boolean {
  try {
    return new URL(candidate).origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function canUseJarvisOAuthForUrl(
  config: Pick<JarvisConnectionConfig, "jarvisApiBaseUrl">,
  apiBaseUrl: string,
): boolean {
  const trustedBaseUrl = config.jarvisApiBaseUrl?.toString() ?? DEFAULT_JARVIS_API_BASE_URL;
  return isSameOrigin(apiBaseUrl, trustedBaseUrl);
}

export function makeJarvisCockpitClient(input: {
  readonly baseUrl: URL;
  readonly token?: string;
  readonly tokenProvider?: JarvisAccessTokenProvider;
  readonly fetch?: FetchLike;
}): JarvisClient {
  const fetchImpl = input.fetch ?? fetch;
  const requestJson = (operation: string, path: string, init?: RequestInit) =>
    resolveRequestAuth(input, operation).pipe(
      Effect.flatMap((auth) =>
        Effect.tryPromise({
          try: async () => {
            const requestUrl = new URL(path, input.baseUrl);
            const send = async (token: string | undefined) => {
              const response = await fetchImpl(requestUrl, {
                ...init,
                headers: {
                  accept: "application/json",
                  ...(init?.body != null && !isFormDataBody(init.body)
                    ? { "content-type": "application/json" }
                    : {}),
                  ...(token ? { authorization: `Bearer ${token}` } : {}),
                  ...init?.headers,
                },
              });
              const text = await response.text();
              return { response, text };
            };
            const first = await send(auth.token);
            const result =
              !first.response.ok &&
              isAuthRejectedStatus(first.response.status) &&
              auth.recoveryToken !== undefined
                ? await send(auth.recoveryToken)
                : first;
            if (!result.response.ok) {
              const responseBody = truncateResponseBody(result.text);
              throw new JarvisClientError({
                operation,
                status: result.response.status,
                responseBody,
                message: summarizeHttpError(operation, result.response.status, responseBody),
              });
            }
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            const body = result.text.trim().length > 0 ? JSON.parse(result.text) : {};
            return body as unknown;
          },
          catch: (cause) =>
            cause instanceof JarvisClientError
              ? cause
              : new JarvisClientError({
                  operation,
                  message: `Jarvis request ${operation} failed before a valid response was decoded.`,
                  cause,
                }),
        }),
      ),
    );

  const requestCapabilityProbe = (operation: string, path: string) =>
    resolveRequestAuth(input, operation).pipe(
      Effect.flatMap((auth) =>
        Effect.tryPromise({
          try: async () => {
            const requestUrl = new URL(path, input.baseUrl);
            const send = async (token: string | undefined) => {
              const response = await fetchImpl(requestUrl, {
                method: "GET",
                headers: {
                  accept: "application/json",
                  ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
              });
              const text = await response.text();
              return { response, text };
            };
            const first = await send(auth.token);
            const result =
              !first.response.ok &&
              isAuthRejectedStatus(first.response.status) &&
              auth.recoveryToken !== undefined
                ? await send(auth.recoveryToken)
                : first;
            let body: unknown = undefined;
            if (result.text.trim().length > 0) {
              try {
                // @effect-diagnostics-next-line preferSchemaOverJson:off
                body = JSON.parse(result.text);
              } catch {
                body = undefined;
              }
            }
            return { statusCode: result.response.status, body };
          },
          catch: (cause) =>
            new JarvisClientError({
              operation,
              message: `Jarvis capability probe ${operation} failed before a response was read.`,
              cause,
            }),
        }),
      ),
    );

  const postJson = (operation: string, path: string, payload: unknown) =>
    requestJson(operation, path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

  const requestText = (operation: string, path: string, init?: RequestInit) =>
    resolveRequestAuth(input, operation).pipe(
      Effect.flatMap((auth) =>
        Effect.tryPromise({
          try: async () => {
            const requestUrl = new URL(path, input.baseUrl);
            const send = async (token: string | undefined) => {
              const response = await fetchImpl(requestUrl, {
                ...init,
                headers: {
                  accept: "text/event-stream, text/plain, application/json",
                  ...(init?.body != null && !isFormDataBody(init.body)
                    ? { "content-type": "application/json" }
                    : {}),
                  ...(token ? { authorization: `Bearer ${token}` } : {}),
                  ...init?.headers,
                },
              });
              const text = await response.text();
              return { response, text };
            };
            const first = await send(auth.token);
            const result =
              !first.response.ok &&
              isAuthRejectedStatus(first.response.status) &&
              auth.recoveryToken !== undefined
                ? await send(auth.recoveryToken)
                : first;
            if (!result.response.ok) {
              const responseBody = truncateResponseBody(result.text);
              throw new JarvisClientError({
                operation,
                status: result.response.status,
                responseBody,
                message: summarizeHttpError(operation, result.response.status, responseBody),
              });
            }
            return result.text;
          },
          catch: (cause) =>
            cause instanceof JarvisClientError
              ? cause
              : new JarvisClientError({
                  operation,
                  message: `Jarvis request ${operation} failed before a valid response was read.`,
                  cause,
                }),
        }),
      ),
    );

  return {
    getCatalog: () =>
      requestJson("cockpit.catalog", "/v1/cockpit/catalog").pipe(
        Effect.flatMap(decodeFor("cockpit.catalog", decodeCatalog)),
      ),
    getCapabilities: () =>
      Effect.gen(function* () {
        const checkedAt = DateTime.formatIso(DateTime.nowUnsafe());
        const catalogResult = yield* requestJson("cockpit.catalog", "/v1/cockpit/catalog").pipe(
          Effect.flatMap(decodeFor("cockpit.catalog", decodeCatalog)),
          Effect.result,
        );
        let projectId: string | null = null;
        let threadId: string | null = null;
        const routes: JarvisRouteCapability[] = [];

        for (const route of JARVIS_CAPABILITY_ROUTE_DEFINITIONS) {
          if (!route.safeToProbe) {
            routes.push(makeUnprobedJarvisCapability(route, "Write route was not probed."));
            continue;
          }
          if (route.requires === "project" && projectId === null) {
            routes.push(
              makeUnprobedJarvisCapability(route, "No project id was available for a safe probe."),
            );
            continue;
          }
          if (route.requires === "thread" && (projectId === null || threadId === null)) {
            routes.push(
              makeUnprobedJarvisCapability(
                route,
                "No project conversation id was available for a safe probe.",
              ),
            );
            continue;
          }

          const path = route.path
            .replace("{id}", encodeURIComponent(projectId ?? ""))
            .replace("{tid}", encodeURIComponent(threadId ?? ""));
          const probe = yield* requestCapabilityProbe(`capabilities.${route.id}`, path).pipe(
            Effect.result,
          );
          if (Result.isFailure(probe)) {
            routes.push(makeUnprobedJarvisCapability(route, probe.failure.message));
            continue;
          }

          routes.push(
            makeProbedJarvisCapability({
              route,
              path,
              statusCode: probe.success.statusCode,
              probedAt: checkedAt,
            }),
          );

          if (
            route.id === "projects.list" &&
            probe.success.statusCode >= 200 &&
            probe.success.statusCode < 300
          ) {
            projectId = firstStringId(probe.success.body, "projects", "id");
          }
          if (
            route.id === "projects.threads.list" &&
            probe.success.statusCode >= 200 &&
            probe.success.statusCode < 300
          ) {
            threadId = firstStringId(probe.success.body, "threads", "thread_id");
          }
        }

        return {
          ok: true,
          checked_at: checkedAt,
          routes,
          ...(Result.isSuccess(catalogResult) ? { catalog: catalogResult.success } : {}),
        };
      }),
    getMcpStatus: () =>
      requestJson("mcp.status", "/v1/mcp/status").pipe(
        Effect.flatMap(decodeFor("mcp.status", decodeMcpStatus)),
      ),
    getSnapshot: () =>
      requestJson("cockpit.snapshot", "/v1/cockpit/snapshot?sync=probe").pipe(
        Effect.flatMap(
          decodeSnapshotDroppingMalformedSessions(decodeFor("cockpit.snapshot", decodeSnapshot)),
        ),
      ),
    getProjects: (options) =>
      requestJson(
        "projects.list",
        appendQuery("/v1/projects", {
          include_archived: options?.includeArchived ? "true" : undefined,
        }),
      ).pipe(
        Effect.flatMap(decodeFor("projects.list", decodeProjectListResponse)),
        Effect.map((response) => response.projects),
      ),
    getProject: (projectId) =>
      requestJson("projects.get", `/v1/projects/${encodeURIComponent(projectId)}`).pipe(
        Effect.flatMap(decodeFor("projects.get", decodeProjectDetailResponse)),
        Effect.map((response) => response.project),
      ),
    getProjectMemory: (projectId) =>
      requestJson("projects.memory", `/v1/projects/${encodeURIComponent(projectId)}/memory`).pipe(
        Effect.flatMap(decodeFor("projects.memory", decodeProjectMemoryResponse)),
      ),
    getProjectFiles: (projectId, options) =>
      requestJson(
        "projects.files",
        appendQuery(`/v1/projects/${encodeURIComponent(projectId)}/files`, {
          include_retracted: options?.includeRetracted ? "true" : undefined,
        }),
      ).pipe(
        Effect.flatMap(decodeFor("projects.files", decodeProjectFilesResponse)),
        Effect.map((response) => response.files),
      ),
    getProjectThreads: (projectId, options) =>
      requestJson(
        "projects.threads",
        appendQuery(`/v1/projects/${encodeURIComponent(projectId)}/threads`, {
          include_archived: options?.includeArchived ? "true" : undefined,
        }),
      ).pipe(
        Effect.flatMap(decodeFor("projects.threads", decodeProjectThreadsResponse)),
        Effect.map((response) => response.threads),
      ),
    getProjectThread: (projectId, threadId) =>
      requestJson(
        "projects.threads.get",
        `/v1/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}`,
      ).pipe(
        Effect.flatMap(decodeFor("projects.threads.get", decodeProjectThreadDetailResponse)),
        Effect.map((response) => response.thread),
      ),
    createProject: (projectInput) =>
      postJson("projects.create", "/v1/projects", withoutWriteMetadata(projectInput)).pipe(
        Effect.flatMap(decodeFor("projects.create", decodeProjectDetailResponse)),
        Effect.map((response) => response.project),
      ),
    updateProject: (projectId, projectInput) =>
      requestJson("projects.update", `/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        body: JSON.stringify(withoutWriteMetadata(projectInput)),
      }).pipe(
        Effect.flatMap(decodeFor("projects.update", decodeProjectDetailResponse)),
        Effect.map((response) => response.project),
      ),
    archiveProject: (projectId, archiveInput = {}) =>
      postJson(
        "projects.archive",
        `/v1/projects/${encodeURIComponent(projectId)}/archive`,
        withoutWriteMetadata(archiveInput),
      ).pipe(
        Effect.flatMap(decodeFor("projects.archive", decodeProjectDetailResponse)),
        Effect.map((response) => response.project),
      ),
    deleteProject: (projectId) =>
      requestJson("projects.delete", `/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      }).pipe(Effect.flatMap(decodeFor("projects.delete", decodeJsonObject))),
    recordProjectFinding: (projectId, input) =>
      postJson(
        "projects.findings.create",
        `/v1/projects/${encodeURIComponent(projectId)}/findings`,
        withSurfaceMetadata(input),
      ).pipe(Effect.flatMap(decodeFor("projects.findings.create", decodeJsonObject))),
    recordProjectDecision: (projectId, input) =>
      postJson(
        "projects.decisions.create",
        `/v1/projects/${encodeURIComponent(projectId)}/decisions`,
        withSurfaceMetadata(input),
      ).pipe(Effect.flatMap(decodeFor("projects.decisions.create", decodeJsonObject))),
    forgetProjectMemory: (projectId, input) =>
      postJson(
        "projects.memory.forget",
        `/v1/projects/${encodeURIComponent(projectId)}/memory/forget`,
        withSurfaceMetadata(input),
      ).pipe(Effect.flatMap(decodeFor("projects.memory.forget", decodeJsonObject))),
    correctProjectMemory: (projectId, input) =>
      postJson(
        "projects.memory.correct",
        `/v1/projects/${encodeURIComponent(projectId)}/memory/correct`,
        withSurfaceMetadata(input),
      ).pipe(Effect.flatMap(decodeFor("projects.memory.correct", decodeJsonObject))),
    uploadProjectFile: (projectId, input) =>
      requestJson("projects.files.upload", `/v1/projects/${encodeURIComponent(projectId)}/files`, {
        method: "POST",
        body: projectFileUploadFormData(input),
      }).pipe(Effect.flatMap(decodeFor("projects.files.upload", decodeJsonObject))),
    retractProjectFile: (projectId, docId, input = {}) =>
      requestJson(
        "projects.files.retract",
        `/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(docId)}`,
        {
          method: "DELETE",
          body: JSON.stringify(withSurfaceMetadata(input)),
        },
      ).pipe(Effect.flatMap(decodeFor("projects.files.retract", decodeJsonObject))),
    createProjectThread: (projectId, threadInput = {}) =>
      postJson(
        "projects.threads.create",
        `/v1/projects/${encodeURIComponent(projectId)}/threads`,
        withSurfaceMetadata(threadInput),
      ).pipe(
        Effect.flatMap((body) => decodeProjectThreadResponse("projects.threads.create", body)),
      ),
    archiveProjectThread: (projectId, threadId, archiveInput = {}) =>
      postJson(
        "projects.threads.archive",
        `/v1/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/archive`,
        withSurfaceMetadata(archiveInput),
      ).pipe(
        Effect.flatMap((body) => decodeProjectThreadResponse("projects.threads.archive", body)),
      ),
    renameProjectThread: (projectId, threadId, renameInput) =>
      requestJson(
        "projects.threads.rename",
        `/v1/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(withSurfaceMetadata(renameInput)),
        },
      ).pipe(
        Effect.flatMap((body) => decodeProjectThreadResponse("projects.threads.rename", body)),
      ),
    unarchiveProjectThread: (projectId, threadId) =>
      postJson(
        "projects.threads.unarchive",
        `/v1/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/unarchive`,
        withSurfaceMetadata({}),
      ).pipe(
        Effect.flatMap((body) => decodeProjectThreadResponse("projects.threads.unarchive", body)),
      ),
    sendProjectThreadTurn: (projectId, threadId, turnInput) =>
      requestText(
        "projects.threads.turn",
        `/v1/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/turns`,
        {
          method: "POST",
          body: JSON.stringify(withSurfaceMetadata(turnInput)),
        },
      ).pipe(
        Effect.flatMap((text) => parseProjectThreadTurnResponse("projects.threads.turn", text)),
      ),
    getSession: (sessionRef) =>
      requestJson("sessions.get", `/v1/sessions/${encodeURIComponent(sessionRef)}`).pipe(
        Effect.flatMap(decodeFor("sessions.get", decodeSessionDetail)),
        Effect.map((response) => response.session),
      ),
    getSessionEvents: (sessionRef, options) =>
      requestJson(
        "sessions.events",
        appendQuery(`/v1/sessions/${encodeURIComponent(sessionRef)}/events`, {
          after: options?.after,
          limit: options?.limit,
        }),
      ).pipe(
        Effect.map((body) => normalizeSessionEventsPage(body, sessionRef)),
        Effect.flatMap(decodeFor("sessions.events", decodeSessionEventsPage)),
      ),
    getRequests: (sessionRef, options) =>
      requestJson(
        "sessions.requests",
        appendQuery(`/v1/sessions/${encodeURIComponent(sessionRef)}/requests`, {
          after: options?.after,
          limit: options?.limit,
        }),
      ).pipe(
        Effect.flatMap((body) =>
          decodeFor(
            "sessions.requests",
            decodeSessionRequestsPage,
          )(body).pipe(
            Effect.catch(() =>
              decodeFor(
                "sessions.requests",
                decodeSessionRequestsResponse,
              )(body).pipe(
                Effect.map(
                  (response): JarvisSessionRequestsPage => ({
                    items: response.requests,
                    cursor: null,
                    has_more: false,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    getCheckpoints: (sessionRef, options) =>
      requestJson(
        "sessions.checkpoints",
        appendQuery(`/v1/sessions/${encodeURIComponent(sessionRef)}/checkpoints`, {
          after: options?.after,
          limit: options?.limit,
        }),
      ).pipe(
        Effect.flatMap((body) =>
          decodeFor(
            "sessions.checkpoints",
            decodeSessionCheckpointsPage,
          )(body).pipe(
            Effect.catch(() =>
              decodeFor(
                "sessions.checkpoints",
                decodeSessionCheckpointsResponse,
              )(body).pipe(
                Effect.map(
                  (response): JarvisSessionCheckpointsPage => ({
                    items: response.checkpoints,
                    cursor: null,
                    has_more: false,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    startWork: (workInput) =>
      postJson("work.start", "/v1/work/start", withSurfaceMetadata(workInput)).pipe(
        Effect.flatMap(decodeFor("work.start", decodeControlResult)),
      ),
    validateWork: (workInput) =>
      postJson("work.validate", "/v1/work/validate", withSurfaceMetadata(workInput)).pipe(
        Effect.flatMap(decodeFor("work.validate", decodeStartWorkValidationResult)),
      ),
    pruneWorkerWorktrees: (workerId) =>
      postJson(
        "workers.worktrees.prune",
        `/v1/workers/${encodeURIComponent(workerId)}/worktrees/prune`,
        {},
      ).pipe(
        Effect.flatMap(decodeFor("workers.worktrees.prune", decodeWorkerWorktreePruneResponse)),
      ),
    sendTurn: (sessionRef, turnInput) =>
      postJson(
        "sessions.turn",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/turns`,
        withSurfaceMetadata(turnInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.turn", decodeControlResult))),
    respondApproval: (sessionRef, approvalInput) =>
      postJson(
        "sessions.approval",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/approval`,
        withSurfaceMetadata(approvalInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.approval", decodeControlResult))),
    respondInput: (sessionRef, userInput) =>
      postJson(
        "sessions.input",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/input`,
        withSurfaceMetadata(userInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.input", decodeControlResult))),
    interruptSession: (sessionRef, turnId) =>
      postJson(
        "sessions.interrupt",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/interrupt`,
        withSurfaceMetadata(turnId ? { turn_id: turnId } : {}),
      ).pipe(Effect.flatMap(decodeFor("sessions.interrupt", decodeControlResult))),
    stopSession: (sessionRef) =>
      postJson(
        "sessions.stop",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/stop`,
        withSurfaceMetadata({}),
      ).pipe(Effect.flatMap(decodeFor("sessions.stop", decodeControlResult))),
    archiveSession: (sessionRef, archiveInput = {}) =>
      postJson(
        "sessions.archive",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/archive`,
        withSurfaceMetadata(archiveInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.archive", decodeControlResult))),
    archiveRun: (runId, archiveInput = {}) =>
      postJson(
        "runs.archive",
        `/v1/runs/${encodeURIComponent(runId)}/archive`,
        withSurfaceMetadata(archiveInput),
      ).pipe(Effect.flatMap(decodeFor("runs.archive", decodeControlResult))),
    deleteSession: (sessionRef, deleteInput = {}) =>
      requestJson("sessions.delete", `/v1/sessions/${encodeURIComponent(sessionRef)}`, {
        method: "DELETE",
        body: JSON.stringify(withSurfaceMetadata(deleteInput)),
      }).pipe(Effect.flatMap(decodeFor("sessions.delete", decodeLifecycleResult))),
    deleteRun: (runId, deleteInput = {}) =>
      requestJson("runs.delete", `/v1/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
        body: JSON.stringify(withSurfaceMetadata(deleteInput)),
      }).pipe(Effect.flatMap(decodeFor("runs.delete", decodeLifecycleResult))),
    closeSession: (sessionRef, closeInput = {}) =>
      postJson(
        "sessions.close",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/close`,
        withSurfaceMetadata(closeInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.close", decodeLifecycleResult))),
    restoreCheckpoint: (sessionRef, restoreInput) =>
      postJson(
        "sessions.checkpoints.restore",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/checkpoints/restore`,
        withSurfaceMetadata(restoreInput),
      ).pipe(Effect.flatMap(decodeFor("sessions.checkpoints.restore", decodeControlResult))),
    resumeRun: (runId, resumeInput) =>
      postJson(
        "work.resume",
        "/v1/work/resume",
        withSurfaceMetadata({
          ...resumeInput,
          prompt:
            typeof resumeInput?.prompt === "string" && resumeInput.prompt.trim().length > 0
              ? resumeInput.prompt
              : "Continue from the current state.",
          run_id: runId,
        }),
      ).pipe(Effect.flatMap(decodeFor("work.resume", decodeControlResult))),
  };
}

export const makeJarvisWorkerSessionClient = makeJarvisCockpitClient;

export function makeJarvisClient(config: {
  readonly jarvisCockpitEnabled: boolean;
  readonly jarvisApiBaseUrl: URL | undefined;
  readonly jarvisApiToken: string | undefined;
  readonly jarvisFixtureMode: boolean;
  readonly jarvisFixtureEmptyProjects?: boolean | undefined;
  readonly getSettings?: Effect.Effect<ServerSettings, ServerSettingsError>;
  readonly oauthAccessToken?: JarvisAccessTokenProvider;
}): JarvisClient {
  if (config.jarvisFixtureMode) {
    return makeSharedJarvisFixtureClient({
      emptyProjects: config.jarvisFixtureEmptyProjects === true,
    });
  }
  if (config.getSettings !== undefined) {
    const getSettings = config.getSettings;
    const withClient = <A, E>(
      operation: string,
      run: (client: JarvisClient) => Effect.Effect<A, E>,
    ): Effect.Effect<A, E | JarvisClientError> =>
      getSettings.pipe(
        Effect.mapError(
          (cause) =>
            new JarvisClientError({
              operation,
              message: "Failed to load Jarvis brain settings.",
              cause,
            }),
        ),
        Effect.flatMap((settings) =>
          Effect.try({
            try: () =>
              makeJarvisClientFromConnection({
                config,
                settings,
                ...(config.oauthAccessToken !== undefined
                  ? { oauthAccessToken: config.oauthAccessToken }
                  : {}),
              }),
            catch: (cause) =>
              new JarvisClientError({
                operation,
                message: "Jarvis brain URL is not valid.",
                cause,
              }),
          }),
        ),
        Effect.flatMap(run),
      );

    return {
      getCatalog: () => withClient("cockpit.catalog", (client) => client.getCatalog()),
      getCapabilities: () => withClient("capabilities.get", (client) => client.getCapabilities()),
      getMcpStatus: () => withClient("mcp.status", (client) => client.getMcpStatus()),
      getSnapshot: () => withClient("cockpit.snapshot", (client) => client.getSnapshot()),
      getProjects: (options) =>
        withClient("projects.list", (client) => client.getProjects(options)),
      getProject: (projectId) =>
        withClient("projects.get", (client) => client.getProject(projectId)),
      getProjectMemory: (projectId) =>
        withClient("projects.memory", (client) => client.getProjectMemory(projectId)),
      getProjectFiles: (projectId, options) =>
        withClient("projects.files", (client) => client.getProjectFiles(projectId, options)),
      getProjectThreads: (projectId, options) =>
        withClient("projects.threads", (client) => client.getProjectThreads(projectId, options)),
      getProjectThread: (projectId, threadId) =>
        withClient("projects.threads.get", (client) =>
          client.getProjectThread(projectId, threadId),
        ),
      createProject: (input) =>
        withClient("projects.create", (client) => client.createProject(input)),
      updateProject: (projectId, input) =>
        withClient("projects.update", (client) => client.updateProject(projectId, input)),
      archiveProject: (projectId, input) =>
        withClient("projects.archive", (client) => client.archiveProject(projectId, input)),
      deleteProject: (projectId) =>
        withClient("projects.delete", (client) => client.deleteProject(projectId)),
      recordProjectFinding: (projectId, input) =>
        withClient("projects.findings.create", (client) =>
          client.recordProjectFinding(projectId, input),
        ),
      recordProjectDecision: (projectId, input) =>
        withClient("projects.decisions.create", (client) =>
          client.recordProjectDecision(projectId, input),
        ),
      forgetProjectMemory: (projectId, input) =>
        withClient("projects.memory.forget", (client) =>
          client.forgetProjectMemory(projectId, input),
        ),
      correctProjectMemory: (projectId, input) =>
        withClient("projects.memory.correct", (client) =>
          client.correctProjectMemory(projectId, input),
        ),
      uploadProjectFile: (projectId, input) =>
        withClient("projects.files.upload", (client) => client.uploadProjectFile(projectId, input)),
      retractProjectFile: (projectId, docId, input) =>
        withClient("projects.files.retract", (client) =>
          client.retractProjectFile(projectId, docId, input),
        ),
      createProjectThread: (projectId, input) =>
        withClient("projects.threads.create", (client) =>
          client.createProjectThread(projectId, input),
        ),
      archiveProjectThread: (projectId, threadId, input) =>
        withClient("projects.threads.archive", (client) =>
          client.archiveProjectThread(projectId, threadId, input),
        ),
      renameProjectThread: (projectId, threadId, input) =>
        withClient("projects.threads.rename", (client) =>
          client.renameProjectThread(projectId, threadId, input),
        ),
      unarchiveProjectThread: (projectId, threadId) =>
        withClient("projects.threads.unarchive", (client) =>
          client.unarchiveProjectThread(projectId, threadId),
        ),
      sendProjectThreadTurn: (projectId, threadId, input) =>
        withClient("projects.threads.turn", (client) =>
          client.sendProjectThreadTurn(projectId, threadId, input),
        ),
      getSession: (sessionRef) =>
        withClient("sessions.get", (client) => client.getSession(sessionRef)),
      getSessionEvents: (sessionRef, options) =>
        withClient("sessions.events", (client) => client.getSessionEvents(sessionRef, options)),
      getRequests: (sessionRef, options) =>
        withClient("sessions.requests", (client) => client.getRequests(sessionRef, options)),
      getCheckpoints: (sessionRef, options) =>
        withClient("sessions.checkpoints", (client) => client.getCheckpoints(sessionRef, options)),
      startWork: (input) => withClient("work.start", (client) => client.startWork(input)),
      validateWork: (input) => withClient("work.validate", (client) => client.validateWork(input)),
      pruneWorkerWorktrees: (workerId) =>
        withClient("workers.worktrees.prune", (client) => client.pruneWorkerWorktrees(workerId)),
      sendTurn: (sessionRef, input) =>
        withClient("sessions.turns", (client) => client.sendTurn(sessionRef, input)),
      respondApproval: (sessionRef, input) =>
        withClient("sessions.approval", (client) => client.respondApproval(sessionRef, input)),
      respondInput: (sessionRef, input) =>
        withClient("sessions.input", (client) => client.respondInput(sessionRef, input)),
      interruptSession: (sessionRef, turnId) =>
        withClient("sessions.interrupt", (client) => client.interruptSession(sessionRef, turnId)),
      stopSession: (sessionRef) =>
        withClient("sessions.stop", (client) => client.stopSession(sessionRef)),
      archiveSession: (sessionRef, input) =>
        withClient("sessions.archive", (client) => client.archiveSession(sessionRef, input)),
      archiveRun: (runId, input) =>
        withClient("runs.archive", (client) => client.archiveRun(runId, input)),
      deleteSession: (sessionRef, input) =>
        withClient("sessions.delete", (client) => client.deleteSession(sessionRef, input)),
      deleteRun: (runId, input) =>
        withClient("runs.delete", (client) => client.deleteRun(runId, input)),
      closeSession: (sessionRef, input) =>
        withClient("sessions.close", (client) => client.closeSession(sessionRef, input)),
      restoreCheckpoint: (sessionRef, input) =>
        withClient("sessions.checkpoints.restore", (client) =>
          client.restoreCheckpoint(sessionRef, input),
        ),
      resumeRun: (runId, input) =>
        withClient("work.resume", (client) => client.resumeRun(runId, input)),
    };
  }

  if (!config.jarvisCockpitEnabled) {
    return makeMissingConfigurationClient("Jarvis cockpit mode is disabled.");
  }
  return makeJarvisCockpitClient({
    baseUrl: config.jarvisApiBaseUrl ?? new URL(DEFAULT_JARVIS_API_BASE_URL),
    ...(config.jarvisApiToken ? { token: config.jarvisApiToken } : {}),
    ...(config.oauthAccessToken !== undefined ? { tokenProvider: config.oauthAccessToken } : {}),
  });
}

export function checkJarvisBrain(input: {
  readonly config: JarvisConnectionConfig;
  readonly settings: ServerSettings;
  readonly apiBaseUrl?: string;
  readonly apiToken?: string;
  readonly oauthAccessToken?: Effect.Effect<string | undefined, JarvisClientError>;
  readonly fetch?: FetchLike;
}): Effect.Effect<JarvisBrainCheckResult, JarvisClientError> {
  return Effect.gen(function* () {
    const connection = resolveJarvisBrainConnection(input.config, input.settings);
    const apiBaseUrl = input.apiBaseUrl?.trim() || connection.apiBaseUrl;
    const legacyToken =
      input.apiToken !== undefined
        ? input.apiToken.trim()
        : (input.config.jarvisApiToken ?? input.settings.jarvis.apiToken.trim());
    const canUseOAuthForHealthCheck = canUseJarvisOAuthForUrl(input.config, apiBaseUrl);
    const oauthTokenEffect =
      input.apiToken === undefined &&
      input.oauthAccessToken !== undefined &&
      canUseOAuthForHealthCheck
        ? input.oauthAccessToken.pipe(
            Effect.catch((error) => (legacyToken.length > 0 ? Effect.void : Effect.fail(error))),
          )
        : Effect.void;
    const oauthToken = yield* oauthTokenEffect;
    const apiToken = oauthToken ?? legacyToken;
    const checkedAt = DateTime.formatIso(DateTime.nowUnsafe());
    const healthUrl = yield* Effect.try({
      try: () => new URL("/v1/health", new URL(apiBaseUrl)),
      catch: (cause) =>
        new JarvisClientError({
          operation: "jarvis.health",
          message: "Jarvis brain URL is not valid.",
          cause,
        }),
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: "invalid" as const,
          error,
        }),
      ),
    );
    if ("_tag" in healthUrl) {
      return {
        ok: false,
        checkedAt,
        apiBaseUrl,
        message: "Jarvis brain URL is not valid.",
        response: { cause: healthUrl.error.cause },
      };
    }

    return yield* Effect.tryPromise({
      try: async () => {
        const fetchImpl = input.fetch ?? fetch;
        const send = async (token: string) => {
          const response = await fetchImpl(healthUrl, {
            headers: {
              accept: "application/json",
              ...(token.length > 0 ? { authorization: `Bearer ${token}` } : {}),
            },
          });
          const text = await response.text();
          return { response, text };
        };
        const first = await send(apiToken);
        const result =
          oauthToken !== undefined &&
          legacyToken.length > 0 &&
          isAuthRejectedStatus(first.response.status)
            ? await send(legacyToken)
            : first;
        const { response, text } = result;
        let body: unknown = undefined;
        if (text.trim().length > 0) {
          try {
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            body = JSON.parse(text);
          } catch {
            body = text.slice(0, 2_000);
          }
        }
        return {
          ok: response.ok,
          checkedAt,
          apiBaseUrl,
          status: response.status,
          message: response.ok
            ? "Jarvis brain is reachable."
            : `Jarvis brain returned HTTP ${response.status}.`,
          ...(body !== undefined ? { response: body } : {}),
        };
      },
      catch: (cause) =>
        new JarvisClientError({
          operation: "jarvis.health",
          message: "Jarvis brain health check failed.",
          cause,
        }),
    });
  });
}

export const makeJarvisClientFromConfig = Effect.gen(function* () {
  const config = yield* ServerConfig;
  return makeJarvisClient(config);
});

export const JarvisClientLayer = Layer.effect(JarvisClientService, makeJarvisClientFromConfig);

function makeMissingConfigurationClient(message: string): JarvisClient {
  const fail = <A>(operation: string): Effect.Effect<A, JarvisClientError> =>
    Effect.fail(
      new JarvisClientError({
        operation,
        message,
      }),
    );

  return {
    getCatalog: () => fail("jarvis.client.configure"),
    getCapabilities: () => fail("jarvis.client.configure"),
    getMcpStatus: () => fail("jarvis.client.configure"),
    getSnapshot: () => fail("jarvis.client.configure"),
    getProjects: () => fail("jarvis.client.configure"),
    getProject: () => fail("jarvis.client.configure"),
    getProjectMemory: () => fail("jarvis.client.configure"),
    getProjectFiles: () => fail("jarvis.client.configure"),
    getProjectThreads: () => fail("jarvis.client.configure"),
    getProjectThread: () => fail("jarvis.client.configure"),
    createProject: () => fail("jarvis.client.configure"),
    updateProject: () => fail("jarvis.client.configure"),
    archiveProject: () => fail("jarvis.client.configure"),
    deleteProject: () => fail("jarvis.client.configure"),
    recordProjectFinding: () => fail("jarvis.client.configure"),
    recordProjectDecision: () => fail("jarvis.client.configure"),
    forgetProjectMemory: () => fail("jarvis.client.configure"),
    correctProjectMemory: () => fail("jarvis.client.configure"),
    uploadProjectFile: () => fail("jarvis.client.configure"),
    retractProjectFile: () => fail("jarvis.client.configure"),
    createProjectThread: () => fail("jarvis.client.configure"),
    archiveProjectThread: () => fail("jarvis.client.configure"),
    renameProjectThread: () => fail("jarvis.client.configure"),
    unarchiveProjectThread: () => fail("jarvis.client.configure"),
    sendProjectThreadTurn: () => fail("jarvis.client.configure"),
    getSession: () => fail("jarvis.client.configure"),
    getSessionEvents: () => fail("jarvis.client.configure"),
    getRequests: () => fail("jarvis.client.configure"),
    getCheckpoints: () => fail("jarvis.client.configure"),
    startWork: () => fail("jarvis.client.configure"),
    validateWork: () => fail("jarvis.client.configure"),
    pruneWorkerWorktrees: () => fail("jarvis.client.configure"),
    sendTurn: () => fail("jarvis.client.configure"),
    respondApproval: () => fail("jarvis.client.configure"),
    respondInput: () => fail("jarvis.client.configure"),
    interruptSession: () => fail("jarvis.client.configure"),
    stopSession: () => fail("jarvis.client.configure"),
    archiveSession: () => fail("jarvis.client.configure"),
    archiveRun: () => fail("jarvis.client.configure"),
    deleteSession: () => fail("jarvis.client.configure"),
    deleteRun: () => fail("jarvis.client.configure"),
    closeSession: () => fail("jarvis.client.configure"),
    restoreCheckpoint: () => fail("jarvis.client.configure"),
    resumeRun: () => fail("jarvis.client.configure"),
  };
}

export interface JarvisFixtureClientOptions {
  readonly emptyProjects?: boolean;
}

export function makeJarvisFixtureClient(options?: JarvisFixtureClientOptions): JarvisClient {
  const emptyProjects = options?.emptyProjects === true;
  const now = "2026-07-01T12:00:00+00:00";
  const sessionRef = JarvisSessionRef.make("sessref_macbook-worker_sess_fixture_codex");
  const runId = JarvisRunId.make("run_fixture_dashboard");
  const session: JarvisWorkerSession = {
    session_ref: sessionRef,
    worker_id: "macbook-worker" as JarvisWorkerSession["worker_id"],
    session_id: JarvisWorkerSessionId.make("sess_fixture_codex"),
    provider: "codex",
    engine: "codex",
    authority: "jarvis",
    supported_controls: [
      "turn",
      "input",
      "approval",
      "interrupt",
      "stop",
      "archive",
      "checkpoint_restore",
    ],
    status: "needs_input",
    run_id: runId,
    repo: "roughcoder/jarvis",
    branch: "jarvis/fixture-agentic-cockpit",
    cwd_label: "jarvis",
    title: "Fixture Codex implementation",
    latest_event_cursor: "evt_fixture_2",
    pending_input_count: 1,
    pending_approval_count: 0,
    checkpoint_count: 1,
    created_at: now,
    updated_at: now,
    archived_at: null,
    metadata: {
      surface: "jarvis-cockpit",
    },
  };
  const run: JarvisRun = {
    run_id: runId,
    title: "Build Jarvis cockpit",
    objective: "Expose Jarvis orchestration through T3 cockpit projections",
    status: "needs_input",
    phase: "implementing",
    repo: "roughcoder/jarvis",
    branch: "jarvis/fixture-agentic-cockpit",
    session_count: 1,
    active_session_count: 1,
    pending_input_count: 1,
    pending_approval_count: 0,
    artifact_count: 2,
    primary_artifact_ids: ["artifact_fixture_pr" as JarvisRun["primary_artifact_ids"][number]],
    latest_activity_at: now,
    latest_cursor: "evt_fixture_2",
    created_at: now,
    updated_at: now,
    archived_at: null,
    terminal_reason: null,
    metadata: {
      surface: "jarvis-cockpit",
    },
  };
  const jarvisProjectId = JarvisProjectId.make("jarvis");
  const cockpitProjectId = JarvisProjectId.make("jarvis-cockpit");
  let projects: ReadonlyArray<JarvisProject> = emptyProjects
    ? []
    : [
        {
          id: cockpitProjectId,
          name: "Jarvis Cockpit",
          peer_id: "project:jarvis-cockpit",
          aliases: ["cockpit", "t3 cockpit"],
          owner: "neil",
          members: ["neil"],
          visibility: "household",
          status: "active",
          repos: [
            { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true },
            { name: "runtime", remote: "roughcoder/jarvis", default: false },
          ],
          links: { jira: "", urls: [] },
          files_root: "jarvis-workspace/projects/jarvis-cockpit/files",
        },
        {
          id: jarvisProjectId,
          name: "Jarvis Runtime",
          peer_id: "project:jarvis",
          aliases: ["jarvis"],
          owner: "neil",
          members: ["neil"],
          visibility: "household",
          status: "active",
          repos: [{ name: "runtime", remote: "roughcoder/jarvis", default: true }],
          links: { jira: "", urls: [] },
          files_root: "jarvis-workspace/projects/jarvis/files",
        },
      ];
  const projectThreads = new Map<string, JarvisProjectThread[]>([
    [
      cockpitProjectId,
      [
        {
          thread_id: JarvisProjectThreadId.make("thread_fixture_cockpit_plan"),
          project_id: cockpitProjectId,
          session_id: "project:jarvis-cockpit:orchestrator:thread_fixture_cockpit_plan",
          title: "Cockpit planning",
          created_at: now,
          updated_at: now,
          created_by: "neil",
        },
      ],
    ],
    [jarvisProjectId, []],
  ]);
  const projectThreadMessages = new Map<string, JarvisProjectThreadDetail["messages"]>([
    [
      `${cockpitProjectId}/thread_fixture_cockpit_plan`,
      [
        {
          role: "user",
          peer_id: "neil",
          content: "What should Cockpit make primary?",
          observed_at: now,
        },
        {
          role: "assistant",
          peer_id: "jarvis",
          content: "Make Jarvis projects the main operating surface.",
          observed_at: now,
        },
      ],
    ],
  ]);
  const projectFiles = new Map<string, JarvisProjectFile[]>([
    [
      cockpitProjectId,
      [
        {
          doc_id: "fixture-cockpit-spec",
          title: "Cockpit API Spec",
          session_id: "project:jarvis-cockpit:uploads:fixture-cockpit-spec",
          original_path: "projects/jarvis-cockpit/files/fixture-cockpit-spec.md",
          content_hash: "sha256:fixture",
          artifact_type: "spec",
          uploaded_by: "fixture",
          observed_at: now,
          retracted: false,
          ingestion: { queued: false },
          metadata: { source: "fixture" },
        },
      ],
    ],
    [jarvisProjectId, []],
  ]);
  let generatedProjectThreadCount = 1;
  let generatedProjectFileCount = 1;
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: JarvisSessionEvent.fields.event_id.make("evt_fixture_1"),
      sequence: 1,
      session_ref: session.session_ref,
      run_id: session.run_id,
      type: "session.created",
      occurred_at: now,
      turn_id: null,
      message_id: null,
      data: {
        provider: "codex",
        engine: "codex",
      },
    },
    {
      event_id: JarvisSessionEvent.fields.event_id.make("evt_fixture_2"),
      sequence: 2,
      session_ref: session.session_ref,
      run_id: session.run_id,
      type: "input.requested",
      occurred_at: now,
      turn_id: "turn_fixture_1",
      message_id: null,
      data: {
        request_id: "input_fixture_1",
        prompt: "Choose the next worker action.",
      },
    },
  ];
  const initialSnapshot: JarvisRunsSnapshot = {
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_fixture_2",
    generated_at: now,
    sync: {
      mode: "fast",
      status: "fresh",
      synced_at: now,
      errors: [],
    },
    runs: emptyProjects ? [] : [run],
    sessions: emptyProjects ? [] : [session],
    workers: [
      {
        worker_id: "macbook-worker" as JarvisWorkerSession["worker_id"],
        display_name: "MacBook Pro",
        status: "online",
        health: "healthy",
        last_seen_at: now,
        capabilities: ["code.edit", "shell.run", "browser.use", "github.pr.create"],
        engines: [
          {
            engine: "codex",
            display_name: "Codex",
            status: "available",
            default: true,
            supports: {
              streaming: true,
              resume: true,
              interrupt: true,
              approval_requests: true,
              input_requests: true,
              checkpoints: true,
              attachments: true,
            },
          },
        ],
        capacity: {
          max_sessions: 4,
          active_sessions: emptyProjects ? 0 : 1,
          queued_sessions: 0,
        },
        repositories: [
          {
            repo: "roughcoder/jarvis",
            status: "ready",
            default_branch: "main",
            is_default: true,
            can_start_work: true,
          },
          {
            repo: "roughcoder/jarvis-cockpit",
            status: "ready",
            default_branch: "main",
            is_default: false,
            can_start_work: true,
          },
        ],
        git_identity: {
          provider: "github",
          login: "octocat",
          auth_state: "valid",
          connected: true,
          authenticated: true,
          auth_fresh: true,
          detail: "Fixture GitHub identity",
        },
        repo_access: [
          {
            repo: "roughcoder/jarvis",
            accessible: true,
            public: false,
            reason_code: "accessible",
            reason: "Fixture worker identity can read this repo.",
          },
          {
            repo: "roughcoder/jarvis-cockpit",
            accessible: true,
            public: false,
            reason_code: "accessible",
            reason: "Fixture worker identity can read this repo.",
          },
        ],
        worktree_inventory: {
          count: emptyProjects ? 1 : 3,
          disk_bytes: emptyProjects ? 4096 : 123456,
          stale_count: 1,
        },
        public_metadata: {},
      },
      {
        worker_id: "mac-mini-worker" as JarvisWorkerSession["worker_id"],
        display_name: "Mac mini",
        status: "online",
        health: "healthy",
        last_seen_at: now,
        capabilities: ["code.edit", "shell.run", "browser.use", "github.pr.create"],
        engines: [
          {
            engine: "codex",
            display_name: "Codex",
            status: "available",
            default: true,
            supports: {
              streaming: true,
              resume: true,
              interrupt: true,
              approval_requests: true,
              input_requests: true,
              checkpoints: true,
              attachments: true,
            },
          },
        ],
        capacity: {
          max_sessions: 4,
          active_sessions: 0,
          queued_sessions: 0,
        },
        repositories: [
          {
            repo: "roughcoder/jarvis",
            status: "ready",
            default_branch: "main",
            is_default: true,
            can_start_work: true,
          },
          {
            repo: "roughcoder/jarvis-cockpit",
            status: "ready",
            default_branch: "main",
            is_default: false,
            can_start_work: true,
          },
        ],
        git_identity: {
          provider: "github",
          login: "fixture-mini",
          auth_state: "expired",
          connected: true,
          authenticated: true,
          auth_fresh: false,
          detail: "Fixture GitHub auth needs refresh",
        },
        repo_access: [
          {
            repo: "roughcoder/jarvis",
            accessible: true,
            public: false,
            reason_code: "accessible",
            reason: "Fixture worker identity can read this repo.",
          },
          {
            repo: "roughcoder/private",
            accessible: false,
            public: false,
            reason_code: "identity-lacks-repo-access",
            reason: "Fixture worker identity lacks access.",
          },
        ],
        worktree_inventory: {
          count: 2,
          disk_bytes: 65536,
          stale_count: 0,
        },
        public_metadata: {},
      },
    ],
    artifacts: emptyProjects
      ? []
      : [
          {
            artifact_id: "artifact_fixture_branch" as JarvisRun["primary_artifact_ids"][number],
            run_id: run.run_id,
            session_ref: session.session_ref,
            kind: "branch",
            provider: "github",
            external_id: null,
            is_primary: false,
            visibility: "public",
            title: "jarvis/fixture-agentic-cockpit",
            status: "ready",
            summary: "Fixture branch for mocked cockpit mode",
            url: "https://github.com/roughcoder/jarvis/tree/jarvis/fixture-agentic-cockpit",
            branch: "jarvis/fixture-agentic-cockpit",
            commit_sha: null,
            command: null,
            started_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
            metadata: {},
          },
          {
            artifact_id: "artifact_fixture_pr" as JarvisRun["primary_artifact_ids"][number],
            run_id: run.run_id,
            session_ref: session.session_ref,
            kind: "pull_request",
            provider: "github",
            external_id: "1",
            is_primary: true,
            visibility: "public",
            title: "PR #1",
            status: "draft",
            summary: "Fixture PR evidence for the cockpit dashboard",
            url: "https://github.com/roughcoder/jarvis-cockpit/pull/1",
            branch: "jarvis/fixture-agentic-cockpit",
            commit_sha: null,
            command: null,
            started_at: null,
            completed_at: null,
            created_at: now,
            updated_at: now,
            metadata: {},
          },
        ],
    requests: [],
    checkpoints: [],
  };
  const request = {
    request_id: JarvisRequestId.make("input_fixture_1"),
    session_ref: session.session_ref,
    run_id: session.run_id,
    kind: "input" as const,
    status: "pending" as const,
    title: "Worker direction needed",
    detail: "Choose the next worker action.",
    created_at: now,
    expires_at: null,
    questions: [
      {
        id: "next_action",
        header: "Action",
        question: "What should the worker do next?",
        options: [
          {
            label: "Continue",
            description: "Continue the current implementation.",
          },
        ],
      },
    ],
    payload: {},
  };
  const checkpoint = {
    session_ref: session.session_ref,
    checkpoint_id: "ckpt_fixture_1",
    label: "Fixture checkpoint",
    provider: "codex",
    restored: false,
    event: {
      type: "checkpoint.created",
      checkpoint_id: "ckpt_fixture_1",
      turn_id: "turn_fixture_1",
      occurred_at: now,
    },
  };

  let fixtureSnapshot: JarvisRunsSnapshot = {
    ...initialSnapshot,
    requests: [request],
    checkpoints: [checkpoint],
  };
  const eventsBySession = new Map<string, ReadonlyArray<JarvisSessionEvent>>([
    [session.session_ref, events],
  ]);
  const requestsBySession = new Map<string, ReadonlyArray<typeof request>>([
    [session.session_ref, [request]],
  ]);
  const checkpointsBySession = new Map<string, ReadonlyArray<typeof checkpoint>>([
    [session.session_ref, [checkpoint]],
  ]);
  let generatedWorkCount = 0;

  const findSession = (candidateSessionRef: string): JarvisWorkerSession | undefined =>
    fixtureSnapshot.sessions.find((candidate) => candidate.session_ref === candidateSessionRef);
  const findRun = (candidateRunId: string): JarvisRun | undefined =>
    fixtureSnapshot.runs.find((candidate) => candidate.run_id === candidateRunId);
  const findProject = (candidateProjectId: string): JarvisProject | undefined =>
    projects.find((candidate) => candidate.id === candidateProjectId);
  const projectPeerId = (projectId: string) => `project:${projectId}`;
  const fixtureProjectFromCreateInput = (input: JarvisProjectCreateInput): JarvisProject => {
    const name = input.name;
    const id = input.id ?? JarvisProjectId.make(fixtureIdSlug(name));
    return {
      id,
      name,
      peer_id: input.peer_id ?? projectPeerId(id),
      aliases: input.aliases ?? [],
      owner: input.owner ?? "fixture",
      members: input.members ?? ["fixture"],
      visibility: input.visibility ?? "household",
      status: input.status ?? "active",
      repos: input.repos ?? [],
      links: input.links ?? { urls: [] },
      files_root: input.files_root ?? `jarvis-workspace/projects/${id}/files`,
    };
  };
  const fixtureProjectFromUpdateInput = (
    project: JarvisProject,
    input: JarvisProjectUpdateInput,
  ): JarvisProject => ({
    ...project,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.peer_id !== undefined ? { peer_id: input.peer_id } : {}),
    ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
    ...(input.owner !== undefined ? { owner: input.owner } : {}),
    ...(input.members !== undefined ? { members: input.members } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.repos !== undefined ? { repos: input.repos } : {}),
    ...(input.links !== undefined ? { links: input.links } : {}),
    ...(input.files_root !== undefined ? { files_root: input.files_root } : {}),
  });

  const fixtureEvent = (input: {
    readonly eventId: string;
    readonly sequence: number;
    readonly sessionRef: JarvisSessionRef;
    readonly runId: JarvisRunId;
    readonly type: string;
    readonly turnId?: string | null;
    readonly messageId?: string | null;
    readonly data?: Record<string, Schema.Json>;
  }): JarvisSessionEvent => ({
    event_id: JarvisSessionEvent.fields.event_id.make(input.eventId),
    sequence: input.sequence,
    session_ref: input.sessionRef,
    run_id: input.runId,
    type: input.type,
    occurred_at: now,
    turn_id: input.turnId ?? null,
    message_id: input.messageId ?? null,
    data: input.data ?? {},
  });

  const synthesizeStartedWork = (workInput: JarvisStartWorkInput) => {
    generatedWorkCount += 1;
    const title =
      firstTrimmed(workInput.title, workInput.objective, workInput.phrase, workInput.prompt) ??
      `Fixture work ${generatedWorkCount}`;
    const objective =
      firstTrimmed(workInput.objective, workInput.prompt, workInput.phrase, workInput.title) ??
      title;
    const prompt = firstTrimmed(workInput.prompt, workInput.phrase, objective) ?? objective;
    const repo = firstTrimmed(workInput.repo) ?? "roughcoder/jarvis";
    const engine = firstTrimmed(workInput.engine) ?? "codex";
    const provider = engine.toLowerCase().startsWith("claude") ? "claude" : "codex";
    const workerId = firstTrimmed(workInput.worker_id) ?? "macbook-worker";
    const runSlug = fixtureIdSlug(title);
    const syntheticRunId = JarvisRunId.make(`run_fixture_${runSlug}_${generatedWorkCount}`);
    const syntheticSessionId = JarvisWorkerSessionId.make(
      `sess_fixture_${runSlug}_${generatedWorkCount}`,
    );
    const syntheticSessionRef = JarvisSessionRef.make(`sessref_${workerId}_${syntheticSessionId}`);
    const syntheticBranch = firstTrimmed(workInput.branch) ?? `jarvis/fixture-${runSlug}`;
    const cursor = `evt_fixture_${runSlug}_${generatedWorkCount}_4`;
    const syntheticRun: JarvisRun = {
      ...run,
      run_id: syntheticRunId,
      title,
      objective,
      status: "running",
      phase: "implementing",
      repo,
      branch: syntheticBranch,
      session_count: 1,
      active_session_count: 1,
      pending_input_count: 0,
      pending_approval_count: 0,
      artifact_count: 1,
      primary_artifact_ids: [],
      latest_activity_at: now,
      latest_cursor: cursor,
      created_at: now,
      updated_at: now,
      archived_at: null,
      terminal_reason: null,
      metadata: {
        surface: "jarvis-cockpit",
        fixture_generated: true,
      },
    };
    const syntheticSession: JarvisWorkerSession = {
      ...session,
      session_ref: syntheticSessionRef,
      worker_id: workerId as JarvisWorkerSession["worker_id"],
      session_id: syntheticSessionId,
      run_id: syntheticRunId,
      title,
      provider,
      engine,
      status: "running",
      repo,
      branch: syntheticBranch,
      latest_event_cursor: cursor,
      pending_input_count: 0,
      pending_approval_count: 0,
      checkpoint_count: 0,
      created_at: now,
      updated_at: now,
      archived_at: null,
      metadata: {
        surface: "jarvis-cockpit",
        fixture_generated: true,
      },
    };
    const syntheticEvents: ReadonlyArray<JarvisSessionEvent> = [
      fixtureEvent({
        eventId: `${syntheticRunId}_evt_session_created`,
        sequence: 1,
        sessionRef: syntheticSessionRef,
        runId: syntheticRunId,
        type: "session.created",
        data: {
          provider,
          engine,
          fixture_generated: true,
        },
      }),
      fixtureEvent({
        eventId: `${syntheticRunId}_evt_turn_started`,
        sequence: 2,
        sessionRef: syntheticSessionRef,
        runId: syntheticRunId,
        type: "turn.started",
        turnId: `${syntheticRunId}_turn_1`,
        data: {
          prompt,
        },
      }),
      fixtureEvent({
        eventId: `${syntheticRunId}_evt_assistant_message`,
        sequence: 3,
        sessionRef: syntheticSessionRef,
        runId: syntheticRunId,
        type: "assistant.message",
        turnId: `${syntheticRunId}_turn_1`,
        messageId: `${syntheticRunId}_message_1`,
        data: {
          text: `Fixture mode started "${title}" on ${workerId}. Connect a real Jarvis API to execute this work with live workers.`,
        },
      }),
      fixtureEvent({
        eventId: cursor,
        sequence: 4,
        sessionRef: syntheticSessionRef,
        runId: syntheticRunId,
        type: "turn.completed",
        turnId: `${syntheticRunId}_turn_1`,
      }),
    ];
    const branchArtifact: JarvisArtifact = {
      ...fixtureSnapshot.artifacts[0]!,
      artifact_id:
        `artifact_fixture_${runSlug}_${generatedWorkCount}_branch` as JarvisArtifact["artifact_id"],
      run_id: syntheticRunId,
      session_ref: syntheticSessionRef,
      title: syntheticBranch,
      summary: `Fixture branch for ${title}`,
      branch: syntheticBranch,
      created_at: now,
      updated_at: now,
      metadata: {
        fixture_generated: true,
      },
    };
    const runWithArtifact: JarvisRun = {
      ...syntheticRun,
      artifact_count: 1,
      primary_artifact_ids: [branchArtifact.artifact_id],
    };
    fixtureSnapshot = {
      ...fixtureSnapshot,
      cursor,
      generated_at: now,
      runs: [runWithArtifact, ...fixtureSnapshot.runs],
      sessions: [syntheticSession, ...fixtureSnapshot.sessions],
      artifacts: [branchArtifact, ...fixtureSnapshot.artifacts],
      requests: [],
      checkpoints: [],
      workers: fixtureSnapshot.workers.map((worker) =>
        worker.worker_id === syntheticSession.worker_id
          ? {
              ...worker,
              capacity: {
                ...worker.capacity,
                active_sessions: worker.capacity.active_sessions + 1,
              },
            }
          : worker,
      ),
    };
    eventsBySession.set(syntheticSessionRef, syntheticEvents);
    requestsBySession.set(syntheticSessionRef, []);
    checkpointsBySession.set(syntheticSessionRef, []);
    return {
      cursor,
      run: runWithArtifact,
      session: syntheticSession,
      events: syntheticEvents,
      artifacts: [branchArtifact],
    };
  };

  const appendSyntheticTurn = (candidateSessionRef: string, turnInput: JarvisTurnInput) => {
    const targetSession = findSession(candidateSessionRef) ?? session;
    const targetRun = findRun(targetSession.run_id) ?? run;
    const existingEvents = eventsBySession.get(targetSession.session_ref) ?? [];
    const nextSequence = existingEvents.length + 1;
    const turnId = `turn_fixture_${fixtureIdSlug(targetSession.session_id)}_${nextSequence}`;
    const cursor = `${targetRun.run_id}_evt_turn_${nextSequence + 2}_completed`;
    const prompt = firstTrimmed(turnInput.prompt) ?? "Continue.";
    const newEvents: ReadonlyArray<JarvisSessionEvent> = [
      fixtureEvent({
        eventId: `${targetRun.run_id}_evt_turn_${nextSequence}_started`,
        sequence: nextSequence,
        sessionRef: targetSession.session_ref,
        runId: targetRun.run_id,
        type: "turn.started",
        turnId,
        data: {
          prompt,
        },
      }),
      fixtureEvent({
        eventId: `${targetRun.run_id}_evt_turn_${nextSequence + 1}_assistant`,
        sequence: nextSequence + 1,
        sessionRef: targetSession.session_ref,
        runId: targetRun.run_id,
        type: "assistant.message",
        turnId,
        messageId: `${turnId}_message`,
        data: {
          text: `Fixture mode recorded the turn: ${prompt}`,
        },
      }),
      fixtureEvent({
        eventId: cursor,
        sequence: nextSequence + 2,
        sessionRef: targetSession.session_ref,
        runId: targetRun.run_id,
        type: "turn.completed",
        turnId,
      }),
    ];
    const updatedSession: JarvisWorkerSession = {
      ...targetSession,
      latest_event_cursor: cursor,
      updated_at: now,
    };
    const updatedRun: JarvisRun = {
      ...targetRun,
      latest_activity_at: now,
      latest_cursor: cursor,
      updated_at: now,
    };
    fixtureSnapshot = {
      ...fixtureSnapshot,
      cursor,
      generated_at: now,
      runs: fixtureSnapshot.runs.map((candidate) =>
        candidate.run_id === updatedRun.run_id ? updatedRun : candidate,
      ),
      sessions: fixtureSnapshot.sessions.map((candidate) =>
        candidate.session_ref === updatedSession.session_ref ? updatedSession : candidate,
      ),
    };
    eventsBySession.set(targetSession.session_ref, [...existingEvents, ...newEvents]);
    return {
      cursor,
      run: updatedRun,
      session: updatedSession,
      events: newEvents,
    };
  };

  const updateFixtureSession = (
    candidateSessionRef: string,
    update: (session: JarvisWorkerSession) => JarvisWorkerSession,
  ): JarvisWorkerSession => {
    const targetSession = findSession(candidateSessionRef) ?? session;
    const updatedSession = update(targetSession);
    const shouldDecrementCapacity =
      targetSession.status === "running" &&
      (updatedSession.status !== "running" || updatedSession.archived_at != null);
    fixtureSnapshot = {
      ...fixtureSnapshot,
      cursor: updatedSession.latest_event_cursor || fixtureSnapshot.cursor,
      generated_at: now,
      sessions: fixtureSnapshot.sessions.map((candidate) =>
        candidate.session_ref === updatedSession.session_ref ? updatedSession : candidate,
      ),
      workers: shouldDecrementCapacity
        ? fixtureSnapshot.workers.map((worker) =>
            worker.worker_id === updatedSession.worker_id
              ? {
                  ...worker,
                  capacity: {
                    ...worker.capacity,
                    active_sessions: Math.max(0, worker.capacity.active_sessions - 1),
                  },
                }
              : worker,
          )
        : fixtureSnapshot.workers,
    };
    return updatedSession;
  };

  const updateFixtureRun = (
    candidateRunId: string,
    update: (run: JarvisRun) => JarvisRun,
  ): JarvisRun => {
    const targetRun = findRun(candidateRunId) ?? run;
    const updatedRun = update(targetRun);
    const archivedSessionRefs = new Set(
      fixtureSnapshot.sessions
        .filter((candidate) => candidate.run_id === updatedRun.run_id)
        .filter((candidate) => candidate.status === "running" || candidate.archived_at == null)
        .map((candidate) => candidate.session_ref),
    );
    fixtureSnapshot = {
      ...fixtureSnapshot,
      cursor: updatedRun.latest_cursor || fixtureSnapshot.cursor,
      generated_at: now,
      runs: fixtureSnapshot.runs.map((candidate) =>
        candidate.run_id === updatedRun.run_id ? updatedRun : candidate,
      ),
      sessions:
        updatedRun.archived_at != null
          ? fixtureSnapshot.sessions.map((candidate) =>
              candidate.run_id === updatedRun.run_id
                ? { ...candidate, archived_at: updatedRun.archived_at, updated_at: now }
                : candidate,
            )
          : fixtureSnapshot.sessions,
      workers:
        updatedRun.archived_at != null
          ? fixtureSnapshot.workers.map((worker) => {
              const archivedActiveCount = fixtureSnapshot.sessions.filter(
                (candidate) =>
                  candidate.worker_id === worker.worker_id &&
                  candidate.status === "running" &&
                  archivedSessionRefs.has(candidate.session_ref),
              ).length;
              return archivedActiveCount > 0
                ? {
                    ...worker,
                    capacity: {
                      ...worker.capacity,
                      active_sessions: Math.max(
                        0,
                        worker.capacity.active_sessions - archivedActiveCount,
                      ),
                    },
                  }
                : worker;
            })
          : fixtureSnapshot.workers,
    };
    return updatedRun;
  };

  return {
    getCatalog: () =>
      Effect.succeed({
        api_version: "v1",
        schema_version: 1,
        engines: [
          {
            engine: "codex",
            display_name: "Codex",
            description: "OpenAI Codex provider session",
            supports: {
              streaming: true,
              resume: true,
              interrupt: true,
              approval_requests: true,
              input_requests: true,
              checkpoints: true,
              attachments: true,
            },
          },
        ],
        capabilities: [
          {
            capability: "code.edit",
            display_name: "Edit code",
            maps_to: ["worker.session.create", "worker.session.turn"],
          },
          {
            capability: "shell.run",
            display_name: "Run shell commands",
            maps_to: ["worker.job.start"],
          },
        ],
        work_sources: ["manual", "github", "linear", "voice", "whatsapp"],
        engine_strategies: ["single", "parallel", "review_panel"],
        branch_strategies: ["auto", "use_existing", "create", "none"],
        landing_policies: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
        request_kinds: ["approval", "input"],
        start_options: {
          sources: ["manual", "github", "linear"],
          engines: ["codex", "claude"],
          engine_strategies: ["single", "parallel"],
          landing_modes: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
          required_fields: {
            manual: ["phrase or work_item.title", "repo (unless a default repo is configured)"],
            github: ["repo (unless a default repo is configured)"],
            linear: [],
          },
          defaults: {
            source: "manual",
            worker_id: "macbook-worker",
            repo: "roughcoder/jarvis",
            engine: "codex",
            engine_strategy: "single",
            landing_mode: "draft_pr",
          },
        },
        generated_at: now,
      }),
    getCapabilities: () =>
      Effect.succeed({
        ok: true,
        checked_at: now,
        catalog: {
          api_version: "v1",
          schema_version: 1,
          engines: [
            {
              engine: "codex",
              display_name: "Codex",
              description: "OpenAI Codex provider session",
              supports: {
                streaming: true,
                resume: true,
                interrupt: true,
                approval_requests: true,
                input_requests: true,
                checkpoints: true,
                attachments: true,
              },
            },
          ],
          capabilities: [
            {
              capability: "code.edit",
              display_name: "Edit code",
              maps_to: ["worker.session.create", "worker.session.turn"],
            },
            {
              capability: "shell.run",
              display_name: "Run shell commands",
              maps_to: ["worker.job.start"],
            },
          ],
          work_sources: ["manual", "github", "linear", "voice", "whatsapp"],
          engine_strategies: ["single", "parallel", "review_panel"],
          branch_strategies: ["auto", "use_existing", "create", "none"],
          landing_policies: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
          request_kinds: ["approval", "input"],
          start_options: {
            sources: ["manual", "github", "linear"],
            engines: ["codex", "claude"],
            engine_strategies: ["single", "parallel"],
            landing_modes: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
            required_fields: {
              manual: ["phrase or work_item.title", "repo (unless a default repo is configured)"],
              github: ["repo (unless a default repo is configured)"],
              linear: [],
            },
            defaults: {
              source: "manual",
              worker_id: "macbook-worker",
              repo: "roughcoder/jarvis",
              engine: "codex",
              engine_strategy: "single",
              landing_mode: "draft_pr",
            },
          },
          generated_at: now,
        },
        routes: JARVIS_CAPABILITY_ROUTE_DEFINITIONS.map((route) => {
          const path = route.path
            .replace("{id}", encodeURIComponent(cockpitProjectId))
            .replace("{tid}", encodeURIComponent("thread_fixture_orchestrator"));
          return route.safeToProbe
            ? makeProbedJarvisCapability({
                route,
                path,
                statusCode: 200,
                probedAt: now,
              })
            : makeUnprobedJarvisCapability(route, "Write route was not probed.");
        }),
      }),
    getMcpStatus: () =>
      Effect.succeed({
        api_version: "v1",
        schema_version: 1,
        serve: {
          configured: true,
          host: "localhost",
          port: 8795,
          auth_mode: "hybrid",
          oauth: {
            configured: true,
            issuer: "http://127.0.0.1:3773",
            resource: "http://127.0.0.1:8795",
            metadata_url: "http://127.0.0.1:8795/.well-known/oauth-protected-resource",
          },
          tokens: { active: 1, revoked: 0 },
          codex_wired: false,
          codex_wired_reason:
            "worker Codex sessions do not currently inject the Jarvis MCP serve endpoint",
        },
      }),
    getSnapshot: () => Effect.succeed(fixtureSnapshot),
    getProjects: (options) =>
      Effect.succeed(
        options?.includeArchived
          ? projects
          : projects.filter((project) => project.status !== "archived"),
      ),
    getProject: (candidateProjectId) => {
      const project = findProject(candidateProjectId);
      return project
        ? Effect.succeed(project)
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.get",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          );
    },
    getProjectMemory: (candidateProjectId) => {
      const project = findProject(candidateProjectId);
      return project
        ? Effect.succeed({
            api_version: "v1" as const,
            schema_version: 1,
            project_id: project.id,
            peer_id: project.peer_id,
            representation:
              project.id === cockpitProjectId
                ? "Jarvis Cockpit is the browser surface for Jarvis projects, worker sessions, and project orchestrator conversations."
                : "Jarvis Runtime owns workers, project registry memory, and Cockpit API orchestration.",
            conclusions: [
              {
                id: `${project.id}:decision:first-class-jarvis`,
                content:
                  "Cockpit treats Jarvis projects and workers as the primary product surface.",
                artifact_type: "decision",
                recorded_by: "fixture",
                observed_at: now,
              },
            ],
          })
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.memory",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          );
    },
    getProjectFiles: (candidateProjectId, options) =>
      Effect.succeed(
        (projectFiles.get(candidateProjectId) ?? []).filter(
          (file) => options?.includeRetracted || !file.retracted,
        ),
      ),
    getProjectThreads: (candidateProjectId, options) =>
      Effect.succeed(
        (projectThreads.get(candidateProjectId) ?? []).filter(
          (thread) => options?.includeArchived || !isProjectThreadArchived(thread),
        ),
      ),
    getProjectThread: (candidateProjectId, threadId) => {
      const thread = findProjectThread(projectThreads, candidateProjectId, threadId);
      if (thread === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.get",
            status: 404,
            message: `No fixture project thread ${candidateProjectId}/${threadId}.`,
          }),
        );
      }
      return Effect.succeed({
        ...thread,
        messages: projectThreadMessages.get(projectThreadKey(candidateProjectId, threadId)) ?? [],
      });
    },
    createProject: (input) => {
      const project = fixtureProjectFromCreateInput(input);
      if (findProject(project.id) !== undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.create",
            status: 409,
            message: `Fixture project ${project.id} already exists.`,
          }),
        );
      }
      projects = [project, ...projects];
      projectThreads.set(project.id, []);
      projectFiles.set(project.id, []);
      return Effect.succeed(project);
    },
    updateProject: (candidateProjectId, input) => {
      const project = findProject(candidateProjectId);
      if (project === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.update",
            status: 404,
            message: `No fixture project ${candidateProjectId}.`,
          }),
        );
      }
      const updated = fixtureProjectFromUpdateInput(project, input);
      projects = projects.map((candidate) =>
        candidate.id === candidateProjectId ? updated : candidate,
      );
      return Effect.succeed(updated);
    },
    archiveProject: (candidateProjectId) => {
      const project = findProject(candidateProjectId);
      if (project === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.archive",
            status: 404,
            message: `No fixture project ${candidateProjectId}.`,
          }),
        );
      }
      const archived = { ...project, status: "archived" };
      projects = projects.map((candidate) =>
        candidate.id === candidateProjectId ? archived : candidate,
      );
      return Effect.succeed(archived);
    },
    deleteProject: (candidateProjectId) => {
      const project = findProject(candidateProjectId);
      if (project === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.delete",
            status: 404,
            message: `No fixture project ${candidateProjectId}.`,
          }),
        );
      }
      projects = projects.filter((candidate) => candidate.id !== candidateProjectId);
      projectThreads.delete(candidateProjectId);
      projectFiles.delete(candidateProjectId);
      return Effect.succeed({
        ok: true,
        project_id: candidateProjectId,
      });
    },
    recordProjectFinding: (candidateProjectId, input) =>
      findProject(candidateProjectId)
        ? Effect.succeed({
            ok: true,
            content_hash: `sha256:fixture-${fixtureIdSlug(input.content)}`,
            artifact_type: "finding",
            project_id: candidateProjectId,
          })
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.findings.create",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          ),
    recordProjectDecision: (candidateProjectId, input) =>
      findProject(candidateProjectId)
        ? Effect.succeed({
            ok: true,
            content_hash: `sha256:fixture-${fixtureIdSlug(input.content)}`,
            artifact_type: "decision",
            project_id: candidateProjectId,
          })
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.decisions.create",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          ),
    forgetProjectMemory: (candidateProjectId, input) =>
      findProject(candidateProjectId)
        ? Effect.succeed({
            ok: true,
            result: input.confirm ? "Forgotten." : "Confirmation required.",
            project_id: candidateProjectId,
          })
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.memory.forget",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          ),
    correctProjectMemory: (candidateProjectId, input) =>
      findProject(candidateProjectId)
        ? Effect.succeed({
            ok: true,
            result: input.confirm ? "Corrected." : "Confirmation required.",
            replacement: input.replacement,
            project_id: candidateProjectId,
          })
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.projects.memory.correct",
              status: 404,
              message: `No fixture project ${candidateProjectId}.`,
            }),
          ),
    uploadProjectFile: (candidateProjectId, input) => {
      if (!findProject(candidateProjectId)) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.files.upload",
            status: 404,
            message: `No fixture project ${candidateProjectId}.`,
          }),
        );
      }
      generatedProjectFileCount += 1;
      const docId = `fixture-${fixtureIdSlug(input.filename)}-${generatedProjectFileCount}`;
      const file: JarvisProjectFile = {
        doc_id: docId,
        title: input.title ?? input.filename,
        session_id: `project:${candidateProjectId}:uploads:${docId}`,
        original_path: `projects/${candidateProjectId}/files/${input.filename}`,
        content_hash: `sha256:${docId}`,
        artifact_type: input.artifact_type ?? "spec",
        uploaded_by: "fixture",
        observed_at: now,
        retracted: false,
        ingestion: { queued: false },
        metadata: { source: "fixture" },
      };
      projectFiles.set(candidateProjectId, [file, ...(projectFiles.get(candidateProjectId) ?? [])]);
      return Effect.succeed({
        ok: true,
        api_version: "v1",
        schema_version: 1,
        project_id: candidateProjectId,
        doc_id: docId,
        file: projectFileJson(file),
      });
    },
    retractProjectFile: (candidateProjectId, docId) => {
      const file = projectFiles
        .get(candidateProjectId)
        ?.find((candidate) => candidate.doc_id === docId);
      if (file === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.files.retract",
            status: 404,
            message: `No fixture project file ${candidateProjectId}/${docId}.`,
          }),
        );
      }
      const retracted = { ...file, retracted: true };
      projectFiles.set(
        candidateProjectId,
        (projectFiles.get(candidateProjectId) ?? []).map((candidate) =>
          candidate.doc_id === docId ? retracted : candidate,
        ),
      );
      return Effect.succeed({
        ok: true,
        api_version: "v1",
        schema_version: 1,
        project_id: candidateProjectId,
        doc_id: docId,
        file: projectFileJson(retracted),
      });
    },
    createProjectThread: (candidateProjectId, input = {}) => {
      const project = findProject(candidateProjectId);
      if (project === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.create",
            status: 404,
            message: `No fixture project ${candidateProjectId}.`,
          }),
        );
      }
      generatedProjectThreadCount += 1;
      const title = firstTrimmed(input.title) ?? `Conversation ${generatedProjectThreadCount}`;
      const threadSlug = fixtureIdSlug(title);
      const thread: JarvisProjectThread = {
        thread_id: JarvisProjectThreadId.make(
          `thread_fixture_${fixtureIdSlug(project.id)}_${threadSlug}_${generatedProjectThreadCount}`,
        ),
        project_id: project.id,
        session_id: `project:${project.id}:orchestrator:thread_fixture_${threadSlug}_${generatedProjectThreadCount}`,
        title,
        created_at: now,
        updated_at: now,
        created_by: "fixture",
      };
      projectThreads.set(candidateProjectId, [
        thread,
        ...(projectThreads.get(candidateProjectId) ?? []),
      ]);
      projectThreadMessages.set(projectThreadKey(candidateProjectId, thread.thread_id), []);
      return Effect.succeed(thread);
    },
    archiveProjectThread: (candidateProjectId, threadId) => {
      const thread = findProjectThread(projectThreads, candidateProjectId, threadId);
      if (thread === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.archive",
            status: 404,
            message: `No fixture project thread ${candidateProjectId}/${threadId}.`,
          }),
        );
      }
      if (isProjectThreadArchived(thread)) {
        return Effect.succeed(thread);
      }
      const archived = {
        ...thread,
        archived_at: now,
        archived_by: "fixture",
        archive_reason: "",
      };
      projectThreads.set(
        candidateProjectId,
        (projectThreads.get(candidateProjectId) ?? []).map((candidate) =>
          candidate.thread_id === threadId ? archived : candidate,
        ),
      );
      return Effect.succeed(archived);
    },
    renameProjectThread: (candidateProjectId, threadId, input) => {
      const thread = findProjectThread(projectThreads, candidateProjectId, threadId);
      if (thread === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.rename",
            status: 404,
            message: `No fixture project thread ${candidateProjectId}/${threadId}.`,
          }),
        );
      }
      const title = normalizeProjectThreadTitle(input.title);
      if (title.length === 0) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.rename",
            status: 400,
            message: "thread title is required",
          }),
        );
      }
      const renamed = {
        ...thread,
        title,
        updated_at: now,
      };
      projectThreads.set(
        candidateProjectId,
        (projectThreads.get(candidateProjectId) ?? []).map((candidate) =>
          candidate.thread_id === threadId ? renamed : candidate,
        ),
      );
      return Effect.succeed(renamed);
    },
    unarchiveProjectThread: (candidateProjectId, threadId) => {
      const thread = findProjectThread(projectThreads, candidateProjectId, threadId);
      if (thread === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.unarchive",
            status: 404,
            message: `No fixture project thread ${candidateProjectId}/${threadId}.`,
          }),
        );
      }
      const unarchived = {
        ...thread,
        archived_at: "",
        archived_by: "",
        archive_reason: "",
      };
      projectThreads.set(
        candidateProjectId,
        (projectThreads.get(candidateProjectId) ?? []).map((candidate) =>
          candidate.thread_id === threadId ? unarchived : candidate,
        ),
      );
      return Effect.succeed(unarchived);
    },
    sendProjectThreadTurn: (candidateProjectId, threadId, input) => {
      const project = findProject(candidateProjectId);
      const thread = findProjectThread(projectThreads, candidateProjectId, threadId);
      if (project === undefined || thread === undefined) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.turn",
            status: 404,
            message: `No fixture project thread ${candidateProjectId}/${threadId}.`,
          }),
        );
      }
      if (isProjectThreadArchived(thread)) {
        return Effect.fail(
          new JarvisClientError({
            operation: "fixture.projects.threads.turn",
            status: 409,
            message: "thread is archived",
          }),
        );
      }
      const workspace = fixtureConversationWorkspace(input.workspace);
      const activeThread =
        workspace === undefined ? thread : { ...thread, updated_at: now, workspace };
      if (workspace !== undefined) {
        projectThreads.set(
          candidateProjectId,
          (projectThreads.get(candidateProjectId) ?? []).map((candidate) =>
            candidate.thread_id === threadId ? activeThread : candidate,
          ),
        );
      }
      const text = `Fixture Jarvis recorded a Codex project conversation for ${project.name}: ${input.text}`;
      const key = projectThreadKey(candidateProjectId, threadId);
      projectThreadMessages.set(key, [
        ...(projectThreadMessages.get(key) ?? []),
        { role: "user", peer_id: "fixture", content: input.text, observed_at: now },
        { role: "assistant", peer_id: "jarvis", content: text, observed_at: now },
      ]);
      return Effect.succeed({
        ok: true,
        text,
        events: [
          {
            event: "thread.turn.started",
            data: { thread_id: activeThread.thread_id, project_id: project.id },
          },
          {
            event: "thread.reply",
            data: { text },
          },
          {
            event: "thread.turn.done",
            data: { thread_id: activeThread.thread_id },
          },
        ],
      });
    },
    getSession: (candidateSessionRef) =>
      findSession(candidateSessionRef)
        ? Effect.succeed(findSession(candidateSessionRef)!)
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.session.get",
              status: 404,
              message: `No fixture session ${candidateSessionRef}.`,
            }),
          ),
    getSessionEvents: (candidateSessionRef) =>
      Effect.succeed({
        items: eventsBySession.get(candidateSessionRef) ?? [],
        cursor: fixtureSnapshot.cursor,
        has_more: false,
      }),
    getRequests: (candidateSessionRef) =>
      Effect.succeed({
        items: requestsBySession.get(candidateSessionRef) ?? [],
        cursor: fixtureSnapshot.cursor,
        has_more: false,
      }),
    getCheckpoints: (candidateSessionRef) =>
      Effect.succeed({
        items: checkpointsBySession.get(candidateSessionRef) ?? [],
        cursor: fixtureSnapshot.cursor,
        has_more: false,
      }),
    validateWork: (workInput) => {
      const source = firstTrimmed(workInput.source) ?? "manual";
      const repo = firstTrimmed(workInput.repo) ?? "roughcoder/jarvis";
      const phrase = firstTrimmed(workInput.phrase, workInput.title, workInput.prompt);
      const missing = source === "manual" && phrase === null ? ["phrase or work_item.title"] : [];
      return Effect.succeed({
        ok: true,
        api_version: "v1" as const,
        schema_version: 1,
        validation: {
          can_start: missing.length === 0,
          source,
          operation: "start_next_work",
          repo,
          worker_id: firstTrimmed(workInput.worker_id) ?? "macbook-worker",
          engine: firstTrimmed(workInput.engine) ?? "codex",
          engines: [firstTrimmed(workInput.engine) ?? "codex"],
          engine_strategy: firstTrimmed(workInput.engine_strategy) ?? "single",
          landing_mode: "draft_pr",
          work_item: null,
          missing,
          missing_authority: [],
          reasons: missing.length > 0 ? ["manual work needs a phrase or title"] : [],
          notes: [],
        },
      });
    },
    pruneWorkerWorktrees: () =>
      Effect.succeed({
        ok: true,
        worktrees: 1,
        bytes: 4096,
        pruned: [{ name: "fixture-stale-worktree", bytes: 4096 }],
        refused: [],
      }),
    startWork: (workInput) => {
      const synthetic = synthesizeStartedWork(workInput);
      return Effect.succeed({
        ok: true,
        cursor: synthetic.cursor,
        run: synthetic.run,
        session: synthetic.session,
        events: [...synthetic.events],
        requests: [],
        artifacts: [...synthetic.artifacts],
      });
    },
    sendTurn: (candidateSessionRef, turnInput) => {
      const synthetic = appendSyntheticTurn(candidateSessionRef, turnInput);
      return Effect.succeed({
        ok: true,
        cursor: synthetic.cursor,
        run: synthetic.run,
        session: synthetic.session,
        events: [...synthetic.events],
        requests: requestsBySession.get(synthetic.session.session_ref) ?? [],
        artifacts: fixtureSnapshot.artifacts.filter(
          (artifact) => artifact.run_id === synthetic.run.run_id,
        ),
      });
    },
    respondApproval: () => Effect.succeed({ ok: true, cursor: "evt_fixture_2", run, session }),
    respondInput: () => Effect.succeed({ ok: true, cursor: "evt_fixture_2", run, session }),
    interruptSession: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: { ...run, status: "interrupted" },
        session: { ...session, status: "interrupted" },
      }),
    stopSession: (candidateSessionRef) => {
      const updatedSession = updateFixtureSession(candidateSessionRef, (targetSession) => ({
        ...targetSession,
        status: "stopped",
        updated_at: now,
      }));
      const updatedRun = findRun(updatedSession.run_id) ?? run;
      return Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: updatedRun,
        session: updatedSession,
      });
    },
    archiveSession: (candidateSessionRef) => {
      const updatedSession = updateFixtureSession(candidateSessionRef, (targetSession) => ({
        ...targetSession,
        archived_at: now,
        updated_at: now,
      }));
      const updatedRun = findRun(updatedSession.run_id) ?? run;
      return Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: updatedRun,
        session: updatedSession,
      });
    },
    archiveRun: (candidateRunId) => {
      const updatedRun = updateFixtureRun(candidateRunId, (targetRun) => ({
        ...targetRun,
        archived_at: now,
        updated_at: now,
      }));
      const archivedSession =
        fixtureSnapshot.sessions.find((candidate) => candidate.run_id === updatedRun.run_id) ??
        session;
      return Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: updatedRun,
        session: archivedSession,
      });
    },
    deleteSession: (candidateSessionRef) => {
      const targetSession = findSession(candidateSessionRef) ?? session;
      const events = eventsBySession.get(targetSession.session_ref) ?? [];
      const requests = requestsBySession.get(targetSession.session_ref) ?? [];
      const checkpoints = checkpointsBySession.get(targetSession.session_ref) ?? [];
      fixtureSnapshot = {
        ...fixtureSnapshot,
        generated_at: now,
        sessions: fixtureSnapshot.sessions.filter(
          (candidate) => candidate.session_ref !== targetSession.session_ref,
        ),
      };
      eventsBySession.delete(targetSession.session_ref);
      requestsBySession.delete(targetSession.session_ref);
      checkpointsBySession.delete(targetSession.session_ref);
      return Effect.succeed({
        ok: true,
        deleted: true,
        reclamation: {
          records: 1 + requests.length + checkpoints.length,
          events: events.length,
          worktrees: 0,
          bytes: 0,
        },
      });
    },
    deleteRun: (candidateRunId) => {
      const targetRun = findRun(candidateRunId) ?? run;
      const removedSessions = fixtureSnapshot.sessions.filter(
        (candidate) => candidate.run_id === targetRun.run_id,
      );
      fixtureSnapshot = {
        ...fixtureSnapshot,
        generated_at: now,
        runs: fixtureSnapshot.runs.filter((candidate) => candidate.run_id !== targetRun.run_id),
        sessions: fixtureSnapshot.sessions.filter(
          (candidate) => candidate.run_id !== targetRun.run_id,
        ),
      };
      let eventCount = 0;
      for (const removedSession of removedSessions) {
        eventCount += eventsBySession.get(removedSession.session_ref)?.length ?? 0;
        eventsBySession.delete(removedSession.session_ref);
        requestsBySession.delete(removedSession.session_ref);
        checkpointsBySession.delete(removedSession.session_ref);
      }
      return Effect.succeed({
        ok: true,
        deleted: true,
        reclamation: {
          records: 1 + removedSessions.length,
          events: eventCount,
          worktrees: 0,
          bytes: 0,
        },
      });
    },
    closeSession: (candidateSessionRef) => {
      const updatedSession = updateFixtureSession(candidateSessionRef, (targetSession) => ({
        ...targetSession,
        archived_at: now,
        status: "stopped",
        updated_at: now,
      }));
      return Effect.succeed({
        ok: true,
        deleted: false,
        reclamation: {
          records: 0,
          events: eventsBySession.get(updatedSession.session_ref)?.length ?? 0,
          worktrees: 0,
          bytes: 0,
        },
      });
    },
    restoreCheckpoint: (_sessionRef, restoreInput) =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run,
        session,
        events: [
          {
            event_id: JarvisSessionEvent.fields.event_id.make("evt_fixture_checkpoint_restored"),
            sequence: 3,
            session_ref: session.session_ref,
            run_id: session.run_id,
            type: "checkpoint.restored",
            occurred_at: now,
            turn_id: "turn_fixture_1",
            message_id: null,
            data: {
              checkpoint_id: restoreInput.checkpoint_id,
            },
          },
        ],
      }),
    resumeRun: (candidateRunId, resumeInput) =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: {
          ...run,
          run_id: JarvisRunId.make(candidateRunId === "latest" ? run.run_id : candidateRunId),
        },
        session,
        events: [
          {
            event_id: JarvisSessionEvent.fields.event_id.make("evt_fixture_resume"),
            sequence: 3,
            session_ref: session.session_ref,
            run_id: run.run_id,
            type: "turn.started",
            occurred_at: now,
            turn_id:
              typeof resumeInput?.turn_id === "string"
                ? resumeInput.turn_id
                : "turn_fixture_resume",
            message_id: null,
            data: {
              prompt:
                typeof resumeInput?.prompt === "string"
                  ? resumeInput.prompt
                  : "Continue from the current state.",
            },
          },
        ],
      }),
  };
}

let sharedJarvisFixtureClients: Map<string, JarvisClient> | undefined;

function makeSharedJarvisFixtureClient(options?: JarvisFixtureClientOptions): JarvisClient {
  const key = options?.emptyProjects === true ? "empty-projects" : "default";
  sharedJarvisFixtureClients ??= new Map();
  const existing = sharedJarvisFixtureClients.get(key);
  if (existing) {
    return existing;
  }
  const client = makeJarvisFixtureClient(options);
  sharedJarvisFixtureClients.set(key, client);
  return client;
}

function parseProjectThreadTurnResponse(
  operation: string,
  text: string,
): Effect.Effect<JarvisProjectThreadTurnResult, JarvisClientError> {
  const trimmed = text.trim();
  if (trimmed.length > 0 && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    try {
      const body = JSON.parse(trimmed) as unknown;
      return decodeFor(operation, decodeProjectThreadTurnResult)(body);
    } catch (cause) {
      return Effect.fail(
        new JarvisClientError({
          operation,
          message: `Jarvis response for ${operation} was not valid JSON.`,
          cause,
        }),
      );
    }
  }
  return Effect.succeed(parseProjectThreadTurnSse(text));
}

function parseProjectThreadTurnSse(text: string): JarvisProjectThreadTurnResult {
  const events: Record<string, Schema.Json>[] = [];
  const replyParts: string[] = [];
  for (const block of text.split(/\r?\n\r?\n/u)) {
    const trimmedBlock = block.trim();
    if (trimmedBlock.length === 0) {
      continue;
    }
    let eventType = "message";
    const dataLines: string[] = [];
    for (const line of trimmedBlock.split(/\r?\n/u)) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    const dataText = dataLines.join("\n");
    let data: unknown = dataText;
    if (dataText.length > 0) {
      try {
        data = JSON.parse(dataText);
      } catch {
        data = dataText;
      }
    }
    events.push({ event: eventType, data: data as Schema.Json });
    if (eventType === "thread.reply") {
      if (typeof data === "string") {
        replyParts.push(data);
      } else if (isRecord(data)) {
        const candidate = data.text ?? data.reply ?? data.content;
        if (typeof candidate === "string") {
          replyParts.push(candidate);
        }
      }
    }
  }
  return {
    ok: true,
    text: replyParts.join(""),
    events,
  };
}

function appendQuery(path: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}

function isFormDataBody(body: Exclude<RequestInit["body"], null | undefined>): boolean {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function projectFileUploadFormData(input: JarvisProjectFileUploadInput): FormData {
  const payload = withSurfaceMetadata(input);
  const formData = new FormData();
  const mimeType = payload.mime_type ?? "application/octet-stream";
  const content = NodeBuffer.Buffer.from(payload.content_base64, "base64");
  formData.append("file", new Blob([content], { type: mimeType }), payload.filename);
  if (payload.title !== undefined) {
    formData.append("title", payload.title);
  }
  if (payload.artifact_type !== undefined) {
    formData.append("artifact_type", payload.artifact_type);
  }
  if (payload.idempotency_key !== undefined) {
    formData.append("idempotency_key", payload.idempotency_key);
  }
  formData.append("metadata", JSON.stringify(payload.metadata));
  return formData;
}

function projectFileJson(file: JarvisProjectFile): JsonObjectType {
  return {
    doc_id: file.doc_id,
    title: file.title ?? "",
    session_id: file.session_id ?? "",
    original_path: file.original_path ?? "",
    content_hash: file.content_hash ?? "",
    artifact_type: file.artifact_type ?? "",
    uploaded_by: file.uploaded_by ?? "",
    observed_at: file.observed_at ?? "",
    retracted: file.retracted,
    ingestion: file.ingestion ?? {},
    metadata: file.metadata ?? {},
  };
}

function firstTrimmed(...values: ReadonlyArray<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function normalizeProjectThreadTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, 200);
}

function fixtureIdSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "work";
}

function truncateResponseBody(text: string): string {
  return text.length <= 4_000 ? text : `${text.slice(0, 4_000)}...`;
}

function summarizeHttpError(operation: string, status: number, responseBody: string): string {
  const detail = extractHttpErrorDetail(responseBody);
  return `Jarvis request ${operation} failed with HTTP ${status}${detail ? `: ${detail}` : "."}`;
}

function extractHttpErrorDetail(responseBody: string): string | null {
  if (responseBody.trim().length === 0) {
    return null;
  }
  try {
    const body = JSON.parse(responseBody) as unknown;
    const detail = errorDetailFromBody(body);
    return detail === null ? null : truncateErrorDetail(detail);
  } catch {
    return null;
  }
}

function errorDetailFromBody(body: unknown): string | null {
  if (typeof body === "string") {
    return body.trim() || null;
  }
  if (!isRecord(body)) {
    return null;
  }
  if (typeof body.error === "string") {
    return body.error.trim() || null;
  }
  if (isRecord(body.error)) {
    return firstTrimmed(body.error.message, body.error.code);
  }
  return firstTrimmed(body.message, body.code);
}

function truncateErrorDetail(detail: string): string {
  return detail.length <= 300 ? detail : `${detail.slice(0, 300)}...`;
}

function normalizeSessionEventsPage(body: unknown, sessionRef: string): unknown {
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return body;
  }
  return {
    ...body,
    items: body.items.map((item) => {
      if (!isRecord(item)) {
        return item;
      }
      const runId = typeof item.run_id === "string" ? item.run_id.trim() : "";
      return runId.length > 0
        ? item
        : {
            ...item,
            run_id: `session:${sessionRef}`,
          };
    }),
  };
}
