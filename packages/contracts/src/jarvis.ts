import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
export type JsonObject = typeof JsonObject.Type;

const makeJarvisId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const JarvisRunId = makeJarvisId("JarvisRunId");
export type JarvisRunId = typeof JarvisRunId.Type;

export const JarvisSessionRef = makeJarvisId("JarvisSessionRef");
export type JarvisSessionRef = typeof JarvisSessionRef.Type;

export const JarvisWorkerSessionId = makeJarvisId("JarvisWorkerSessionId");
export type JarvisWorkerSessionId = typeof JarvisWorkerSessionId.Type;

export const JarvisSessionEventId = makeJarvisId("JarvisSessionEventId");
export type JarvisSessionEventId = typeof JarvisSessionEventId.Type;

export const JarvisWorkerId = makeJarvisId("JarvisWorkerId");
export type JarvisWorkerId = typeof JarvisWorkerId.Type;

export const JarvisArtifactId = makeJarvisId("JarvisArtifactId");
export type JarvisArtifactId = typeof JarvisArtifactId.Type;

export const JarvisRequestId = makeJarvisId("JarvisRequestId");
export type JarvisRequestId = typeof JarvisRequestId.Type;

export const JarvisProviderId = TrimmedNonEmptyString;
export type JarvisProviderId = typeof JarvisProviderId.Type;

export const JarvisEngineId = TrimmedNonEmptyString;
export type JarvisEngineId = typeof JarvisEngineId.Type;

export const JarvisRunStatus = Schema.Literals([
  "queued",
  "created",
  "running",
  "waiting_provider",
  "needs_input",
  "needs_approval",
  "interrupted",
  "stopped",
  "completed",
  "failed",
]);
export type JarvisRunStatus = typeof JarvisRunStatus.Type;

export const JarvisWorkerSessionStatus = Schema.Literals([
  "created",
  "running",
  "waiting_provider",
  "needs_input",
  "needs_approval",
  "interrupted",
  "stopped",
  "completed",
  "failed",
]);
export type JarvisWorkerSessionStatus = typeof JarvisWorkerSessionStatus.Type;

export const JarvisWorkerStatus = Schema.Literals(["online", "offline", "degraded", "unknown"]);
export type JarvisWorkerStatus = typeof JarvisWorkerStatus.Type;

export const JarvisWorkerHealth = Schema.Literals(["healthy", "degraded", "unhealthy", "unknown"]);
export type JarvisWorkerHealth = typeof JarvisWorkerHealth.Type;

export const JarvisKnownSessionEventType = Schema.Literals([
  "session.created",
  "turn.started",
  "provider.started",
  "provider.session.ready",
  "assistant.delta",
  "assistant.message",
  "tool.call",
  "tool.result",
  "approval.requested",
  "input.requested",
  "approval.resolved",
  "input.received",
  "checkpoint.created",
  "checkpoint.restored",
  "turn.completed",
  "turn.failed",
  "session.interrupted",
  "session.stopped",
]);
export type JarvisKnownSessionEventType = typeof JarvisKnownSessionEventType.Type;

/**
 * Jarvis may add event types independently of this client. The wire layer accepts
 * any non-empty event type and later UI mappers decide whether to render a rich
 * row or a neutral fallback row.
 */
export const JarvisSessionEventType = TrimmedNonEmptyString;
export type JarvisSessionEventType = typeof JarvisSessionEventType.Type;

export const JarvisArtifactKind = Schema.Literals([
  "branch",
  "pull_request",
  "report",
  "verification",
  "log",
  "file",
  "url",
  "status_comment",
  "provider_evidence",
]);
export type JarvisArtifactKind = typeof JarvisArtifactKind.Type;

export const JarvisApprovalDecision = Schema.Literals([
  "approved",
  "approved_for_session",
  "denied",
  "declined",
  "cancelled",
]);
export type JarvisApprovalDecision = typeof JarvisApprovalDecision.Type;

export const JarvisBranchStrategy = Schema.Literals(["auto", "use_existing", "create", "none"]);
export type JarvisBranchStrategy = typeof JarvisBranchStrategy.Type;

