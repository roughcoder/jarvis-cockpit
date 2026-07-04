import {
  JarvisApprovalInput,
  JarvisArchiveInput,
  JarvisArtifact,
  JarvisCockpitCatalog,
  JarvisControlResult,
  DEFAULT_JARVIS_API_BASE_URL,
  type JarvisBrainCheckResult,
  type JarvisBrainConnection,
  type JarvisConnectionSource,
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
  type ServerSettings,
  type ServerSettingsError,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../config.ts";

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
  readonly getSnapshot: () => Effect.Effect<JarvisRunsSnapshot, JarvisClientError>;
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

type JarvisConnectionConfig = Pick<
  ServerConfig["Service"],
  "jarvisCockpitEnabled" | "jarvisApiBaseUrl" | "jarvisApiToken" | "jarvisFixtureMode"
>;

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
  };
}

function makeJarvisClientFromConnection(input: {
  readonly config: JarvisConnectionConfig;
  readonly settings: ServerSettings;
}): JarvisClient {
  if (input.config.jarvisFixtureMode) {
    return makeJarvisFixtureClient();
  }
  if (!input.config.jarvisCockpitEnabled) {
    return makeMissingConfigurationClient("Jarvis cockpit mode is disabled.");
  }
  const connection = resolveJarvisBrainConnection(input.config, input.settings);
  const baseUrl = new URL(connection.apiBaseUrl);
  const token = input.config.jarvisApiToken ?? input.settings.jarvis.apiToken.trim();
  return makeJarvisCockpitClient({
    baseUrl,
    ...(token.length > 0 ? { token } : {}),
  });
}

const decodeCatalog = Schema.decodeUnknownEffect(JarvisCockpitCatalog);
const decodeSnapshot = Schema.decodeUnknownEffect(JarvisRunsSnapshot);
const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeStartWorkValidationResult = Schema.decodeUnknownEffect(JarvisStartWorkValidationResult);
const decodeSessionDetail = Schema.decodeUnknownEffect(JarvisSessionDetailResponse);
const decodeSessionEventsPage = Schema.decodeUnknownEffect(JarvisSessionEventsPage);
const decodeSessionRequestsPage = Schema.decodeUnknownEffect(JarvisSessionRequestsPage);
const decodeSessionRequestsResponse = Schema.decodeUnknownEffect(JarvisSessionRequestsResponse);
const decodeSessionCheckpointsPage = Schema.decodeUnknownEffect(JarvisSessionCheckpointsPage);
const decodeSessionCheckpointsResponse = Schema.decodeUnknownEffect(
  JarvisSessionCheckpointsResponse,
);

const mapDecodeError = (operation: string) => (cause: unknown) =>
  new JarvisClientError({
    operation,
    message: `Jarvis response for ${operation} did not match the expected contract.`,
    cause,
  });

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function makeJarvisCockpitClient(input: {
  readonly baseUrl: URL;
  readonly token?: string;
  readonly fetch?: FetchLike;
}): JarvisClient {
  const fetchImpl = input.fetch ?? fetch;
  const requestJson = (operation: string, path: string, init?: RequestInit) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetchImpl(new URL(path, input.baseUrl), {
          ...init,
          headers: {
            accept: "application/json",
            ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
            ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
            ...init?.headers,
          },
        });
        const text = await response.text();
        if (!response.ok) {
          throw new JarvisClientError({
            operation,
            status: response.status,
            responseBody: truncateResponseBody(text),
            message: `Jarvis request ${operation} failed with HTTP ${response.status}.`,
          });
        }
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        const body = text.trim().length > 0 ? JSON.parse(text) : {};
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
    });

  const postJson = (operation: string, path: string, payload: unknown) =>
    requestJson(operation, path, {
      method: "POST",
      body: JSON.stringify(payload),
    });

  return {
    getCatalog: () =>
      requestJson("cockpit.catalog", "/v1/cockpit/catalog").pipe(
        Effect.flatMap(decodeFor("cockpit.catalog", decodeCatalog)),
      ),
    getSnapshot: () =>
      requestJson("cockpit.snapshot", "/v1/cockpit/snapshot?sync=probe").pipe(
        Effect.flatMap(decodeFor("cockpit.snapshot", decodeSnapshot)),
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
      ).pipe(Effect.flatMap(decodeFor("sessions.events", decodeSessionEventsPage))),
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
      postJson(
        "work.start",
        "/v1/work/start",
        withSurfaceMetadata(workInput),
      ).pipe(
        Effect.flatMap(decodeFor("work.start", decodeControlResult)),
      ),
    validateWork: (workInput) =>
      postJson("work.validate", "/v1/work/validate", withSurfaceMetadata(workInput)).pipe(
        Effect.flatMap(decodeFor("work.validate", decodeStartWorkValidationResult)),
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
  readonly getSettings?: Effect.Effect<ServerSettings, ServerSettingsError>;
}): JarvisClient {
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
            try: () => makeJarvisClientFromConnection({ config, settings }),
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
      getSnapshot: () => withClient("cockpit.snapshot", (client) => client.getSnapshot()),
      getSession: (sessionRef) =>
        withClient("sessions.get", (client) => client.getSession(sessionRef)),
      getSessionEvents: (sessionRef, options) =>
        withClient("sessions.events", (client) => client.getSessionEvents(sessionRef, options)),
      getRequests: (sessionRef, options) =>
        withClient("sessions.requests", (client) => client.getRequests(sessionRef, options)),
      getCheckpoints: (sessionRef, options) =>
        withClient("sessions.checkpoints", (client) => client.getCheckpoints(sessionRef, options)),
      startWork: (input) => withClient("work.start", (client) => client.startWork(input)),
      validateWork: (input) =>
        withClient("work.validate", (client) => client.validateWork(input)),
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
      restoreCheckpoint: (sessionRef, input) =>
        withClient("sessions.checkpoints.restore", (client) =>
          client.restoreCheckpoint(sessionRef, input),
        ),
      resumeRun: (runId, input) =>
        withClient("work.resume", (client) => client.resumeRun(runId, input)),
    };
  }

  if (config.jarvisFixtureMode) {
    return makeJarvisFixtureClient();
  }
  if (!config.jarvisCockpitEnabled) {
    return makeMissingConfigurationClient("Jarvis cockpit mode is disabled.");
  }
  return makeJarvisCockpitClient({
    baseUrl: config.jarvisApiBaseUrl ?? new URL(DEFAULT_JARVIS_API_BASE_URL),
    ...(config.jarvisApiToken ? { token: config.jarvisApiToken } : {}),
  });
}

