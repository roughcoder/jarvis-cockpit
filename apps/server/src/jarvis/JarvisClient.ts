import {
  JarvisApprovalInput,
  JarvisControlResult,
  JarvisRequestId,
  JarvisRestoreCheckpointInput,
  JarvisRun,
  JarvisRunId,
  JarvisRunsSnapshot,
  JarvisSessionCheckpointsPage,
  JarvisSessionEvent,
  JarvisSessionEventsPage,
  JarvisSessionRequestsPage,
  JarvisStartWorkInput,
  JarvisTurnInput,
  JarvisUserInputInput,
  JarvisWorkerSession,
  JarvisWorkerSessionId,
  type JarvisWorkerSessionStatus,
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
  readonly getSnapshot: () => Effect.Effect<JarvisRunsSnapshot, JarvisClientError>;
  readonly getSession: (sessionId: string) => Effect.Effect<JarvisWorkerSession, JarvisClientError>;
  readonly getSessionEvents: (
    sessionId: string,
    options?: { readonly after?: string; readonly limit?: number },
  ) => Effect.Effect<JarvisSessionEventsPage, JarvisClientError>;
  readonly getRequests: (
    sessionId?: string,
  ) => Effect.Effect<JarvisSessionRequestsPage, JarvisClientError>;
  readonly getCheckpoints: (
    sessionId: string,
  ) => Effect.Effect<JarvisSessionCheckpointsPage, JarvisClientError>;
  readonly startWork: (
    input: JarvisStartWorkInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError | JarvisMissingContractError>;
  readonly sendTurn: (
    sessionId: string,
    input: JarvisTurnInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly respondApproval: (
    sessionId: string,
    input: JarvisApprovalInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly respondInput: (
    sessionId: string,
    input: JarvisUserInputInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly interruptSession: (
    sessionId: string,
    turnId?: string,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly stopSession: (
    sessionId: string,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly restoreCheckpoint: (
    sessionId: string,
    input: JarvisRestoreCheckpointInput,
  ) => Effect.Effect<JarvisControlResult, JarvisClientError>;
  readonly resumeRun: (
    runId: string,
    input?: Record<string, unknown>,
  ) => Effect.Effect<JarvisControlResult, JarvisMissingContractError>;
}

export class JarvisClientService extends Context.Service<JarvisClientService, JarvisClient>()(
  "t3/jarvis/JarvisClient/JarvisClientService",
) {}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const WorkerSessionListEntry = Schema.Struct({
  session_id: JarvisWorkerSessionId,
  provider: Schema.optional(Schema.String),
  engine: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  run_id: Schema.optional(Schema.String),
  repo: Schema.optional(Schema.NullOr(Schema.String)),
  branch: Schema.optional(Schema.NullOr(Schema.String)),
  cwd: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(Schema.String),
  worker_id: Schema.optional(Schema.String),
  created_at: Schema.optional(Schema.String),
  updated_at: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Unknown),
});
type WorkerSessionListEntry = typeof WorkerSessionListEntry.Type;

const WorkerSessionListResponse = Schema.Struct({
  sessions: Schema.Array(WorkerSessionListEntry),
});
const SessionEventsResponse = Schema.Struct({
  events: Schema.Array(JarvisSessionEvent),
});

const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeWorkerSession = Schema.decodeUnknownEffect(JarvisWorkerSession);
const decodeWorkerSessionList = Schema.decodeUnknownEffect(WorkerSessionListResponse);
const decodeSessionEvents = Schema.decodeUnknownEffect(SessionEventsResponse);
const decodeSessionRequestsPage = Schema.decodeUnknownEffect(JarvisSessionRequestsPage);
const decodeSessionCheckpointsPage = Schema.decodeUnknownEffect(JarvisSessionCheckpointsPage);

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

export function makeJarvisWorkerSessionClient(input: {
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

  const decodeSession = (operation: string, input: unknown) =>
    decodeFor(operation, decodeWorkerSession)(input);

  const getSessionById = (sessionId: string) =>
    requestJson("sessions.get", `/sessions/${encodeURIComponent(sessionId)}`).pipe(
      Effect.flatMap((body) => decodeSession("sessions.get", body)),
    );

  const hydrateListEntry = (
    entry: WorkerSessionListEntry,
  ): Effect.Effect<JarvisWorkerSession, JarvisClientError> => {
    if (
      typeof entry.provider === "string" &&
      typeof entry.engine === "string" &&
      typeof entry.status === "string" &&
      typeof entry.created_at === "string" &&
      typeof entry.updated_at === "string"
    ) {
      return decodeSession("sessions.list", entry);
    }
    return getSessionById(entry.session_id);
  };

  return {
    getSnapshot: () =>
      requestJson("sessions.list", "/sessions").pipe(
        Effect.flatMap(decodeFor("sessions.list", decodeWorkerSessionList)),
        Effect.flatMap((response) => Effect.all(response.sessions.map(hydrateListEntry))),
        Effect.map(snapshotFromSessions),
      ),
    getSession: getSessionById,
    getSessionEvents: (sessionId, options) =>
      requestJson(
        "sessions.events",
        appendQuery(`/sessions/${encodeURIComponent(sessionId)}/events`, {
          after: options?.after,
          limit: options?.limit,
        }),
      ).pipe(
        Effect.flatMap(decodeFor("sessions.events", decodeSessionEvents)),
        Effect.map((response) => ({
          session_id: JarvisWorkerSession.fields.session_id.make(sessionId),
          events: response.events,
          cursor: null,
        })),
      ),
    getRequests: (sessionId) =>
      requestJson(
        "sessions.requests",
        sessionId === undefined
          ? "/sessions/requests"
          : `/sessions/${encodeURIComponent(sessionId)}/requests`,
      ).pipe(Effect.flatMap(decodeFor("sessions.requests", decodeSessionRequestsPage))),
    getCheckpoints: (sessionId) =>
      requestJson(
        "sessions.checkpoints",
        `/sessions/${encodeURIComponent(sessionId)}/checkpoints`,
      ).pipe(Effect.flatMap(decodeFor("sessions.checkpoints", decodeSessionCheckpointsPage))),
    startWork: (workInput) => {
      const metadata = workInput.metadata ?? {};
      return postJson("sessions.create", "/sessions", {
        run_id: "run_t3_dev_session",
        provider: workInput.provider ?? workInput.engine ?? "codex",
        engine: workInput.engine ?? workInput.provider ?? "codex",
        repo: workInput.repo ?? "",
        branch: workInput.branch ?? "",
        title: workInput.title,
        metadata: {
          ...metadata,
          objective: workInput.objective,
          prompt: workInput.prompt,
          surface: "t3",
          execution_envelope: metadata.execution_envelope ?? {
            run_id: "run_t3_dev_session",
            allowed_actions: ["worker.session.create", "worker.session.turn"],
            landing: {
              mode: "branch_only",
              allow_merge: false,
            },
          },
        },
      }).pipe(Effect.flatMap(decodeFor("sessions.create", decodeControlResult)));
    },
    sendTurn: (sessionId, turnInput) =>
      postJson("sessions.turn", `/sessions/${encodeURIComponent(sessionId)}/turns`, turnInput).pipe(
        Effect.flatMap(decodeFor("sessions.turn", decodeControlResult)),
      ),
    respondApproval: (sessionId, approvalInput) =>
      postJson(
        "sessions.approval",
        `/sessions/${encodeURIComponent(sessionId)}/approval`,
        approvalInput,
      ).pipe(Effect.flatMap(decodeFor("sessions.approval", decodeControlResult))),
    respondInput: (sessionId, userInput) =>
      postJson(
        "sessions.input",
        `/sessions/${encodeURIComponent(sessionId)}/input`,
        userInput,
      ).pipe(Effect.flatMap(decodeFor("sessions.input", decodeControlResult))),
    interruptSession: (sessionId, turnId) =>
      postJson(
        "sessions.interrupt",
        `/sessions/${encodeURIComponent(sessionId)}/interrupt`,
        turnId ? { turn_id: turnId } : {},
      ).pipe(Effect.flatMap(decodeFor("sessions.interrupt", decodeControlResult))),
    stopSession: (sessionId) =>
      postJson("sessions.stop", `/sessions/${encodeURIComponent(sessionId)}/stop`, {}).pipe(
        Effect.flatMap(decodeFor("sessions.stop", decodeControlResult)),
      ),
    restoreCheckpoint: (sessionId, restoreInput) =>
      postJson(
        "sessions.checkpoints.restore",
        `/sessions/${encodeURIComponent(sessionId)}/checkpoints/restore`,
        restoreInput,
      ).pipe(Effect.flatMap(decodeFor("sessions.checkpoints.restore", decodeControlResult))),
    resumeRun: (runId) =>
      Effect.fail(
        new JarvisMissingContractError({
          operation: "runs.resume",
          missing: `No Jarvis resume endpoint is defined for run ${runId}.`,
        }),
      ),
  };
}

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
    return makeJarvisWorkerSessionClient({
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
    restoreCheckpoint: () => fail("jarvis.client.configure"),
    resumeRun: () =>
      Effect.fail(
        new JarvisMissingContractError({
          operation: "runs.resume",
          missing: message,
        }),
      ),
  };
}

export function makeJarvisFixtureClient(): JarvisClient {
  const now = "2026-06-30T18:00:00+00:00";
  const session: JarvisWorkerSession = {
    session_id: JarvisWorkerSession.fields.session_id.make("sess_fixture_codex"),
    provider: "codex",
    engine: "codex",
    status: "waiting_provider",
    run_id: JarvisRunId.make("run_fixture_dashboard"),
    repo: "roughcoder/jarvis",
    branch: "jarvis/fixture-agentic-cockpit",
    cwd: "/Users/neilbarton/Development/jarvis",
    title: "Fixture worker session",
    created_at: now,
    updated_at: now,
    metadata: {
      surface: "t3",
    },
  };
  const snapshot = snapshotFromSessions([session]);
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: JarvisSessionEvent.fields.event_id.make("ev_fixture_created"),
      session_id: session.session_id,
      type: "session.created",
      time: now,
      data: {
        provider: "codex",
        engine: "codex",
      },
    },
    {
      event_id: JarvisSessionEvent.fields.event_id.make("ev_fixture_waiting"),
      session_id: session.session_id,
      type: "turn.waiting_provider",
      time: now,
      data: {
        turn_id: "turn_fixture_1",
        message: "provider adapter not attached yet",
      },
    },
  ];

  return {
    getSnapshot: () => Effect.succeed(snapshot),
    getSession: (sessionId) =>
      sessionId === session.session_id
        ? Effect.succeed(session)
        : Effect.fail(
            new JarvisClientError({
              operation: "fixture.session.get",
              status: 404,
              message: `No fixture session ${sessionId}.`,
            }),
          ),
    getSessionEvents: (sessionId) =>
      Effect.succeed({
        session_id: JarvisWorkerSession.fields.session_id.make(sessionId),
        events,
        cursor: null,
      }),
    getRequests: (sessionId) =>
      Effect.succeed({
        requests:
          sessionId === undefined || sessionId === session.session_id
            ? [
                {
                  session_id: session.session_id,
                  request_id: JarvisRequestId.make("input_fixture_1"),
                  kind: "input",
                  status: "pending",
                  event: {
                    type: "input.requested",
                    request_id: "input_fixture_1",
                    prompt: "Provider adapter not attached yet.",
                  },
                },
              ]
            : [],
      }),
    getCheckpoints: (sessionId) =>
      Effect.succeed({
        checkpoints:
          sessionId === session.session_id
            ? [
                {
                  session_id: session.session_id,
                  checkpoint_id: "ckpt_fixture_1",
                  label: "Fixture checkpoint",
                  provider: "codex",
                  restored: false,
                  event: {
                    type: "checkpoint.created",
                    checkpoint_id: "ckpt_fixture_1",
                    label: "Fixture checkpoint",
                  },
                },
              ]
            : [],
      }),
    startWork: () =>
      Effect.succeed({
        ok: true,
        session,
        event: events[0],
      }),
    sendTurn: () =>
      Effect.succeed({
        ok: true,
        session,
        turn_id: "turn_fixture_1",
        events,
      }),
    respondApproval: () => Effect.succeed({ ok: true, session }),
    respondInput: () => Effect.succeed({ ok: true, session }),
    interruptSession: () =>
      Effect.succeed({
        ok: true,
        session: { ...session, status: "interrupted" },
      }),
    stopSession: () =>
      Effect.succeed({
        ok: true,
        session: { ...session, status: "stopped" },
      }),
    restoreCheckpoint: (_sessionId, restoreInput) =>
      Effect.succeed({
        ok: true,
        session,
        event: {
          event_id: JarvisSessionEvent.fields.event_id.make("ev_fixture_checkpoint_restored"),
          session_id: session.session_id,
          type: "checkpoint.restored",
          time: now,
          data: {
            checkpoint_id: restoreInput.checkpoint_id,
          },
        },
      }),
    resumeRun: (runId) =>
      Effect.fail(
        new JarvisMissingContractError({
          operation: "runs.resume",
          missing: `No fixture resume behavior is defined for run ${runId}.`,
        }),
      ),
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

function snapshotFromSessions(sessions: ReadonlyArray<JarvisWorkerSession>): JarvisRunsSnapshot {
  const runMap = new Map<string, Array<JarvisWorkerSession>>();
  for (const session of sessions) {
    const runId = session.run_id ?? fallbackRunIdForSession(session.session_id);
    const current = runMap.get(runId) ?? [];
    current.push(session);
    runMap.set(runId, current);
  }
  const runs: Array<JarvisRun> = [];
  for (const [runId, runSessions] of runMap) {
    const latest = [...runSessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (!latest) continue;
    const latestMetadata = latest.metadata ?? {};
    runs.push({
      run_id: JarvisRunId.make(runId),
      title: latest.title ?? latest.run_id ?? latest.session_id,
      objective:
        typeof latestMetadata.objective === "string" && latestMetadata.objective.trim().length > 0
          ? latestMetadata.objective
          : undefined,
      status: deriveRunStatus(runSessions),
      repo: latest.repo ?? null,
      branch: latest.branch ?? null,
      cwd: latest.cwd ?? null,
      worker_count: new Set(runSessions.map((session) => session.worker_id).filter(Boolean)).size,
      session_count: runSessions.length,
      needs_input: runSessions.some((session) => session.status === "needs_input"),
      needs_approval: runSessions.some((session) => session.status === "needs_approval"),
      created_at:
        runSessions.map((session) => session.created_at).sort((a, b) => a.localeCompare(b))[0] ??
        latest.created_at,
      updated_at: latest.updated_at,
      metadata: {
        projection_source: "jarvis-worker-sessions",
      },
    });
  }
  return {
    runs,
    sessions: [...sessions],
    workers: [],
    artifacts: [],
    generated_at:
      sessions.map((session) => session.updated_at).sort((a, b) => b.localeCompare(a))[0] ??
      "1970-01-01T00:00:00.000Z",
    cursor: null,
  };
}

function fallbackRunIdForSession(sessionId: string): JarvisRunId {
  return JarvisRunId.make(`run_${sessionId}`);
}

function deriveRunStatus(sessions: ReadonlyArray<JarvisWorkerSession>): JarvisRun["status"] {
  const statuses = new Set<JarvisWorkerSessionStatus>(sessions.map((session) => session.status));
  if (statuses.has("failed")) return "failed";
  if (statuses.has("needs_approval")) return "needs_approval";
  if (statuses.has("needs_input")) return "needs_input";
  if (statuses.has("running")) return "running";
  if (statuses.has("waiting_provider")) return "waiting_provider";
  if (statuses.has("interrupted")) return "interrupted";
  if (statuses.has("created")) return "created";
  if (statuses.has("stopped")) return "stopped";
  return "completed";
}

function truncateResponseBody(text: string): string {
  return text.length <= 4_000 ? text : `${text.slice(0, 4_000)}...`;
}
