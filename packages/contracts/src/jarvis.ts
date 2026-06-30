import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
export type JsonObject = typeof JsonObject.Type;

const makeJarvisId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const JarvisRunId = makeJarvisId("JarvisRunId");
export type JarvisRunId = typeof JarvisRunId.Type;

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

export const JarvisKnownSessionEventType = Schema.Literals([
  "session.created",
  "turn.started",
  "turn.waiting_provider",
  "provider.started",
  "provider.process.started",
  "provider.session.ready",
  "provider.thread.ready",
  "provider.turn.started",
  "provider.log",
  "provider.error",
  "assistant.delta",
  "assistant.message",
  "tool.call",
  "tool.result",
  "approval.requested",
  "approval.resolved",
  "input.requested",
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

export const JarvisArtifact = Schema.Struct({
  artifact_id: JarvisArtifactId,
  run_id: JarvisRunId,
  session_id: Schema.optional(Schema.NullOr(JarvisWorkerSessionId)),
  kind: JarvisArtifactKind,
  title: TrimmedNonEmptyString,
  url: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  path: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  created_at: IsoDateTime,
});
export type JarvisArtifact = typeof JarvisArtifact.Type;

export const JarvisRun = Schema.Struct({
  run_id: JarvisRunId,
  title: TrimmedNonEmptyString,
  objective: Schema.optional(TrimmedNonEmptyString),
  status: JarvisRunStatus,
  repo: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  cwd: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  worker_count: NonNegativeInt,
  session_count: NonNegativeInt,
  needs_input: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  needs_approval: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisRun = typeof JarvisRun.Type;

export const JarvisWorkerSession = Schema.Struct({
  session_id: JarvisWorkerSessionId,
  provider: JarvisProviderId,
  engine: JarvisEngineId,
  status: JarvisWorkerSessionStatus,
  run_id: Schema.optional(JarvisRunId),
  repo: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  cwd: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  title: Schema.optional(TrimmedNonEmptyString),
  worker_id: Schema.optional(JarvisWorkerId),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisWorkerSession = typeof JarvisWorkerSession.Type;

export const JarvisSessionEvent = Schema.Struct({
  event_id: JarvisSessionEventId,
  session_id: JarvisWorkerSessionId,
  type: JarvisSessionEventType,
  time: IsoDateTime,
  data: JsonObject.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisSessionEvent = typeof JarvisSessionEvent.Type;

export const JarvisWorkerProfile = Schema.Struct({
  worker_id: JarvisWorkerId,
  label: TrimmedNonEmptyString,
  status: Schema.Literals(["online", "offline", "degraded", "unknown"]),
  providers: Schema.Array(JarvisProviderId),
  engines: Schema.Array(JarvisEngineId),
  active_session_count: NonNegativeInt,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  updated_at: IsoDateTime,
});
export type JarvisWorkerProfile = typeof JarvisWorkerProfile.Type;

export const JarvisRunsSnapshot = Schema.Struct({
  runs: Schema.Array(JarvisRun),
  sessions: Schema.Array(JarvisWorkerSession),
  workers: Schema.Array(JarvisWorkerProfile),
  artifacts: Schema.Array(JarvisArtifact),
  generated_at: IsoDateTime,
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type JarvisRunsSnapshot = typeof JarvisRunsSnapshot.Type;

export const JarvisSessionEventsPage = Schema.Struct({
  session_id: JarvisWorkerSessionId,
  events: Schema.Array(JarvisSessionEvent),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type JarvisSessionEventsPage = typeof JarvisSessionEventsPage.Type;

export const JarvisSessionRequestKind = Schema.Literals(["approval", "input"]);
export type JarvisSessionRequestKind = typeof JarvisSessionRequestKind.Type;

export const JarvisSessionRequestStatus = Schema.Literals(["pending", "resolved"]);
export type JarvisSessionRequestStatus = typeof JarvisSessionRequestStatus.Type;

export const JarvisSessionRequest = Schema.Struct({
  session_id: JarvisWorkerSessionId,
  request_id: JarvisRequestId,
  kind: JarvisSessionRequestKind,
  status: JarvisSessionRequestStatus,
  event: JsonObject,
});
export type JarvisSessionRequest = typeof JarvisSessionRequest.Type;

export const JarvisSessionRequestsPage = Schema.Struct({
  requests: Schema.Array(JarvisSessionRequest),
});
export type JarvisSessionRequestsPage = typeof JarvisSessionRequestsPage.Type;

export const JarvisSessionCheckpoint = Schema.Struct({
  session_id: JarvisWorkerSessionId,
  checkpoint_id: TrimmedNonEmptyString,
  label: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  provider: JarvisProviderId,
  restored: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  event: JsonObject,
});
export type JarvisSessionCheckpoint = typeof JarvisSessionCheckpoint.Type;

export const JarvisSessionCheckpointsPage = Schema.Struct({
  checkpoints: Schema.Array(JarvisSessionCheckpoint),
});
export type JarvisSessionCheckpointsPage = typeof JarvisSessionCheckpointsPage.Type;

export const JarvisStartWorkInput = Schema.Struct({
  title: TrimmedNonEmptyString,
  objective: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  repo: Schema.optional(TrimmedNonEmptyString),
  worker_id: Schema.optional(JarvisWorkerId),
  provider: Schema.optional(JarvisProviderId),
  engine: Schema.optional(JarvisEngineId),
  base_ref: Schema.optional(TrimmedNonEmptyString),
  branch: Schema.optional(TrimmedNonEmptyString),
  branch_strategy: JarvisBranchStrategy.pipe(Schema.withDecodingDefault(Effect.succeed("auto"))),
  verification_expectation: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisStartWorkInput = typeof JarvisStartWorkInput.Type;

export const JarvisTurnInput = Schema.Struct({
  turn_id: Schema.optional(TrimmedNonEmptyString),
  prompt: TrimmedNonEmptyString,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisTurnInput = typeof JarvisTurnInput.Type;

export const JarvisApprovalInput = Schema.Struct({
  request_id: JarvisRequestId,
  decision: JarvisApprovalDecision,
  scope: Schema.optional(TrimmedNonEmptyString),
  reason: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisApprovalInput = typeof JarvisApprovalInput.Type;

export const JarvisUserInputInput = Schema.Struct({
  request_id: JarvisRequestId,
  text: TrimmedNonEmptyString,
  answers: Schema.optional(JsonObject),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisUserInputInput = typeof JarvisUserInputInput.Type;

export const JarvisRestoreCheckpointInput = Schema.Struct({
  checkpoint_id: TrimmedNonEmptyString,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisRestoreCheckpointInput = typeof JarvisRestoreCheckpointInput.Type;

export const JarvisControlResult = Schema.Struct({
  ok: Schema.Boolean,
  run: Schema.optional(JarvisRun),
  session: Schema.optional(JarvisWorkerSession),
  event: Schema.optional(JarvisSessionEvent),
  events: Schema.optional(Schema.Array(JarvisSessionEvent)),
  turn_id: Schema.optional(TrimmedNonEmptyString),
  error: Schema.optional(Schema.String),
});
export type JarvisControlResult = typeof JarvisControlResult.Type;
