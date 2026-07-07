import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
export type JsonObject = typeof JsonObject.Type;

export const JarvisWriteMetadata = JsonObject;
export type JarvisWriteMetadata = typeof JarvisWriteMetadata.Type;

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

export const JarvisProjectId = makeJarvisId("JarvisProjectId");
export type JarvisProjectId = typeof JarvisProjectId.Type;

export const JarvisProjectThreadId = makeJarvisId("JarvisProjectThreadId");
export type JarvisProjectThreadId = typeof JarvisProjectThreadId.Type;

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
  "active",
  "running",
  "waiting_provider",
  "needs_input",
  "needs_approval",
  "interrupted",
  "stopped",
  "completed",
  "failed",
  "terminal",
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

export const JarvisWorkerSessionAuthority = Schema.Literal("jarvis");
export type JarvisWorkerSessionAuthority = typeof JarvisWorkerSessionAuthority.Type;

export const JarvisSupportedControl = Schema.Literals([
  "turn",
  "input",
  "approval",
  "interrupt",
  "stop",
  "archive",
  "delete",
  "close",
  "checkpoint_restore",
]);
export type JarvisSupportedControl = typeof JarvisSupportedControl.Type;

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

export const JarvisCapabilitySupport = Schema.Struct({
  streaming: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  resume: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  interrupt: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  approval_requests: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  input_requests: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  checkpoints: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  attachments: Schema.optionalKey(Schema.Boolean),
});
export type JarvisCapabilitySupport = typeof JarvisCapabilitySupport.Type;

export const JarvisCatalogEngine = Schema.Struct({
  engine: JarvisEngineId,
  display_name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  supports: JarvisCapabilitySupport,
});
export type JarvisCatalogEngine = typeof JarvisCatalogEngine.Type;

export const JarvisCatalogCapability = Schema.Struct({
  capability: TrimmedNonEmptyString,
  display_name: TrimmedNonEmptyString,
  maps_to: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type JarvisCatalogCapability = typeof JarvisCatalogCapability.Type;

const OptionalPublicString = Schema.optional(Schema.NullOr(TrimmedNonEmptyString));
const OptionalPossiblyEmptyPublicString = Schema.optional(
  Schema.NullOr(Schema.Union([TrimmedNonEmptyString, Schema.Literal("")])),
);

export const JarvisCatalogStartOptions = Schema.Struct({
  sources: Schema.Array(TrimmedNonEmptyString),
  engines: Schema.Array(JarvisEngineId),
  engine_strategies: Schema.Array(TrimmedNonEmptyString),
  landing_modes: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  required_fields: Schema.Record(Schema.String, Schema.Array(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  defaults: Schema.Struct({
    source: OptionalPossiblyEmptyPublicString,
    worker_id: OptionalPossiblyEmptyPublicString,
    repo: OptionalPossiblyEmptyPublicString,
    engine: OptionalPossiblyEmptyPublicString,
    engine_strategy: OptionalPossiblyEmptyPublicString,
    landing_mode: OptionalPossiblyEmptyPublicString,
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisCatalogStartOptions = typeof JarvisCatalogStartOptions.Type;

export const JarvisCockpitCatalog = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  engines: Schema.Array(JarvisCatalogEngine),
  capabilities: Schema.Array(JarvisCatalogCapability),
  work_sources: Schema.Array(TrimmedNonEmptyString),
  engine_strategies: Schema.Array(TrimmedNonEmptyString),
  branch_strategies: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  landing_policies: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  request_kinds: Schema.Array(TrimmedNonEmptyString),
  start_options: Schema.optionalKey(JarvisCatalogStartOptions),
  generated_at: Schema.optional(IsoDateTime),
});
export type JarvisCockpitCatalog = typeof JarvisCockpitCatalog.Type;

export const JarvisMcpServeStatus = Schema.Struct({
  configured: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  host: OptionalPossiblyEmptyPublicString,
  port: Schema.optional(Schema.NullOr(NonNegativeInt)),
  auth_mode: Schema.optional(Schema.NullOr(Schema.Literals(["legacy", "oauth", "hybrid"]))),
  oauth: Schema.optionalKey(
    Schema.Struct({
      configured: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
      issuer: OptionalPossiblyEmptyPublicString,
      resource: OptionalPossiblyEmptyPublicString,
      metadata_url: OptionalPossiblyEmptyPublicString,
    }),
  ).pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        configured: false,
        issuer: null,
        resource: null,
        metadata_url: null,
      }),
    ),
  ),
  tokens: Schema.optionalKey(
    Schema.Struct({
      active: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
      revoked: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
    }),
  ).pipe(Schema.withDecodingDefault(Effect.succeed({ active: 0, revoked: 0 }))),
  codex_wired: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  codex_wired_reason: OptionalPossiblyEmptyPublicString,
});
export type JarvisMcpServeStatus = typeof JarvisMcpServeStatus.Type;

export const JarvisMcpStatus = Schema.Struct({
  api_version: Schema.optional(Schema.Literal("v1")),
  schema_version: Schema.optional(Schema.Number),
  serve: Schema.optionalKey(JarvisMcpServeStatus).pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        configured: false,
        host: null,
        port: null,
        auth_mode: null,
        oauth: {
          configured: false,
          issuer: null,
          resource: null,
          metadata_url: null,
        },
        tokens: { active: 0, revoked: 0 },
        codex_wired: false,
        codex_wired_reason: "Jarvis did not report MCP serve status.",
      }),
    ),
  ),
});
export type JarvisMcpStatus = typeof JarvisMcpStatus.Type;