export const JarvisSyncMode = Schema.Literals(["none", "fast", "probe"]);
export type JarvisSyncMode = typeof JarvisSyncMode.Type;

export const JarvisSyncStatus = Schema.Literals(["fresh", "partial", "stale", "failed"]);
export type JarvisSyncStatus = typeof JarvisSyncStatus.Type;

export const JarvisCatalogOption = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  description: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisCatalogOption = typeof JarvisCatalogOption.Type;

export const JarvisCockpitCatalog = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  engines: Schema.Array(JarvisCatalogOption),
  capabilities: Schema.Array(JarvisCatalogOption),
  work_sources: Schema.Array(JarvisCatalogOption),
  engine_strategies: Schema.Array(JarvisCatalogOption),
  branch_strategies: Schema.Array(JarvisCatalogOption),
  landing_policies: Schema.Array(JarvisCatalogOption),
  request_kinds: Schema.Array(JarvisCatalogOption),
  generated_at: IsoDateTime,
});
export type JarvisCockpitCatalog = typeof JarvisCockpitCatalog.Type;

export const JarvisWorkerEngine = Schema.Struct({
  engine: JarvisEngineId,
  display_name: TrimmedNonEmptyString,
  status: Schema.Literals(["available", "unavailable", "degraded"]),
  default: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  supports: Schema.Struct({
    streaming: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    resume: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    interrupt: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    approval_requests: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    input_requests: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    checkpoints: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  }),
});
export type JarvisWorkerEngine = typeof JarvisWorkerEngine.Type;

