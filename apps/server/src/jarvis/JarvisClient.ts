import {
  JarvisApprovalInput,
  JarvisArchiveInput,
  JarvisCockpitCatalog,
  JarvisControlResult,
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
  JarvisTurnInput,
  JarvisUserInputInput,
  JarvisWorkerSession,
  JarvisWorkerSessionId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
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
  ) => Effect.Effect<JarvisSessionRequestsPage, JarvisClientError>;
  readonly getCheckpoints: (
    sessionRef: string,
    options?: { readonly after?: string; readonly limit?: number },
  ) => Effect.Effect<JarvisSessionCheckpointsPage, JarvisClientError>;
  readonly startWork: (
    input: JarvisStartWorkInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError | JarvisMissingContractError>;
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

const decodeCatalog = Schema.decodeUnknownEffect(JarvisCockpitCatalog);
const decodeSnapshot = Schema.decodeUnknownEffect(JarvisRunsSnapshot);
const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeSessionDetail = Schema.decodeUnknownEffect(JarvisSessionDetailResponse);
const decodeSessionEventsPage = Schema.decodeUnknownEffect(JarvisSessionEventsPage);
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
        // @effect-diagnostics-next-line preferSchemaOverJson:off
        const body = text.trim().length > 0 ? JSON.parse(text) : {};
        if (!response.ok) {
          throw new JarvisClientError({
            operation,
            status: response.status,
            responseBody: truncateResponseBody(text),
            message: `Jarvis request ${operation} failed with HTTP ${response.status}.`,
          });
        }
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
      requestJson("cockpit.snapshot", "/v1/cockpit/snapshot?sync=fast").pipe(
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
    getRequests: (sessionRef) =>
      requestJson(
        "sessions.requests",
        `/v1/sessions/${encodeURIComponent(sessionRef)}/requests`,
      ).pipe(
        Effect.flatMap(decodeFor("sessions.requests", decodeSessionRequestsResponse)),
        Effect.map(
          (response): JarvisSessionRequestsPage => ({
            items: response.requests,
            cursor: null,
            has_more: false,
          }),
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
          run_id: runId,
          prompt:
            typeof resumeInput?.prompt === "string" && resumeInput.prompt.trim().length > 0
              ? resumeInput.prompt
              : "Continue from the current state.",
          ...resumeInput,
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
}): JarvisClient {
  if (config.jarvisFixtureMode || !config.jarvisCockpitEnabled) {
    return makeJarvisFixtureClient();
  }
  if (config.jarvisApiBaseUrl !== undefined) {
    return makeJarvisCockpitClient({
      baseUrl: config.jarvisApiBaseUrl,
      ...(config.jarvisApiToken ? { token: config.jarvisApiToken } : {}),
    });
  }
  return makeMissingConfigurationClient(
    "JARVIS_API_BASE_URL is required when JARVIS_COCKPIT_ENABLED=true unless JARVIS_FIXTURE_MODE=true.",
  );
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
  const snapshot: JarvisRunsSnapshot = {
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
        generated_at: now,
      }),
    getSnapshot: () => Effect.succeed(snapshot),
    getSession: (candidateSessionRef) =>
      candidateSessionRef === session.session_ref
        ? Effect.succeed(session)
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.session.get",
              status: 404,
              message: `No fixture session ${candidateSessionRef}.`,
            }),
          ),
    getSessionEvents: (candidateSessionRef) =>
      Effect.succeed({
        items: candidateSessionRef === session.session_ref ? events : [],
        cursor: "evt_fixture_2",
        has_more: false,
      }),
    getRequests: (candidateSessionRef) =>
      Effect.succeed({
        items: candidateSessionRef === session.session_ref ? [request] : [],
        cursor: "evt_fixture_2",
        has_more: false,
      }),
    getCheckpoints: (candidateSessionRef) =>
      Effect.succeed({
        items: candidateSessionRef === session.session_ref ? [checkpoint] : [],
        cursor: "evt_fixture_2",
        has_more: false,
      }),
    startWork: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_2",
        run,
        session,
        events: [...events],
        requests: [request],
        artifacts: [...snapshot.artifacts],
      }),
    sendTurn: () =>
      Effect.succeed({
        ok: true,
        cursor: "evt_fixture_2",
        run,
        session,
        events: [...events],
        requests: [request],
        artifacts: [...snapshot.artifacts],
      }),
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

function truncateResponseBody(text: string): string {
  return text.length <= 4_000 ? text : `${text.slice(0, 4_000)}...`;
}