export const JarvisMcpStatusResult = Schema.Struct({
  ok: Schema.Boolean,
  status: Schema.optionalKey(JarvisMcpStatus),
  error: Schema.optionalKey(
    Schema.Struct({
      message: Schema.String,
      status: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ),
});
export type JarvisMcpStatusResult = typeof JarvisMcpStatusResult.Type;

export const JarvisRouteCapabilityGroup = Schema.Literals([
  "project",
  "memory",
  "conversation",
  "worker-dispatch",
  "mcp",
  "activity",
]);
export type JarvisRouteCapabilityGroup = typeof JarvisRouteCapabilityGroup.Type;

export const JarvisRouteCapabilityStatus = Schema.Literals([
  "available",
  "missing",
  "auth-error",
  "not-probed",
]);
export type JarvisRouteCapabilityStatus = typeof JarvisRouteCapabilityStatus.Type;

export const JarvisRouteCapability = Schema.Struct({
  id: TrimmedNonEmptyString,
  group: JarvisRouteCapabilityGroup,
  label: TrimmedNonEmptyString,
  method: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  safe_to_probe: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  status: JarvisRouteCapabilityStatus,
  status_code: Schema.optional(Schema.NullOr(NonNegativeInt)),
  detail: Schema.optional(Schema.NullOr(Schema.String)),
  probed_at: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type JarvisRouteCapability = typeof JarvisRouteCapability.Type;

export const JarvisCapabilitiesResult = Schema.Struct({
  ok: Schema.Boolean,
  checked_at: IsoDateTime,
  routes: Schema.Array(JarvisRouteCapability),
  catalog: Schema.optionalKey(JarvisCockpitCatalog),
  error: Schema.optionalKey(
    Schema.Struct({
      message: Schema.String,
      status: Schema.optional(Schema.NullOr(Schema.Number)),
    }),
  ),
});
export type JarvisCapabilitiesResult = typeof JarvisCapabilitiesResult.Type;

export const JarvisProjectRepository = Schema.Struct({
  name: TrimmedNonEmptyString,
  remote: TrimmedNonEmptyString,
  default: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisProjectRepository = typeof JarvisProjectRepository.Type;

export const JarvisProjectLinks = Schema.Struct({
  jira: OptionalPossiblyEmptyPublicString,
  urls: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type JarvisProjectLinks = typeof JarvisProjectLinks.Type;

export const JarvisProject = Schema.Struct({
  id: JarvisProjectId,
  name: TrimmedNonEmptyString,
  peer_id: TrimmedNonEmptyString,
  aliases: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  owner: OptionalPossiblyEmptyPublicString,
  members: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  visibility: OptionalPossiblyEmptyPublicString,
  status: OptionalPossiblyEmptyPublicString,
  repos: Schema.Array(JarvisProjectRepository).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  links: Schema.optionalKey(JarvisProjectLinks).pipe(
    Schema.withDecodingDefault(Effect.succeed({ urls: [] })),
  ),
  files_root: OptionalPossiblyEmptyPublicString,
});
export type JarvisProject = typeof JarvisProject.Type;

export const JarvisProjectCreateInput = Schema.Struct({
  id: Schema.optional(JarvisProjectId),
  name: TrimmedNonEmptyString,
  peer_id: Schema.optional(TrimmedNonEmptyString),
  aliases: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  owner: OptionalPossiblyEmptyPublicString,
  members: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  visibility: OptionalPossiblyEmptyPublicString,
  status: OptionalPossiblyEmptyPublicString,
  repos: Schema.optional(Schema.Array(JarvisProjectRepository)),
  links: Schema.optional(JarvisProjectLinks),
  files_root: OptionalPossiblyEmptyPublicString,
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectCreateInput = typeof JarvisProjectCreateInput.Type;

export const JarvisProjectUpdateInput = Schema.Struct({
  name: Schema.optional(TrimmedNonEmptyString),
  peer_id: Schema.optional(TrimmedNonEmptyString),
  aliases: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  owner: OptionalPossiblyEmptyPublicString,
  members: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  visibility: OptionalPossiblyEmptyPublicString,
  status: OptionalPossiblyEmptyPublicString,
  repos: Schema.optional(Schema.Array(JarvisProjectRepository)),
  links: Schema.optional(JarvisProjectLinks),
  files_root: OptionalPossiblyEmptyPublicString,
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectUpdateInput = typeof JarvisProjectUpdateInput.Type;

export const JarvisArchiveInputBase = Schema.Struct({
  reason: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});

export const JarvisProjectArchiveInput = JarvisArchiveInputBase;
export type JarvisProjectArchiveInput = typeof JarvisProjectArchiveInput.Type;

export const JarvisProjectListResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  projects: Schema.Array(JarvisProject),
});
export type JarvisProjectListResponse = typeof JarvisProjectListResponse.Type;

export const JarvisProjectDetailResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  project: JarvisProject,
});
export type JarvisProjectDetailResponse = typeof JarvisProjectDetailResponse.Type;

export const JarvisProjectConclusion = Schema.Struct({
  id: TrimmedNonEmptyString,
  content: TrimmedNonEmptyString,
  artifact_type: TrimmedNonEmptyString,
  recorded_by: OptionalPossiblyEmptyPublicString,
  observed_at: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type JarvisProjectConclusion = typeof JarvisProjectConclusion.Type;

export const JarvisProjectMemoryResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  project_id: JarvisProjectId,
  peer_id: TrimmedNonEmptyString,
  representation: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  conclusions: Schema.Array(JarvisProjectConclusion).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type JarvisProjectMemoryResponse = typeof JarvisProjectMemoryResponse.Type;

export const JarvisProjectMemoryCurationInput = Schema.Struct({
  content: TrimmedNonEmptyString,
  observed_at: Schema.optional(TrimmedNonEmptyString),
  status: Schema.optional(TrimmedNonEmptyString),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectMemoryCurationInput = typeof JarvisProjectMemoryCurationInput.Type;

export const JarvisProjectMemoryForgetInput = Schema.Struct({
  query: TrimmedNonEmptyString,
  confirm: Schema.optional(Schema.Boolean),
  conclusion_ids: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectMemoryForgetInput = typeof JarvisProjectMemoryForgetInput.Type;

export const JarvisProjectMemoryCorrectInput = Schema.Struct({
  query: TrimmedNonEmptyString,
  replacement: TrimmedNonEmptyString,
  confirm: Schema.optional(Schema.Boolean),
  conclusion_ids: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectMemoryCorrectInput = typeof JarvisProjectMemoryCorrectInput.Type;

export const JarvisProjectMemoryWriteResponse = JsonObject;
export type JarvisProjectMemoryWriteResponse = typeof JarvisProjectMemoryWriteResponse.Type;

export const JarvisProjectFile = Schema.Struct({
  doc_id: TrimmedNonEmptyString,
  title: OptionalPossiblyEmptyPublicString,
  session_id: OptionalPossiblyEmptyPublicString,
  original_path: OptionalPossiblyEmptyPublicString,
  content_hash: OptionalPossiblyEmptyPublicString,
  artifact_type: OptionalPossiblyEmptyPublicString,
  uploaded_by: OptionalPossiblyEmptyPublicString,
  observed_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  retracted: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  ingestion: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisProjectFile = typeof JarvisProjectFile.Type;

export const JarvisProjectFilesResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  project_id: JarvisProjectId,
  files: Schema.Array(JarvisProjectFile).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type JarvisProjectFilesResponse = typeof JarvisProjectFilesResponse.Type;

export const JarvisProjectFileUploadInput = Schema.Struct({
  filename: TrimmedNonEmptyString,
  content_base64: TrimmedNonEmptyString,
  title: Schema.optional(TrimmedNonEmptyString),
  artifact_type: Schema.optional(TrimmedNonEmptyString),
  mime_type: Schema.optional(TrimmedNonEmptyString),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectFileUploadInput = typeof JarvisProjectFileUploadInput.Type;

export const JarvisProjectFileRetractInput = JarvisArchiveInputBase;
export type JarvisProjectFileRetractInput = typeof JarvisProjectFileRetractInput.Type;

export const JarvisProjectFileUploadResponse = JsonObject;
export type JarvisProjectFileUploadResponse = typeof JarvisProjectFileUploadResponse.Type;

// Project-thread lifecycle status (brain conversation). See COCKPIT_API.md.
export const JarvisProjectThreadStatus = Schema.Literals([
  "created",
  "running",
  "completed",
  "failed",
]);
export type JarvisProjectThreadStatus = typeof JarvisProjectThreadStatus.Type;

// Why a conversation/session ended; null while active.
export const JarvisEndedReason = Schema.Literals([
  "completed",
  "stopped",
  "interrupted_by_user",
  "worker_lost",
  "engine_error",
]);
export type JarvisEndedReason = typeof JarvisEndedReason.Type;

export const JarvisProjectThread = Schema.Struct({
  thread_id: JarvisProjectThreadId,
  project_id: JarvisProjectId,
  parent_chat_id: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  session_id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  // Enrichment fields (2026-07-07 brain release). Optional so older deployments still decode.
  // status/ended_reason are accepted as tolerant strings (not strict Literals) so a single
  // future/unknown value from an evolving brain cannot fail the whole threads-list/detail
  // decode; UI mappers narrow against the known JarvisProjectThreadStatus/JarvisEndedReason
  // literals and fall back to neutral. (Same forward-compat pattern as JarvisSessionEventType.)
  engine: OptionalPossiblyEmptyPublicString,
  model: OptionalPossiblyEmptyPublicString,
  worker_id: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  host: OptionalPossiblyEmptyPublicString,
  status: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  ended_reason: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  created_by: OptionalPossiblyEmptyPublicString,
  archived_at: OptionalPossiblyEmptyPublicString,
  archived_by: OptionalPossiblyEmptyPublicString,
  archive_reason: OptionalPossiblyEmptyPublicString,
});
export type JarvisProjectThread = typeof JarvisProjectThread.Type;

export const JarvisProjectThreadMessage = Schema.Struct({
  // Tolerant string (not a strict Literal) so an unknown role (e.g. a future "system"/"tool"
  // message) cannot fail the whole thread-detail decode and drop all history; the UI maps
  // "user" to the user side and everything else to the assistant side.
  role: TrimmedNonEmptyString,
  peer_id: OptionalPossiblyEmptyPublicString,
  content: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  observed_at: IsoDateTime,
});
export type JarvisProjectThreadMessage = typeof JarvisProjectThreadMessage.Type;

export const JarvisProjectThreadDetail = Schema.Struct({
  ...JarvisProjectThread.fields,
  messages: Schema.Array(JarvisProjectThreadMessage).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type JarvisProjectThreadDetail = typeof JarvisProjectThreadDetail.Type;

export const JarvisProjectThreadsResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  project_id: JarvisProjectId,
  threads: Schema.Array(JarvisProjectThread),
});
export type JarvisProjectThreadsResponse = typeof JarvisProjectThreadsResponse.Type;

export const JarvisProjectThreadDetailResponse = Schema.Struct({
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  project_id: JarvisProjectId,
  thread: JarvisProjectThreadDetail,
});
export type JarvisProjectThreadDetailResponse = typeof JarvisProjectThreadDetailResponse.Type;

export const JarvisProjectCreateThreadInput = Schema.Struct({
  title: Schema.optional(TrimmedNonEmptyString),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectCreateThreadInput = typeof JarvisProjectCreateThreadInput.Type;

export const JarvisProjectThreadArchiveInput = JarvisArchiveInputBase;
export type JarvisProjectThreadArchiveInput = typeof JarvisProjectThreadArchiveInput.Type;

export const JarvisTurnAttachmentMimeType = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export type JarvisTurnAttachmentMimeType = typeof JarvisTurnAttachmentMimeType.Type;

export const JarvisTurnAttachment = Schema.Struct({
  kind: Schema.Literal("image"),
  mime_type: JarvisTurnAttachmentMimeType,
  name: TrimmedNonEmptyString,
  data_url: TrimmedNonEmptyString,
});
export type JarvisTurnAttachment = typeof JarvisTurnAttachment.Type;

export const JarvisProjectThreadTurnInput = Schema.Struct({
  text: TrimmedNonEmptyString,
  attachments: Schema.optionalKey(Schema.Array(JarvisTurnAttachment)),
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisProjectThreadTurnInput = typeof JarvisProjectThreadTurnInput.Type;

export const JarvisProjectThreadTurnResult = Schema.Struct({
  ok: Schema.Boolean,
  text: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(""))),
  events: Schema.Array(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type JarvisProjectThreadTurnResult = typeof JarvisProjectThreadTurnResult.Type;

export const JarvisWorkerEngine = Schema.Struct({
  engine: JarvisEngineId,
  display_name: TrimmedNonEmptyString,
  status: Schema.Literals(["available", "unavailable", "degraded"]),
  default: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  supports: JarvisCapabilitySupport,
});
export type JarvisWorkerEngine = typeof JarvisWorkerEngine.Type;

export const JarvisWorkerRepository = Schema.Struct({
  repo: TrimmedNonEmptyString,
  status: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  default_branch: OptionalPossiblyEmptyPublicString,
  is_default: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  can_start_work: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisWorkerRepository = typeof JarvisWorkerRepository.Type;

export const JarvisWorkerGitAuthState = Schema.Literals(["valid", "expired", "unconfigured"]);
export type JarvisWorkerGitAuthState = typeof JarvisWorkerGitAuthState.Type;

export const JarvisWorkerGitIdentity = Schema.Struct({
  provider: OptionalPossiblyEmptyPublicString,
  login: OptionalPossiblyEmptyPublicString,
  auth_state: Schema.optional(JarvisWorkerGitAuthState),
  connected: Schema.optional(Schema.Boolean),
  authenticated: Schema.optional(Schema.Boolean),
  auth_fresh: Schema.optional(Schema.Boolean),
  git_user_name: OptionalPossiblyEmptyPublicString,
  git_user_email: OptionalPossiblyEmptyPublicString,
  checked_at: Schema.optional(Schema.NullOr(Schema.Number)),
  detail: OptionalPossiblyEmptyPublicString,
});
export type JarvisWorkerGitIdentity = typeof JarvisWorkerGitIdentity.Type;

export const JarvisWorkerRepoAccess = Schema.Struct({
  repo: OptionalPossiblyEmptyPublicString,
  accessible: Schema.optional(Schema.Boolean),
  public: Schema.optional(Schema.Boolean),
  reason_code: OptionalPossiblyEmptyPublicString,
  reason: OptionalPossiblyEmptyPublicString,
  checked_at: Schema.optional(Schema.NullOr(Schema.Number)),
  ttl_s: Schema.optional(Schema.NullOr(NonNegativeInt)),
  cached: Schema.optional(Schema.Boolean),
});
export type JarvisWorkerRepoAccess = typeof JarvisWorkerRepoAccess.Type;

export const JarvisWorkerWorktreeInventory = Schema.Struct({
  count: Schema.optional(NonNegativeInt),
  disk_bytes: Schema.optional(NonNegativeInt),
  stale_count: Schema.optional(NonNegativeInt),
});
export type JarvisWorkerWorktreeInventory = typeof JarvisWorkerWorktreeInventory.Type;

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
  repositories: Schema.optionalKey(Schema.Array(JarvisWorkerRepository)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  git_identity: Schema.optionalKey(JarvisWorkerGitIdentity),
  repo_access: Schema.optionalKey(Schema.Array(JarvisWorkerRepoAccess)),
  worktree_inventory: Schema.optionalKey(JarvisWorkerWorktreeInventory),
  system: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  public_metadata: Schema.optionalKey(JsonObject).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
});
export type JarvisWorkerProfile = typeof JarvisWorkerProfile.Type;

export const JarvisRun = Schema.Struct({
  authority: Schema.optionalKey(JarvisWorkerSessionAuthority),
  supported_controls: Schema.optionalKey(Schema.Array(JarvisSupportedControl)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  run_id: JarvisRunId,
  title: TrimmedNonEmptyString,
  objective: OptionalPublicString,
  status: JarvisRunStatus,
  phase: OptionalPublicString,
  repo: OptionalPossiblyEmptyPublicString,
  branch: OptionalPossiblyEmptyPublicString,
  session_count: NonNegativeInt,
  active_session_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_input_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_approval_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  artifact_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  primary_artifact_ids: Schema.Array(JarvisArtifactId).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  latest_activity_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  latest_cursor: OptionalPossiblyEmptyPublicString,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  archived_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  terminal_reason: OptionalPublicString,
  state_reason: OptionalPublicString,
  blocked_reason: OptionalPublicString,
  waiting_on: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  last_error: OptionalPublicString,
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
  authority: JarvisWorkerSessionAuthority,
  supported_controls: Schema.Array(JarvisSupportedControl),
  status: JarvisWorkerSessionStatus,
  provision_phase: OptionalPossiblyEmptyPublicString,
  repo: OptionalPossiblyEmptyPublicString,
  branch: OptionalPossiblyEmptyPublicString,
  cwd_label: OptionalPublicString,
  latest_event_cursor: OptionalPossiblyEmptyPublicString,
  pending_input_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pending_approval_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  waiting_on: Schema.optionalKey(Schema.Array(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  checkpoint_count: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  archived_at: Schema.optional(Schema.NullOr(IsoDateTime)),
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
  status: OptionalPublicString,
  summary: OptionalPossiblyEmptyPublicString,
  url: OptionalPossiblyEmptyPublicString,
  branch: OptionalPossiblyEmptyPublicString,
  commit_sha: OptionalPossiblyEmptyPublicString,
  command: OptionalPublicString,
  started_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  completed_at: Schema.optional(Schema.NullOr(IsoDateTime)),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  metadata: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisArtifact = typeof JarvisArtifact.Type;

export const JarvisSessionEvent = Schema.Struct({
  event_id: JarvisSessionEventId,
  sequence: NonNegativeInt,
  session_ref: JarvisSessionRef,
  run_id: JarvisRunId,
  type: JarvisSessionEventType,
  occurred_at: IsoDateTime,
  turn_id: OptionalPossiblyEmptyPublicString,
  message_id: OptionalPossiblyEmptyPublicString,
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
  event: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
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
  requests: Schema.optionalKey(Schema.Array(JarvisSessionRequest)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  checkpoints: Schema.optionalKey(Schema.Array(JarvisSessionCheckpoint)).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type JarvisCockpitSnapshot = typeof JarvisCockpitSnapshot.Type;

export const JarvisRunsSnapshot = JarvisCockpitSnapshot;
export type JarvisRunsSnapshot = JarvisCockpitSnapshot;

export const JarvisCockpitSnapshotResult = Schema.Struct({
  ok: Schema.Boolean,
  snapshot: Schema.optionalKey(JarvisRunsSnapshot),
  error: Schema.optionalKey(
    Schema.Struct({
      message: TrimmedNonEmptyString,
    }),
  ),
});
export type JarvisCockpitSnapshotResult = typeof JarvisCockpitSnapshotResult.Type;

const JarvisReadError = Schema.Struct({
  message: TrimmedNonEmptyString,
});

export const JarvisProjectsResult = Schema.Struct({
  ok: Schema.Boolean,
  projects: Schema.optionalKey(Schema.Array(JarvisProject)),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectsResult = typeof JarvisProjectsResult.Type;

export const JarvisProjectResult = Schema.Struct({
  ok: Schema.Boolean,
  project: Schema.optionalKey(JarvisProject),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectResult = typeof JarvisProjectResult.Type;

export const JarvisProjectDeleteResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JsonObject),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectDeleteResult = typeof JarvisProjectDeleteResult.Type;

export const JarvisProjectMemoryResult = Schema.Struct({
  ok: Schema.Boolean,
  memory: Schema.optionalKey(JarvisProjectMemoryResponse),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectMemoryResult = typeof JarvisProjectMemoryResult.Type;

export const JarvisProjectMemoryWriteResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisProjectMemoryWriteResponse),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectMemoryWriteResult = typeof JarvisProjectMemoryWriteResult.Type;

export const JarvisProjectFilesResult = Schema.Struct({
  ok: Schema.Boolean,
  files: Schema.optionalKey(Schema.Array(JarvisProjectFile)),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectFilesResult = typeof JarvisProjectFilesResult.Type;

export const JarvisProjectFileUploadResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisProjectFileUploadResponse),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectFileUploadResult = typeof JarvisProjectFileUploadResult.Type;

export const JarvisProjectThreadsResult = Schema.Struct({
  ok: Schema.Boolean,
  threads: Schema.optionalKey(Schema.Array(JarvisProjectThread)),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectThreadsResult = typeof JarvisProjectThreadsResult.Type;

export const JarvisProjectThreadResult = Schema.Struct({
  ok: Schema.Boolean,
  thread: Schema.optionalKey(JarvisProjectThread),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectThreadResult = typeof JarvisProjectThreadResult.Type;

export const JarvisProjectThreadDetailResult = Schema.Struct({
  ok: Schema.Boolean,
  thread: Schema.optionalKey(JarvisProjectThreadDetail),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectThreadDetailResult = typeof JarvisProjectThreadDetailResult.Type;

export const JarvisProjectThreadTurnRpcResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisProjectThreadTurnResult),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisProjectThreadTurnRpcResult = typeof JarvisProjectThreadTurnRpcResult.Type;

export const JarvisWorkerWorktreePruneInput = Schema.Struct({
  workerId: JarvisWorkerId,
});
export type JarvisWorkerWorktreePruneInput = typeof JarvisWorkerWorktreePruneInput.Type;

export const JarvisWorkerWorktreePrunedItem = Schema.Struct({
  name: OptionalPossiblyEmptyPublicString,
  bytes: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
});
export type JarvisWorkerWorktreePrunedItem = typeof JarvisWorkerWorktreePrunedItem.Type;

export const JarvisWorkerWorktreePruneRefusal = Schema.Struct({
  target: OptionalPossiblyEmptyPublicString,
  reason: OptionalPossiblyEmptyPublicString,
});
export type JarvisWorkerWorktreePruneRefusal = typeof JarvisWorkerWorktreePruneRefusal.Type;

export const JarvisWorkerWorktreePruneResponse = Schema.Struct({
  ok: Schema.Boolean,
  worktrees: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  bytes: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  pruned: Schema.Array(JarvisWorkerWorktreePrunedItem).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  refused: Schema.Array(JarvisWorkerWorktreePruneRefusal).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
});
export type JarvisWorkerWorktreePruneResponse = typeof JarvisWorkerWorktreePruneResponse.Type;

export const JarvisWorkerWorktreePruneResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisWorkerWorktreePruneResponse),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisWorkerWorktreePruneResult = typeof JarvisWorkerWorktreePruneResult.Type;

export const JarvisReclamationSummary = Schema.Struct({
  records: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  events: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  worktrees: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
  bytes: NonNegativeInt.pipe(Schema.withDecodingDefault(Effect.succeed(0))),
});
export type JarvisReclamationSummary = typeof JarvisReclamationSummary.Type;

export const JarvisLifecycleResult = Schema.Struct({
  ok: Schema.Boolean,
  deleted: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  reclamation: JarvisReclamationSummary.pipe(
    Schema.withDecodingDefault(
      Effect.succeed({
        records: 0,
        events: 0,
        worktrees: 0,
        bytes: 0,
      }),
    ),
  ),
});
export type JarvisLifecycleResult = typeof JarvisLifecycleResult.Type;

export const JarvisLifecycleRpcResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisLifecycleResult),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisLifecycleRpcResult = typeof JarvisLifecycleRpcResult.Type;

export const JarvisSessionDetailResponse = Schema.Struct({
  session: JarvisWorkerSession,
  raw: Schema.optionalKey(JsonObject).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type JarvisSessionDetailResponse = typeof JarvisSessionDetailResponse.Type;

export const JarvisSessionRequestsResponse = Schema.Struct({
  requests: Schema.Array(JarvisSessionRequest),
});
export type JarvisSessionRequestsResponse = typeof JarvisSessionRequestsResponse.Type;

export const JarvisSessionCheckpointsResponse = Schema.Struct({
  checkpoints: Schema.Array(JarvisSessionCheckpoint),
});
export type JarvisSessionCheckpointsResponse = typeof JarvisSessionCheckpointsResponse.Type;

export const JarvisArtifactsPage = Schema.Struct({
  items: Schema.Array(JarvisArtifact),
  cursor: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  has_more: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type JarvisArtifactsPage = typeof JarvisArtifactsPage.Type;

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

export const JarvisWorkItemPreview = Schema.Struct({
  source: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  repo: OptionalPossiblyEmptyPublicString,
  kind: OptionalPossiblyEmptyPublicString,
});
export type JarvisWorkItemPreview = typeof JarvisWorkItemPreview.Type;

export const JarvisStartWorkValidation = Schema.Struct({
  can_start: Schema.Boolean,
  source: OptionalPossiblyEmptyPublicString,
  operation: OptionalPossiblyEmptyPublicString,
  repo: OptionalPossiblyEmptyPublicString,
  worker_id: OptionalPossiblyEmptyPublicString,
  engine: OptionalPossiblyEmptyPublicString,
  engines: Schema.Array(JarvisEngineId).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  engine_strategy: OptionalPossiblyEmptyPublicString,
  landing_mode: OptionalPossiblyEmptyPublicString,
  work_item: Schema.optional(Schema.NullOr(JarvisWorkItemPreview)),
  missing: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  missing_authority: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  reasons: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  notes: Schema.Array(TrimmedNonEmptyString).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
});
export type JarvisStartWorkValidation = typeof JarvisStartWorkValidation.Type;

export const JarvisStartWorkValidationResult = Schema.Struct({
  ok: Schema.Boolean,
  api_version: Schema.Literal("v1"),
  schema_version: Schema.Number,
  validation: Schema.optional(JarvisStartWorkValidation),
  error: Schema.optional(
    Schema.Struct({
      code: TrimmedNonEmptyString,
      message: TrimmedNonEmptyString,
      recoverable: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
    }),
  ),
});
export type JarvisStartWorkValidationResult = typeof JarvisStartWorkValidationResult.Type;

export const JarvisStartWorkValidationRpcResult = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(JarvisStartWorkValidationResult),
  error: Schema.optionalKey(JarvisReadError),
});
export type JarvisStartWorkValidationRpcResult = typeof JarvisStartWorkValidationRpcResult.Type;

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

export const JarvisArchiveInput = Schema.Struct({
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisArchiveInput = typeof JarvisArchiveInput.Type;

export const JarvisDeleteInput = Schema.Struct({
  idempotency_key: Schema.optional(TrimmedNonEmptyString),
  metadata: Schema.optionalKey(JarvisWriteMetadata).pipe(
    Schema.withDecodingDefault(Effect.succeed({ surface: "jarvis-cockpit" })),
  ),
});
export type JarvisDeleteInput = typeof JarvisDeleteInput.Type;

export const JarvisCloseSessionInput = JarvisDeleteInput;
export type JarvisCloseSessionInput = typeof JarvisCloseSessionInput.Type;

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