export const JarvisWorkerProfile = Schema.Struct({
  worker_id: JarvisWorkerId,
  display_name: TrimmedNonEmptyString,
  status: JarvisWorkerStatus,
  health: JarvisWorkerHealth,
  last_seen_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  capabilities: Schema.Array(TrimmedNonEmptyString),
  engines: Schema.Array(JarvisWorkerEngine),
  capacity: Schema.Struct({
    max_sessions: NonNegativeInt,
    active_sessions: NonNegativeInt,
    queued_sessions: NonNegativeInt,
  }),
  repositories: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  public_metadata: Schema.optionalKey(JsonObject).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type JarvisWorkerProfile = typeof JarvisWorkerProfile.Type;

export const JarvisRun = Schema.Struct({
  run_id: JarvisRunId,
  title: TrimmedNonEmptyString,
  objective: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  status: JarvisRunStatus,
  phase: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  repo: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  session_count: NonNegativeInt,
  active_session_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_input_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_approval_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  artifact_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  primary_artifact_ids: Schema.Array(JarvisArtifactId).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  latest_activity_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  latest_cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  terminal_reason: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisRun = typeof JarvisRun.Type;

export const JarvisWorkerSession = Schema.Struct({
  session_ref: JarvisSessionRef,
  worker_id: JarvisWorkerId,
  session_id: JarvisWorkerSessionId,
  run_id: JarvisRunId,
  title: TrimmedNonEmptyString,
  provider: JarvisProviderId,
  engine: JarvisEngineId,
  status: JarvisWorkerSessionStatus,
  repo: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  cwd_label: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  latest_event_cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  pending_input_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_approval_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  checkpoint_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisWorkerSession = typeof JarvisWorkerSession.Type;

export const JarvisArtifact = Schema.Struct({
  artifact_id: JarvisArtifactId,
  run_id: JarvisRunId,
  session_ref: Schema.optional(Schema.NullOr(JarvisSessionRef)),
  kind: JarvisArtifactKind,
  provider: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  external_id: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  is_primary: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  visibility: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  title: TrimmedNonEmptyString,
  status: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  summary: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  url: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  commit_sha: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  command: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  started_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  completed_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisArtifact = typeof JarvisArtifact.Type;

export const JarvisCockpitSnapshot = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  cursor: TrimmedNonEmptyString,
  generated_at: IsoDateTime,
  sync: Schema.Struct({
    mode: JarvisSyncMode,
    status: JarvisSyncStatus,
    synced_at: Schema.optional(Schema.NullOr(IsoDateTime)),
    errors: Schema.Array(JsonObject),
  }),
  runs: Schema.Array(JarvisRun),
  sessions: Schema.Array(JarvisWorkerSession),
  workers: Schema.Array(JarvisWorkerProfile),
  artifacts: Schema.Array(JarvisArtifact),
});
export type JarvisCockpitSnapshot = typeof JarvisCockpitSnapshot.Type;

export const JarvisRunsSnapshot = JarvisCockpitSnapshot;
export type JarvisRunsSnapshot = JarvisCockpitSnapshot;

export const JarvisSessionEvent = Schema.Struct({
  event_id: JarvisSessionEventId,
  sequence: NonNegativeInt,
  session_ref: JarvisSessionRef,
  run_id: JarvisRunId,
  type: JarvisSessionEventType,
  occurred_at: IsoDateTime,
  turn_id: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  message_id: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  data: JsonObject.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisSessionEvent = typeof JarvisSessionEvent.Type;

export const JarvisSessionRequestKind = Schema.Literals(["approval", "input"]);
export type JarvisSessionRequestKind = typeof JarvisSessionRequestKind.Type;

export const JarvisSessionRequestStatus = Schema.Literals(["pending", "resolved", "cancelled"]);
export type JarvisSessionRequestStatus = typeof JarvisSessionRequestStatus.Type;

export const JarvisSessionRequest = Schema.Struct({
  request_id: JarvisRequestId,
  session_ref: JarvisSessionRef,
  run_id: JarvisRunId,
  kind: JarvisSessionRequestKind,
  status: JarvisSessionRequestStatus,
  title: TrimmedNonEmptyString,
  detail: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  created_at: IsoDateTime,
  expires_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  questions: Schema.optionalKey(Schema.Array(JsonObject)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  payload: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisSessionRequest = typeof JarvisSessionRequest.Type;

export const JarvisSessionCheckpoint = Schema.Struct({
  session_ref: JarvisSessionRef,
  checkpoint_id: TrimmedNonEmptyString,
  label: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  provider: JarvisProviderId,
  restored: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  event: JsonObject,
});
export type JarvisSessionCheckpoint = typeof JarvisSessionCheckpoint.Type;

export const JarvisSessionEventsPage = Schema.Struct({
  items: Schema.Array(JarvisSessionEvent),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  has_more: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisSessionEventsPage = typeof JarvisSessionEventsPage.Type;

export const JarvisSessionRequestsPage = Schema.Struct({
  items: Schema.Array(JarvisSessionRequest),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  has_more: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisSessionRequestsPage = typeof JarvisSessionRequestsPage.Type;

export const JarvisSessionCheckpointsPage = Schema.Struct({
  items: Schema.Array(JarvisSessionCheckpoint),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  has_more: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisSessionCheckpointsPage = typeof JarvisSessionCheckpointsPage.Type;

export const JarvisArtifactsPage = Schema.Struct({
  items: Schema.Array(JarvisArtifact),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  has_more: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisArtifactsPage = typeof JarvisArtifactsPage.Type;

export const JarvisWriteMetadata = JsonObject;
export type JarvisWriteMetadata = typeof JarvisWriteMetadata.Type;

export const JarvisStartWorkInput = Schema.Struct({
  phrase: Schema.optional(TrimmedNonEmptyString),
  source: Schema.optional(TrimmedNonEmptyString),
  repo: Schema.optional(TrimmedNonEmptyString),
  worker_id: Schema.optional(JarvisWorkerId),
  engine: Schema.optional(JarvisEngineId),
  engine_strategy: Schema.optional(TrimmedNonEmptyString),
  start: Schema.optional(Schema.Boolean),
  title: Schema.optional(TrimmedNonEmptyString),
  objective: Schema.optional(TrimmedNonEmptyString),
  prompt: Schema.optional(TrimmedNonEmptyString),
  base_ref: Schema.optional(TrimmedNonEmptyString),
  branch: Schema.optional(TrimmedNonEmptyString),
  branch_strategy: JarvisBranchStrategy.pipe(Schema.withDecodingDefault(Effect.succeed("auto"))),
  verification_expectation: Schema.optional(TrimmedNonEmptyString),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisStartWorkInput = typeof JarvisStartWorkInput.Type;

export const JarvisResumeWorkInput = Schema.Struct({
  run_id: Schema.Union([JarvisRunId, Schema.Literal("latest")]),
  prompt: TrimmedNonEmptyString,
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisResumeWorkInput = typeof JarvisResumeWorkInput.Type;

export const JarvisTurnInput = Schema.Struct({
  turn_id: Schema.optional(TrimmedNonEmptyString),
  prompt: TrimmedNonEmptyString,
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisTurnInput = typeof JarvisTurnInput.Type;

export const JarvisApprovalInput = Schema.Struct({
  request_id: JarvisRequestId,
  decision: JarvisApprovalDecision,
  scope: Schema.optional(TrimmedNonEmptyString),
  reason: Schema.optional(TrimmedNonEmptyString),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisApprovalInput = typeof JarvisApprovalInput.Type;

export const JarvisUserInputInput = Schema.Struct({
  request_id: JarvisRequestId,
  text: TrimmedNonEmptyString,
  answers: Schema.optional(JsonObject),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisUserInputInput = typeof JarvisUserInputInput.Type;

export const JarvisRestoreCheckpointInput = Schema.Struct({
  checkpoint_id: TrimmedNonEmptyString,
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisRestoreCheckpointInput = typeof JarvisRestoreCheckpointInput.Type;

export const JarvisControlSessionRef = Schema.Struct({
  session_ref: JarvisSessionRef,
});
export type JarvisControlSessionRef = typeof JarvisControlSessionRef.Type;

export const JarvisControlEventRef = Schema.Struct({
  type: JarvisSessionEventType,
});
export type JarvisControlEventRef = typeof JarvisControlEventRef.Type;

export const JarvisWriteErrorCode = Schema.Literals([
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "idempotency_conflict",
  "worker_unavailable",
  "worker_capacity_exceeded",
  "session_active",
  "session_terminal",
  "request_not_pending",
  "checkpoint_not_found",
  "provider_unavailable",
  "stale_cursor",
  "internal_error",
]);
export type JarvisWriteErrorCode = typeof JarvisWriteErrorCode.Type;

export const JarvisWriteError = Schema.Struct({
  code: JarvisWriteErrorCode,
  message: TrimmedNonEmptyString,
  recoverable: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisWriteError = typeof JarvisWriteError.Type;

const JarvisControlSession = Schema.Union([JarvisWorkerSession, JarvisControlSessionRef]);
const JarvisControlEvent = Schema.Union([JarvisSessionEvent, JarvisControlEventRef]);

export const JarvisControlResult = Schema.Struct({
  ok: Schema.Boolean,
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  run: Schema.optional(JarvisRun),
  session: Schema.optional(JarvisControlSession),
  event: Schema.optional(JarvisControlEvent),
  events: Schema.optionalKey(Schema.Array(JarvisControlEvent)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  requests: Schema.optionalKey(Schema.Array(JarvisSessionRequest)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  artifacts: Schema.optionalKey(Schema.Array(JarvisArtifact)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  error: Schema.optional(JarvisWriteError),
});
export type JarvisControlResult = typeof JarvisControlResult.Type;

export const JarvisCockpitEventType = Schema.Literals([
  "snapshot",
  "run.updated",
  "session.updated",
  "session.event",
  "worker.updated",
  "artifact.upserted",
  "artifact.removed",
  "request.updated",
  "checkpoint.updated",
]);
export type JarvisCockpitEventType = typeof JarvisCockpitEventType.Type;

export const JarvisCockpitEvent = Schema.Struct({
  cursor: TrimmedNonEmptyString,
  occurred_at: IsoDateTime,
  type: JarvisCockpitEventType,
  run_id: Schema.optional(Schema.NullOr(JarvisRunId)),
  session_ref: Schema.optional(Schema.NullOr(JarvisSessionRef)),
  payload: Schema.Unknown,
});
export type JarvisCockpitEvent = typeof JarvisCockpitEvent.Type;