export function checkJarvisBrain(input: {
  readonly config: JarvisConnectionConfig;
  readonly settings: ServerSettings;
  readonly apiBaseUrl?: string;
  readonly apiToken?: string;
  readonly fetch?: FetchLike;
}): Effect.Effect<JarvisBrainCheckResult, JarvisClientError> {
  return Effect.tryPromise({
    try: async () => {
      const connection = resolveJarvisBrainConnection(input.config, input.settings);
      const apiBaseUrl = input.apiBaseUrl?.trim() || connection.apiBaseUrl;
      const apiToken =
        input.apiToken !== undefined
          ? input.apiToken.trim()
          : input.config.jarvisApiToken ?? input.settings.jarvis.apiToken.trim();
      const checkedAt = DateTime.formatIso(DateTime.nowUnsafe());
      let healthUrl: URL;
      try {
        healthUrl = new URL("/v1/health", new URL(apiBaseUrl));
      } catch (cause) {
        return {
          ok: false,
          checkedAt,
          apiBaseUrl,
          message: "Jarvis brain URL is not valid.",
          response: { cause: cause instanceof Error ? cause.message : String(cause) },
        };
      }

      const response = await (input.fetch ?? fetch)(healthUrl, {
        headers: {
          accept: "application/json",
          ...(apiToken.length > 0 ? { authorization: `Bearer ${apiToken}` } : {}),
        },
      });
      const text = await response.text();
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
    getSnapshot: () => fail("jarvis.client.configure"),
    getSession: () => fail("jarvis.client.configure"),
    getSessionEvents: () => fail("jarvis.client.configure"),
    getRequests: () => fail("jarvis.client.configure"),
    getCheckpoints: () => fail("jarvis.client.configure"),
    startWork: () => fail("jarvis.client.configure"),
    validateWork: () => fail("jarvis.client.configure"),
    sendTurn: () => fail("jarvis.client.configure"),
    respondApproval: () => fail("jarvis.client.configure"),
    respondInput: () => fail("jarvis.client.configure"),
    interruptSession: () => fail("jarvis.client.configure"),
    stopSession: () => fail("jarvis.client.configure"),
    archiveSession: () => fail("jarvis.client.configure"),
    archiveRun: () => fail("jarvis.client.configure"),
    restoreCheckpoint: () => fail("jarvis.client.configure"),
    resumeRun: () => fail("jarvis.client.configure"),
  };
}

export function makeJarvisFixtureClient(): JarvisClient {
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
    runs: [run],
    sessions: [session],
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
            },
          },
        ],
        capacity: {
          max_sessions: 4,
          active_sessions: 1,
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
        ],
        public_metadata: {},
      },
    ],
    artifacts: [
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
          text: `Fixture mode started "${title}". Connect a real Jarvis API to execute this work with live workers.`,
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
      artifact_id: `artifact_fixture_${runSlug}_${generatedWorkCount}_branch` as JarvisArtifact["artifact_id"],
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
    getSnapshot: () => Effect.succeed(fixtureSnapshot),
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
      const missing =
        source === "manual" && phrase === null ? ["phrase or work_item.title"] : [];
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
    stopSession: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: { ...run, status: "stopped" },
        session: { ...session, status: "stopped" },
      }),
    archiveSession: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run,
        session: { ...session, archived_at: now },
      }),
    archiveRun: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_3",
        run: { ...run, archived_at: now },
        session,
      }),
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
