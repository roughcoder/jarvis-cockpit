import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import {
  DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthReviewWriteScope,
  AuthRelayWriteScope,
  AuthTerminalOperateScope,
  AuthAccessReadScope,
  AuthAccessStreamError,
  type AuthAccessStreamEvent,
  type AuthEnvironmentScope,
  AuthSessionId,
  CommandId,
  type DiscoveredLocalServerList,
  EventId,
  type OrchestrationCommand,
  type GitActionProgressEvent,
  type GitManagerServiceError,
  type JarvisProjectThreadDetail,
  type JarvisProjectThreadMessage,
  type JarvisProjectThreadStreamItem,
  OrchestrationDispatchCommandError,
  type OrchestrationEvent,
  type OrchestrationShellStreamEvent,
  type OrchestrationShellStreamItem,
  type OrchestrationShellSnapshot,
  type OrchestrationThreadStreamItem,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  ORCHESTRATION_WS_METHODS,
  type ProjectEntriesFailure,
  type ProjectFileFailure,
  type ProjectFileOperation,
  ProjectListEntriesError,
  ProjectReadFileError,
  ProjectSearchEntriesError,
  ProjectWriteFileError,
  RelayClientInstallFailedError,
  type RelayClientInstallProgressEvent,
  OrchestrationReplayEventsError,
  type FilesystemBrowseFailure,
  FilesystemBrowseError,
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  EnvironmentAuthorizationError,
  ThreadId,
  type TerminalAttachStreamEvent,
  type TerminalError,
  type TerminalEvent,
  type TerminalMetadataStreamEvent,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import { clamp } from "effect/Number";
import { HttpRouter, HttpServerRequest, HttpServerRespondable } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import * as CheckpointDiffQuery from "./checkpointing/CheckpointDiffQuery.ts";
import * as ServerConfig from "./config.ts";
import * as Keybindings from "./keybindings.ts";
import * as ExternalLauncher from "./process/externalLauncher.ts";
import { normalizeDispatchCommand } from "./orchestration/Normalizer.ts";
import * as OrchestrationEngine from "./orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  observeRpcEffect as instrumentRpcEffect,
  observeRpcStream as instrumentRpcStream,
  observeRpcStreamEffect as instrumentRpcStreamEffect,
} from "./observability/RpcInstrumentation.ts";
import * as ProviderRegistry from "./provider/Services/ProviderRegistry.ts";
import * as ProviderMaintenanceRunner from "./provider/providerMaintenanceRunner.ts";
import * as ServerLifecycleEvents from "./serverLifecycleEvents.ts";
import * as ServerRuntimeStartup from "./serverRuntimeStartup.ts";
import * as ServerSettings from "./serverSettings.ts";
import * as TextGeneration from "./textGeneration/TextGeneration.ts";
import * as TerminalManager from "./terminal/Manager.ts";
import * as PreviewAutomationBroker from "./mcp/PreviewAutomationBroker.ts";
import * as PreviewManager from "./preview/Manager.ts";
import { issueAssetUrl } from "./assets/AssetAccess.ts";
import * as PortScanner from "./preview/PortScanner.ts";
import * as WorkspaceEntries from "./workspace/WorkspaceEntries.ts";
import * as WorkspaceFileSystem from "./workspace/WorkspaceFileSystem.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";
import * as VcsStatusBroadcaster from "./vcs/VcsStatusBroadcaster.ts";
import * as VcsProvisioningService from "./vcs/VcsProvisioningService.ts";
import * as GitWorkflowService from "./git/GitWorkflowService.ts";
import * as ReviewService from "./review/ReviewService.ts";
import * as ProjectSetupScriptRunner from "./project/ProjectSetupScriptRunner.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as ProcessDiagnostics from "./diagnostics/ProcessDiagnostics.ts";
import * as ProcessResourceMonitor from "./diagnostics/ProcessResourceMonitor.ts";
import * as TraceDiagnostics from "./diagnostics/TraceDiagnostics.ts";
import {
  checkJarvisBrain,
  JarvisClientError,
  makeJarvisClient,
  resolveJarvisBrainConnection,
  type JarvisClient,
  type JarvisCockpitEvent,
} from "./jarvis/JarvisClient.ts";
import {
  coalesceJarvisChanges,
  JARVIS_SSE_SHELL_DEBOUNCE,
  makeJarvisEventsHub,
  type JarvisEventsHub,
} from "./jarvis/JarvisEvents.ts";
import { makeJarvisOAuthAccessToken } from "./jarvis/JarvisOAuth.ts";
import { dispatchJarvisCommand } from "./jarvis/JarvisDispatch.ts";
import {
  loadJarvisArchivedShellSnapshot,
  loadJarvisShellSnapshot,
  loadJarvisThreadDetail,
  shouldUseJarvisCockpitReads,
} from "./jarvis/JarvisOrchestrationReadModel.ts";
import {
  jarvisSessionIdFromThreadId,
  mapJarvisRunsSnapshotToShellSnapshot,
} from "./jarvis/JarvisProjectionMapper.ts";
import * as SourceControlDiscovery from "./sourceControl/SourceControlDiscovery.ts";
import * as SourceControlRepositoryService from "./sourceControl/SourceControlRepositoryService.ts";
import * as AzureDevOpsCli from "./sourceControl/AzureDevOpsCli.ts";
import * as BitbucketApi from "./sourceControl/BitbucketApi.ts";
import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import * as ProjectPullRequests from "./sourceControl/projectPullRequests.ts";
import * as GitLabCli from "./sourceControl/GitLabCli.ts";
import * as SourceControlProviderRegistry from "./sourceControl/SourceControlProviderRegistry.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "./vcs/VcsDriverRegistry.ts";
import * as VcsProjectConfig from "./vcs/VcsProjectConfig.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";
import * as PairingGrantStore from "./auth/PairingGrantStore.ts";
import * as SessionStore from "./auth/SessionStore.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import { importProjectSourceFromUrl } from "./projectSourceImport.ts";
import { failEnvironmentAuthInvalid, failEnvironmentInternal } from "./auth/http.ts";
import * as RelayClient from "@t3tools/shared/relayClient";

class ProjectSourceImportError extends Schema.TaggedErrorClass<ProjectSourceImportError>()(
  "ProjectSourceImportError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return this.cause instanceof Error && this.cause.message.trim().length > 0
      ? this.cause.message
      : "Project source import failed.";
  }
}

const isOrchestrationDispatchCommandError = Schema.is(OrchestrationDispatchCommandError);

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const DEFAULT_JARVIS_COCKPIT_POLL_INTERVAL_SECONDS = 2;
const configuredJarvisCockpitPollIntervalSeconds = Number.parseFloat(
  process.env.JARVIS_COCKPIT_POLL_INTERVAL ?? "",
);
const JARVIS_COCKPIT_POLL_INTERVAL = Duration.seconds(
  Number.isFinite(configuredJarvisCockpitPollIntervalSeconds) &&
    configuredJarvisCockpitPollIntervalSeconds > 0
    ? configuredJarvisCockpitPollIntervalSeconds
    : DEFAULT_JARVIS_COCKPIT_POLL_INTERVAL_SECONDS,
);
const JARVIS_SSE_RECONCILIATION_INTERVAL = Duration.seconds(30);

function streamFromOption<A>(option: Option.Option<A>): Stream.Stream<A> {
  return Option.isSome(option) ? Stream.succeed(option.value) : Stream.empty;
}

function jarvisFallbackOrReconciliationStream<A>(
  jarvisEvents: JarvisEventsHub,
  activeWhenLive: boolean,
  interval: Duration.Duration,
  refresh: () => Effect.Effect<Option.Option<A>, never>,
): Stream.Stream<A> {
  return Stream.fromSchedule(Schedule.spaced(interval)).pipe(
    Stream.mapEffect(() =>
      jarvisEvents.isLive.pipe(
        Effect.flatMap((isLive) =>
          isLive === activeWhenLive ? refresh() : Effect.succeed(Option.none<A>()),
        ),
      ),
    ),
    Stream.flatMap((event) => (Option.isSome(event) ? Stream.succeed(event.value) : Stream.empty)),
  );
}

function jarvisEventField(event: JarvisCockpitEvent, key: string) {
  const envelopeValue = (event as unknown as Record<string, unknown>)[key];
  if (typeof envelopeValue === "string") {
    return envelopeValue;
  }
  if (
    typeof event.payload === "object" &&
    event.payload !== null &&
    !Array.isArray(event.payload)
  ) {
    const payloadValue = (event.payload as Record<string, unknown>)[key];
    return typeof payloadValue === "string" ? payloadValue : undefined;
  }
  return undefined;
}

function jarvisThreadChangeMatches(
  jarvisEvents: JarvisEventsHub,
  sessionRef: string,
  event: JarvisCockpitEvent,
): Effect.Effect<boolean> {
  if (
    event.type !== "session.updated" &&
    event.type !== "session.event" &&
    event.type !== "run.event"
  ) {
    return Effect.succeed(false);
  }
  if (jarvisEventField(event, "session_ref") === sessionRef) {
    return Effect.succeed(true);
  }
  const runId = jarvisEventField(event, "run_id");
  if (runId === undefined) {
    return Effect.succeed(false);
  }
  return jarvisEvents.appliedSnapshot.pipe(
    Effect.map(
      (snapshot) =>
        Option.getOrUndefined(snapshot)?.sessions.find(
          (session) => session.session_ref === sessionRef,
        )?.run_id === runId,
    ),
  );
}

function jarvisProjectThreadChangeMatches(
  projectId: string,
  threadId: string,
  event: JarvisCockpitEvent,
): boolean {
  return (
    (event.type === "session.updated" ||
      event.type === "session.event" ||
      event.type === "run.event") &&
    jarvisEventField(event, "project_id") === projectId &&
    jarvisEventField(event, "thread_id") === threadId
  );
}

function jarvisAppliedShellRefresh(
  jarvisEvents: JarvisEventsHub,
): Effect.Effect<Option.Option<OrchestrationShellStreamItem>> {
  return jarvisEvents.appliedShellSnapshot.pipe(
    Effect.map(
      Option.map(
        (snapshot): OrchestrationShellStreamItem => ({
          kind: "snapshot" as const,
          snapshot,
        }),
      ),
    ),
  );
}

function loadJarvisShellSnapshotFromHub(
  jarvisClient: JarvisClient,
  jarvisEvents: JarvisEventsHub,
): Effect.Effect<OrchestrationShellSnapshot, JarvisClientError> {
  return Effect.all([jarvisEvents.isLive, jarvisEvents.appliedShellSnapshot]).pipe(
    Effect.flatMap(([isLive, snapshot]) =>
      isLive && Option.isSome(snapshot)
        ? Effect.succeed(snapshot.value)
        : loadJarvisShellSnapshot(jarvisClient),
    ),
  );
}

function jarvisShellPollingStream(
  jarvisClient: JarvisClient,
  jarvisEvents: JarvisEventsHub,
): Stream.Stream<OrchestrationShellStreamItem> {
  const restRefresh = () =>
    loadJarvisShellSnapshot(jarvisClient).pipe(
      Effect.map((snapshot) => {
        const item: OrchestrationShellStreamItem = {
          kind: "snapshot" as const,
          snapshot,
        };
        return Option.some(item);
      }),
      Effect.tapError((cause) =>
        Effect.logWarning("Jarvis shell poll failed", {
          cause,
        }),
      ),
      Effect.orElseSucceed(() => Option.none<OrchestrationShellStreamItem>()),
    );
  const reconciliationRefresh = () =>
    jarvisEvents.reconcileSnapshot.pipe(
      Effect.map((snapshot) =>
        Option.some<OrchestrationShellStreamItem>({
          kind: "snapshot" as const,
          snapshot: mapJarvisRunsSnapshotToShellSnapshot(snapshot),
        }),
      ),
      Effect.tapError((cause) =>
        Effect.logWarning("Jarvis shell reconciliation failed", { cause }),
      ),
      Effect.orElseSucceed(() => Option.none<OrchestrationShellStreamItem>()),
    );
  return Stream.merge(
    coalesceJarvisChanges(jarvisEvents.changes, JARVIS_SSE_SHELL_DEBOUNCE).pipe(
      // The hub has already applied each validated frame; no REST read on this path.
      Stream.mapEffect(() => jarvisAppliedShellRefresh(jarvisEvents), { concurrency: 1 }),
      Stream.flatMap(streamFromOption),
    ),
    Stream.merge(
      jarvisFallbackOrReconciliationStream(
        jarvisEvents,
        true,
        JARVIS_SSE_RECONCILIATION_INTERVAL,
        reconciliationRefresh,
      ),
      jarvisFallbackOrReconciliationStream(
        jarvisEvents,
        false,
        JARVIS_COCKPIT_POLL_INTERVAL,
        restRefresh,
      ),
    ),
  );
}

function jarvisThreadPollingStream(
  jarvisClient: JarvisClient,
  jarvisEvents: JarvisEventsHub,
  threadId: ThreadId,
): Stream.Stream<OrchestrationThreadStreamItem> {
  const sessionRef = jarvisSessionIdFromThreadId(threadId);
  const refresh = () =>
    loadJarvisThreadDetail(jarvisClient, threadId).pipe(
      Effect.map((thread) =>
        Option.map(
          thread,
          (value): OrchestrationThreadStreamItem => ({
            kind: "snapshot" as const,
            snapshot: {
              snapshotSequence: 0,
              thread: value,
            },
          }),
        ),
      ),
      Effect.tapError((cause) =>
        Effect.logWarning("Jarvis thread poll failed", {
          cause,
          threadId,
        }),
      ),
      Effect.orElseSucceed(() => Option.none<OrchestrationThreadStreamItem>()),
    );
  return Stream.merge(
    coalesceJarvisChanges(
      jarvisEvents.changes.pipe(
        Stream.mapEffect((event) =>
          sessionRef === null
            ? Effect.succeed(Option.none<JarvisCockpitEvent>())
            : jarvisThreadChangeMatches(jarvisEvents, sessionRef, event).pipe(
                Effect.map((matches) => (matches ? Option.some(event) : Option.none())),
              ),
        ),
        Stream.flatMap(streamFromOption),
      ),
    ).pipe(Stream.mapEffect(refresh, { concurrency: 1 }), Stream.flatMap(streamFromOption)),
    Stream.merge(
      jarvisFallbackOrReconciliationStream(
        jarvisEvents,
        true,
        JARVIS_SSE_RECONCILIATION_INTERVAL,
        refresh,
      ),
      jarvisFallbackOrReconciliationStream(
        jarvisEvents,
        false,
        JARVIS_COCKPIT_POLL_INTERVAL,
        refresh,
      ),
    ),
  );
}

function projectThreadMessageEquals(
  left: JarvisProjectThreadMessage,
  right: JarvisProjectThreadMessage,
): boolean {
  return (
    left.role === right.role &&
    left.peer_id === right.peer_id &&
    left.content === right.content &&
    left.observed_at === right.observed_at
  );
}

function projectThreadMetadataEquals(
  left: JarvisProjectThreadDetail,
  right: JarvisProjectThreadDetail,
): boolean {
  const { messages: _leftMessages, ...leftMetadata } = left;
  const { messages: _rightMessages, ...rightMetadata } = right;
  return Equal.equals(leftMetadata, rightMetadata);
}

function projectThreadStreamItems(
  previous: JarvisProjectThreadDetail,
  next: JarvisProjectThreadDetail,
): ReadonlyArray<JarvisProjectThreadStreamItem> {
  const sharedMessageCount = Math.min(previous.messages.length, next.messages.length);
  const historyIsPrefix = Array.from({ length: sharedMessageCount }).every((_, index) =>
    projectThreadMessageEquals(previous.messages[index]!, next.messages[index]!),
  );
  if (!historyIsPrefix || next.messages.length < previous.messages.length) {
    return [{ kind: "snapshot", thread: next }];
  }

  const items: JarvisProjectThreadStreamItem[] = [];
  if (!projectThreadMetadataEquals(previous, next)) {
    const { messages: _messages, ...thread } = next;
    items.push({ kind: "thread-updated", thread });
  }
  const appendedMessages = next.messages.slice(previous.messages.length);
  if (appendedMessages.length > 0) {
    items.push({ kind: "messages-appended", messages: appendedMessages });
  }
  return items;
}

export function jarvisProjectThreadPollingStream(
  jarvisClient: JarvisClient,
  jarvisEvents: JarvisEventsHub,
  projectId: string,
  threadId: string,
  initialThread: JarvisProjectThreadDetail,
): Stream.Stream<JarvisProjectThreadStreamItem> {
  return Stream.unwrap(
    Ref.make(initialThread).pipe(
      Effect.map((previousThread) =>
        (() => {
          const refresh = () =>
            jarvisClient.getProjectThread(projectId, threadId).pipe(
              Effect.flatMap((nextThread) =>
                Ref.getAndSet(previousThread, nextThread).pipe(
                  Effect.map((previous) => projectThreadStreamItems(previous, nextThread)),
                ),
              ),
              Effect.tapError((cause) =>
                Effect.logWarning("Jarvis project thread poll failed", {
                  cause,
                  projectId,
                  threadId,
                }),
              ),
              Effect.orElseSucceed(() => [] as ReadonlyArray<JarvisProjectThreadStreamItem>),
            );
          const flatten = (items: ReadonlyArray<JarvisProjectThreadStreamItem>) =>
            items.length > 0 ? Stream.fromIterable(items) : Stream.empty;
          const triggers = Stream.merge(
            coalesceJarvisChanges(
              jarvisEvents.changes.pipe(
                Stream.filter((event) =>
                  jarvisProjectThreadChangeMatches(projectId, threadId, event),
                ),
              ),
            ),
            // Cockpit SSE has no connector project-thread frames yet, so a
            // live SSE cache cannot replace this conversation poll.
            Stream.fromSchedule(Schedule.spaced(JARVIS_COCKPIT_POLL_INTERVAL)).pipe(
              Stream.map(() => undefined),
            ),
          );
          return triggers.pipe(
            Stream.mapEffect(refresh, { concurrency: 1 }),
            Stream.flatMap(flatten),
          );
        })(),
      ),
    ),
  );
}

function unexpectedCompatibilityError(error: never): never {
  throw new Error(`Unhandled compatibility error: ${String(error)}`);
}

/** Preserve the setup runner's broader pre-refactor message normalization. */
function legacySetupFailureDescription(cause: unknown): string {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return String(cause);
}

function projectEntriesFailureContext(error: WorkspaceEntries.WorkspaceEntriesError): {
  readonly failure: ProjectEntriesFailure;
  readonly normalizedCwd?: string;
  readonly timeout?: string;
  readonly detail?: string;
} {
  switch (error._tag) {
    case "WorkspaceRootNotExistsError":
      return {
        failure: "workspace_root_not_found",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceRootCreateFailedError":
      return {
        failure: "workspace_root_create_failed",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceRootStatFailedError":
      return {
        failure: "workspace_root_stat_failed",
        normalizedCwd: error.normalizedWorkspaceRoot,
        detail: error.phase,
      };
    case "WorkspaceRootNotDirectoryError":
      return {
        failure: "workspace_root_not_directory",
        normalizedCwd: error.normalizedWorkspaceRoot,
      };
    case "WorkspaceSearchIndexCreateFailed":
      return {
        failure: "search_index_create_failed",
        normalizedCwd: error.cwd,
        detail: error.reason,
      };
    case "WorkspaceSearchIndexScanTimedOut":
      return {
        failure: "search_index_scan_timed_out",
        normalizedCwd: error.cwd,
        timeout: error.timeout,
      };
    case "WorkspaceSearchIndexSearchFailed":
      return {
        failure: "search_index_search_failed",
        normalizedCwd: error.cwd,
        detail: error.reason,
      };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function filesystemBrowseFailureContext(error: WorkspaceEntries.WorkspaceEntriesBrowseError): {
  readonly failure: FilesystemBrowseFailure;
  readonly parentPath?: string;
  readonly platform?: string;
} {
  switch (error._tag) {
    case "WorkspaceEntriesWindowsPathUnsupportedError":
      return { failure: "windows_path_unsupported", platform: error.platform };
    case "WorkspaceEntriesCurrentProjectRequiredError":
      return { failure: "current_project_required" };
    case "WorkspaceEntriesReadDirectoryError":
      return { failure: "read_directory_failed", parentPath: error.parentPath };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function projectFileFailureContext(
  error:
    | WorkspaceFileSystem.WorkspaceFileSystemError
    | WorkspacePaths.WorkspacePathOutsideRootError,
): {
  readonly failure: ProjectFileFailure;
  readonly resolvedPath?: string;
  readonly resolvedWorkspaceRoot?: string;
  readonly operation?: ProjectFileOperation;
  readonly operationPath?: string;
} {
  switch (error._tag) {
    case "WorkspacePathOutsideRootError":
      return { failure: "workspace_path_outside_root" };
    case "WorkspaceFileSystemOperationError":
      return {
        failure: "operation_failed",
        resolvedPath: error.resolvedPath,
        operation: error.operation,
        operationPath: error.operationPath,
      };
    case "WorkspaceFilePathEscapeError":
      return {
        failure: "resolved_path_outside_root",
        resolvedPath: error.resolvedPath,
        resolvedWorkspaceRoot: error.resolvedWorkspaceRoot,
      };
    case "WorkspacePathNotFileError":
      return { failure: "path_not_file", resolvedPath: error.resolvedPath };
    case "WorkspaceBinaryFileError":
      return { failure: "binary_file", resolvedPath: error.resolvedPath };
    default:
      return unexpectedCompatibilityError(error);
  }
}

function projectSetupScriptCompatibilityDetail(
  error: ProjectSetupScriptRunner.ProjectSetupScriptRunnerError,
): string {
  switch (error._tag) {
    case "ProjectSetupScriptOperationError":
      return legacySetupFailureDescription(error.cause);
    case "ProjectSetupScriptProjectNotFoundError":
      return "Project was not found for setup script execution.";
    default:
      return unexpectedCompatibilityError(error);
  }
}

function isThreadDetailEvent(event: OrchestrationEvent): event is Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.message-sent"
      | "thread.proposed-plan-upserted"
      | "thread.activity-appended"
      | "thread.turn-diff-completed"
      | "thread.reverted"
      | "thread.session-set";
  }
> {
  return (
    event.type === "thread.message-sent" ||
    event.type === "thread.proposed-plan-upserted" ||
    event.type === "thread.activity-appended" ||
    event.type === "thread.turn-diff-completed" ||
    event.type === "thread.reverted" ||
    event.type === "thread.session-set"
  );
}

const PROVIDER_STATUS_DEBOUNCE_MS = 200;

const RPC_REQUIRED_SCOPE = new Map<string, AuthEnvironmentScope>([
  [ORCHESTRATION_WS_METHODS.dispatchCommand, AuthOrchestrationOperateScope],
  [ORCHESTRATION_WS_METHODS.getTurnDiff, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.getFullThreadDiff, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.replayEvents, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.subscribeShell, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot, AuthOrchestrationReadScope],
  [ORCHESTRATION_WS_METHODS.subscribeThread, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetConfig, AuthOrchestrationReadScope],
  [WS_METHODS.serverRefreshProviders, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUpdateProvider, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUpsertKeybinding, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRemoveKeybinding, AuthOrchestrationOperateScope],
  [WS_METHODS.serverGetSettings, AuthOrchestrationReadScope],
  [WS_METHODS.serverUpdateSettings, AuthOrchestrationOperateScope],
  [WS_METHODS.serverCheckJarvisBrain, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisCapabilities, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisMcpStatus, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisSnapshot, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjects, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProject, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjectPullRequests, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjectMemory, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjectFiles, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjectThreads, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetJarvisProjectThread, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeJarvisProjectThread, AuthOrchestrationReadScope],
  [WS_METHODS.serverValidateJarvisWork, AuthOrchestrationReadScope],
  [WS_METHODS.serverPruneJarvisWorkerWorktrees, AuthOrchestrationOperateScope],
  [WS_METHODS.serverCloseJarvisSession, AuthOrchestrationOperateScope],
  [WS_METHODS.serverArchiveJarvisSession, AuthOrchestrationOperateScope],
  [WS_METHODS.serverDeleteJarvisSession, AuthOrchestrationOperateScope],
  [WS_METHODS.serverDeleteJarvisRun, AuthOrchestrationOperateScope],
  [WS_METHODS.serverCreateJarvisProject, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUpdateJarvisProject, AuthOrchestrationOperateScope],
  [WS_METHODS.serverArchiveJarvisProject, AuthOrchestrationOperateScope],
  [WS_METHODS.serverDeleteJarvisProject, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRecordJarvisProjectFinding, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRecordJarvisProjectDecision, AuthOrchestrationOperateScope],
  [WS_METHODS.serverForgetJarvisProjectMemory, AuthOrchestrationOperateScope],
  [WS_METHODS.serverCorrectJarvisProjectMemory, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUploadJarvisProjectFile, AuthOrchestrationOperateScope],
  [WS_METHODS.serverImportJarvisProjectSource, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRetractJarvisProjectFile, AuthOrchestrationOperateScope],
  [WS_METHODS.serverCreateJarvisProjectThread, AuthOrchestrationOperateScope],
  [WS_METHODS.serverArchiveJarvisProjectThread, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRenameJarvisProjectThread, AuthOrchestrationOperateScope],
  [WS_METHODS.serverGenerateThreadTitle, AuthOrchestrationOperateScope],
  [WS_METHODS.serverUnarchiveJarvisProjectThread, AuthOrchestrationOperateScope],
  [WS_METHODS.serverSendJarvisProjectThreadTurn, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRespondJarvisProjectThreadApproval, AuthOrchestrationOperateScope],
  [WS_METHODS.serverRespondJarvisProjectThreadInput, AuthOrchestrationOperateScope],
  [WS_METHODS.serverInterruptJarvisProjectThread, AuthOrchestrationOperateScope],
  [WS_METHODS.serverDiscoverSourceControl, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetTraceDiagnostics, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetProcessDiagnostics, AuthOrchestrationReadScope],
  [WS_METHODS.serverGetProcessResourceHistory, AuthOrchestrationReadScope],
  [WS_METHODS.serverSignalProcess, AuthOrchestrationOperateScope],
  [WS_METHODS.cloudGetRelayClientStatus, AuthRelayWriteScope],
  [WS_METHODS.cloudInstallRelayClient, AuthRelayWriteScope],
  [WS_METHODS.sourceControlLookupRepository, AuthOrchestrationReadScope],
  [WS_METHODS.sourceControlCloneRepository, AuthOrchestrationOperateScope],
  [WS_METHODS.sourceControlPublishRepository, AuthOrchestrationOperateScope],
  [WS_METHODS.projectsListEntries, AuthOrchestrationReadScope],
  [WS_METHODS.projectsReadFile, AuthOrchestrationReadScope],
  [WS_METHODS.projectsSearchEntries, AuthOrchestrationReadScope],
  [WS_METHODS.projectsWriteFile, AuthOrchestrationOperateScope],
  [WS_METHODS.shellOpenInEditor, AuthOrchestrationOperateScope],
  [WS_METHODS.filesystemBrowse, AuthOrchestrationReadScope],
  [WS_METHODS.assetsCreateUrl, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeVcsStatus, AuthOrchestrationReadScope],
  [WS_METHODS.vcsRefreshStatus, AuthOrchestrationReadScope],
  [WS_METHODS.vcsPull, AuthOrchestrationOperateScope],
  [WS_METHODS.gitRunStackedAction, AuthOrchestrationOperateScope],
  [WS_METHODS.gitResolvePullRequest, AuthOrchestrationOperateScope],
  [WS_METHODS.gitPreparePullRequestThread, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsListRefs, AuthOrchestrationReadScope],
  [WS_METHODS.vcsCreateWorktree, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsRemoveWorktree, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsCreateRef, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsSwitchRef, AuthOrchestrationOperateScope],
  [WS_METHODS.vcsInit, AuthOrchestrationOperateScope],
  [WS_METHODS.reviewGetDiffPreview, AuthReviewWriteScope],
  [WS_METHODS.terminalOpen, AuthTerminalOperateScope],
  [WS_METHODS.terminalAttach, AuthTerminalOperateScope],
  [WS_METHODS.terminalWrite, AuthTerminalOperateScope],
  [WS_METHODS.terminalResize, AuthTerminalOperateScope],
  [WS_METHODS.terminalClear, AuthTerminalOperateScope],
  [WS_METHODS.terminalRestart, AuthTerminalOperateScope],
  [WS_METHODS.terminalClose, AuthTerminalOperateScope],
  [WS_METHODS.subscribeTerminalEvents, AuthTerminalOperateScope],
  [WS_METHODS.subscribeTerminalMetadata, AuthTerminalOperateScope],
  [WS_METHODS.previewOpen, AuthOrchestrationOperateScope],
  [WS_METHODS.previewNavigate, AuthOrchestrationOperateScope],
  [WS_METHODS.previewResize, AuthOrchestrationOperateScope],
  [WS_METHODS.previewRefresh, AuthOrchestrationOperateScope],
  [WS_METHODS.previewClose, AuthOrchestrationOperateScope],
  [WS_METHODS.previewList, AuthOrchestrationReadScope],
  [WS_METHODS.previewReportStatus, AuthOrchestrationOperateScope],
  [WS_METHODS.previewAutomationConnect, AuthOrchestrationOperateScope],
  [WS_METHODS.previewAutomationRespond, AuthOrchestrationOperateScope],
  [WS_METHODS.previewAutomationFocusHost, AuthOrchestrationOperateScope],
  [WS_METHODS.subscribePreviewEvents, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeDiscoveredLocalServers, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeServerConfig, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeServerLifecycle, AuthOrchestrationReadScope],
  [WS_METHODS.subscribeAuthAccess, AuthAccessReadScope],
]);

function toAuthAccessStreamEvent(
  change: PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange,
  revision: number,
  currentSessionId: AuthSessionId,
): AuthAccessStreamEvent {
  switch (change.type) {
    case "pairingLinkUpserted":
      return {
        version: 1,
        revision,
        type: "pairingLinkUpserted",
        payload: change.pairingLink,
      };
    case "pairingLinkRemoved":
      return {
        version: 1,
        revision,
        type: "pairingLinkRemoved",
        payload: { id: change.id },
      };
    case "clientUpserted":
      return {
        version: 1,
        revision,
        type: "clientUpserted",
        payload: {
          ...change.clientSession,
          current: change.clientSession.sessionId === currentSessionId,
        },
      };
    case "clientRemoved":
      return {
        version: 1,
        revision,
        type: "clientRemoved",
        payload: { sessionId: change.sessionId },
      };
  }
}

const makeWsRpcLayer = (
  currentSession: EnvironmentAuth.AuthenticatedSession,
  previewAutomationBroker: PreviewAutomationBroker.PreviewAutomationBroker["Service"],
  jarvisEvents: JarvisEventsHub,
) =>
  WsRpcGroup.toLayer(
    Effect.gen(function* () {
      const currentSessionId = currentSession.sessionId;
      const crypto = yield* Crypto.Crypto;
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
      const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
      const checkpointDiffQuery = yield* CheckpointDiffQuery.CheckpointDiffQuery;
      const keybindings = yield* Keybindings.Keybindings;
      const externalLauncher = yield* ExternalLauncher.ExternalLauncher;
      const gitWorkflow = yield* GitWorkflowService.GitWorkflowService;
      const review = yield* ReviewService.ReviewService;
      const vcsProvisioning = yield* VcsProvisioningService.VcsProvisioningService;
      const vcsStatusBroadcaster = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
      const terminalManager = yield* TerminalManager.TerminalManager;
      const previewManager = yield* PreviewManager.PreviewManager;
      const portDiscovery = yield* PortScanner.PortDiscovery;
      const providerRegistry = yield* ProviderRegistry.ProviderRegistry;
      const providerMaintenanceRunner = yield* ProviderMaintenanceRunner.ProviderMaintenanceRunner;
      const config = yield* ServerConfig.ServerConfig;
      const lifecycleEvents = yield* ServerLifecycleEvents.ServerLifecycleEvents;
      const serverSettings = yield* ServerSettings.ServerSettingsService;
      const textGeneration = yield* TextGeneration.TextGeneration;
      const secretStore = yield* ServerSecretStore.ServerSecretStore;
      const jarvisOAuthAccessToken = (operation: string) =>
        makeJarvisOAuthAccessToken({ config, secrets: secretStore }).pipe(
          Effect.mapError(
            (cause) =>
              new JarvisClientError({
                operation,
                message: "Failed to issue Jarvis OAuth access token.",
                cause,
              }),
          ),
        );
      const jarvisClient = makeJarvisClient({
        ...config,
        getSettings: serverSettings.getSettings,
        oauthAccessToken: jarvisOAuthAccessToken,
      });
      const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
      const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;
      const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
      const projectSetupScriptRunner = yield* ProjectSetupScriptRunner.ProjectSetupScriptRunner;
      const repositoryIdentityResolver =
        yield* RepositoryIdentityResolver.RepositoryIdentityResolver;
      const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const sourceControlDiscovery = yield* SourceControlDiscovery.SourceControlDiscovery;
      const automaticGitFetchInterval = serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.automaticGitFetchInterval),
        Effect.catch((cause) =>
          Effect.logWarning("Failed to read automatic Git fetch interval setting", {
            detail: cause.message,
          }).pipe(Effect.as(DEFAULT_AUTOMATIC_GIT_FETCH_INTERVAL)),
        ),
      );
      const sourceControlRepositories =
        yield* SourceControlRepositoryService.SourceControlRepositoryService;
      const projectPullRequests = yield* ProjectPullRequests.ProjectPullRequests;
      const bootstrapCredentials = yield* PairingGrantStore.PairingGrantStore;
      const sessions = yield* SessionStore.SessionStore;
      const processDiagnostics = yield* ProcessDiagnostics.ProcessDiagnostics;
      const processResourceMonitor = yield* ProcessResourceMonitor.ProcessResourceMonitor;
      const relayClient = yield* RelayClient.RelayClient;
      const authorizationError = (requiredScope: AuthEnvironmentScope) =>
        new EnvironmentAuthorizationError({
          message: `The authenticated token is missing required scope: ${requiredScope}.`,
          requiredScope,
        });
      const authorizeEffect = <A, E, R>(
        requiredScope: AuthEnvironmentScope,
        effect: Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E | EnvironmentAuthorizationError, R> =>
        currentSession.scopes.includes(requiredScope)
          ? effect
          : Effect.fail(authorizationError(requiredScope));
      const authorizeStream = <A, E, R>(
        requiredScope: AuthEnvironmentScope,
        stream: Stream.Stream<A, E, R>,
      ): Stream.Stream<A, E | EnvironmentAuthorizationError, R> =>
        currentSession.scopes.includes(requiredScope)
          ? stream
          : Stream.fail(authorizationError(requiredScope));
      const requiredScopeForMethod = (method: string): AuthEnvironmentScope => {
        const requiredScope = RPC_REQUIRED_SCOPE.get(method);
        if (requiredScope === undefined) {
          throw new Error(`RPC method ${method} has no declared authorization scope.`);
        }
        return requiredScope;
      };
      const observeRpcEffect = <A, E, R>(
        method: string,
        effect: Effect.Effect<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcEffect(
          method,
          authorizeEffect(requiredScopeForMethod(method), effect),
          traceAttributes,
        );
      const observeRpcStream = <A, E, R>(
        method: string,
        stream: Stream.Stream<A, E, R>,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStream(
          method,
          authorizeStream(requiredScopeForMethod(method), stream),
          traceAttributes,
        );
      const observeRpcStreamEffect = <A, StreamError, StreamContext, EffectError, EffectContext>(
        method: string,
        effect: Effect.Effect<
          Stream.Stream<A, StreamError, StreamContext>,
          EffectError,
          EffectContext
        >,
        traceAttributes?: Readonly<Record<string, unknown>>,
      ) =>
        instrumentRpcStreamEffect(
          method,
          authorizeEffect(requiredScopeForMethod(method), effect),
          traceAttributes,
        );
      const toDispatchCommandError = (cause: unknown, fallbackMessage: string) =>
        isOrchestrationDispatchCommandError(cause)
          ? cause
          : new OrchestrationDispatchCommandError({
              message: cause instanceof Error ? cause.message : fallbackMessage,
              cause,
            });
      const randomUUID = crypto.randomUUIDv4.pipe(
        Effect.mapError((cause) =>
          toDispatchCommandError(cause, "Failed to generate orchestration command identifier."),
        ),
      );
      const serverEventId = randomUUID.pipe(Effect.map(EventId.make));
      const serverCommandId = (tag: string) =>
        randomUUID.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));

      const loadAuthAccessSnapshot = () =>
        Effect.all({
          pairingLinks: serverAuth.listPairingLinks(),
          clientSessions: serverAuth.listClientSessions(currentSessionId),
        }).pipe(
          Effect.mapError(
            (error) =>
              new AuthAccessStreamError({
                message: error.message,
              }),
          ),
        );

      const appendSetupScriptActivity = (input: {
        readonly threadId: ThreadId;
        readonly kind: "setup-script.requested" | "setup-script.started" | "setup-script.failed";
        readonly summary: string;
        readonly createdAt: string;
        readonly payload: Record<string, unknown>;
        readonly tone: "info" | "error";
      }) =>
        Effect.all({
          commandId: serverCommandId("setup-script-activity"),
          activityId: serverEventId,
        }).pipe(
          Effect.flatMap(({ commandId, activityId }) =>
            orchestrationEngine.dispatch({
              type: "thread.activity.append",
              commandId,
              threadId: input.threadId,
              activity: {
                id: activityId,
                tone: input.tone,
                kind: input.kind,
                summary: input.summary,
                payload: input.payload,
                turnId: null,
                createdAt: input.createdAt,
              },
              createdAt: input.createdAt,
            }),
          ),
        );

      const toBootstrapDispatchCommandCauseError = (cause: Cause.Cause<unknown>) => {
        const error = Cause.squash(cause);
        return isOrchestrationDispatchCommandError(error)
          ? error
          : new OrchestrationDispatchCommandError({
              message:
                error instanceof Error ? error.message : "Failed to bootstrap thread turn start.",
              cause,
            });
      };

      const enrichProjectEvent = (
        event: OrchestrationEvent,
      ): Effect.Effect<OrchestrationEvent, never, never> => {
        switch (event.type) {
          case "project.created":
            return repositoryIdentityResolver.resolve(event.payload.workspaceRoot).pipe(
              Effect.map((repositoryIdentity) => ({
                ...event,
                payload: {
                  ...event.payload,
                  repositoryIdentity,
                },
              })),
            );
          case "project.meta-updated":
            return Effect.gen(function* () {
              const workspaceRoot =
                event.payload.workspaceRoot ??
                Option.match(
                  yield* projectionSnapshotQuery.getProjectShellById(event.payload.projectId),
                  {
                    onNone: () => null,
                    onSome: (project) => project.workspaceRoot,
                  },
                ) ??
                null;
              if (workspaceRoot === null) {
                return event;
              }

              const repositoryIdentity = yield* repositoryIdentityResolver.resolve(workspaceRoot);
              return {
                ...event,
                payload: {
                  ...event.payload,
                  repositoryIdentity,
                },
              } satisfies OrchestrationEvent;
            }).pipe(Effect.orElseSucceed(() => event));
          default:
            return Effect.succeed(event);
        }
      };

      const enrichOrchestrationEvents = (events: ReadonlyArray<OrchestrationEvent>) =>
        Effect.forEach(events, enrichProjectEvent, { concurrency: 4 });

      const toShellStreamEvent = (
        event: OrchestrationEvent,
      ): Effect.Effect<Option.Option<OrchestrationShellStreamEvent>, never, never> => {
        switch (event.type) {
          case "project.created":
          case "project.meta-updated":
            return projectionSnapshotQuery.getProjectShellById(event.payload.projectId).pipe(
              Effect.map((project) =>
                Option.map(project, (nextProject) => ({
                  kind: "project-upserted" as const,
                  sequence: event.sequence,
                  project: nextProject,
                })),
              ),
              Effect.orElseSucceed(() => Option.none()),
            );
          case "project.deleted":
            return Effect.succeed(
              Option.some({
                kind: "project-removed" as const,
                sequence: event.sequence,
                projectId: event.payload.projectId,
              }),
            );
          case "thread.deleted":
          case "thread.archived":
            return Effect.succeed(
              Option.some({
                kind: "thread-removed" as const,
                sequence: event.sequence,
                threadId: event.payload.threadId,
              }),
            );
          case "thread.unarchived":
            return projectionSnapshotQuery.getThreadShellById(event.payload.threadId).pipe(
              Effect.map((thread) =>
                Option.map(thread, (nextThread) => ({
                  kind: "thread-upserted" as const,
                  sequence: event.sequence,
                  thread: nextThread,
                })),
              ),
              Effect.orElseSucceed(() => Option.none()),
            );
          default:
            if (event.aggregateKind !== "thread") {
              return Effect.succeed(Option.none());
            }
            return projectionSnapshotQuery
              .getThreadShellById(ThreadId.make(event.aggregateId))
              .pipe(
                Effect.map((thread) =>
                  Option.map(thread, (nextThread) => ({
                    kind: "thread-upserted" as const,
                    sequence: event.sequence,
                    thread: nextThread,
                  })),
                ),
                Effect.orElseSucceed(() => Option.none()),
              );
        }
      };

      const dispatchBootstrapTurnStart = (
        command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
      ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> =>
        Effect.gen(function* () {
          const bootstrap = command.bootstrap;
          const { bootstrap: _bootstrap, ...finalTurnStartCommand } = command;
          let createdThread = false;
          let targetProjectId = bootstrap?.createThread?.projectId;
          let targetProjectCwd = bootstrap?.prepareWorktree?.projectCwd;
          let targetWorktreePath = bootstrap?.createThread?.worktreePath ?? null;

          const cleanupCreatedThread = () =>
            createdThread
              ? serverCommandId("bootstrap-thread-delete").pipe(
                  Effect.flatMap((commandId) =>
                    orchestrationEngine.dispatch({
                      type: "thread.delete",
                      commandId,
                      threadId: command.threadId,
                    }),
                  ),
                  Effect.ignoreCause({ log: true }),
                )
              : Effect.void;

          const recordSetupScriptLaunchFailure = (input: {
            readonly error: ProjectSetupScriptRunner.ProjectSetupScriptRunnerError;
            readonly requestedAt: string;
            readonly worktreePath: string;
          }) => {
            const detail = projectSetupScriptCompatibilityDetail(input.error);
            return appendSetupScriptActivity({
              threadId: command.threadId,
              kind: "setup-script.failed",
              summary: "Setup script failed to start",
              createdAt: input.requestedAt,
              payload: {
                detail,
                worktreePath: input.worktreePath,
              },
              tone: "error",
            }).pipe(
              Effect.ignoreCause({ log: false }),
              Effect.flatMap(() =>
                Effect.logWarning("bootstrap turn start failed to launch setup script", {
                  threadId: command.threadId,
                  worktreePath: input.worktreePath,
                  detail,
                }),
              ),
            );
          };

          const recordSetupScriptStarted = (input: {
            readonly requestedAt: string;
            readonly worktreePath: string;
            readonly scriptId: string;
            readonly scriptName: string;
            readonly terminalId: string;
          }) =>
            Effect.gen(function* () {
              const startedAt = yield* nowIso;
              const payload = {
                scriptId: input.scriptId,
                scriptName: input.scriptName,
                terminalId: input.terminalId,
                worktreePath: input.worktreePath,
              };
              yield* Effect.all([
                appendSetupScriptActivity({
                  threadId: command.threadId,
                  kind: "setup-script.requested",
                  summary: "Starting setup script",
                  createdAt: input.requestedAt,
                  payload,
                  tone: "info",
                }),
                appendSetupScriptActivity({
                  threadId: command.threadId,
                  kind: "setup-script.started",
                  summary: "Setup script started",
                  createdAt: startedAt,
                  payload,
                  tone: "info",
                }),
              ]).pipe(
                Effect.asVoid,
                Effect.catch((error) =>
                  Effect.logWarning(
                    "bootstrap turn start launched setup script but failed to record setup activity",
                    {
                      threadId: command.threadId,
                      worktreePath: input.worktreePath,
                      scriptId: input.scriptId,
                      terminalId: input.terminalId,
                      detail: error.message,
                    },
                  ),
                ),
              );
            });

          const runSetupProgram = () =>
            Effect.gen(function* () {
              if (!bootstrap?.runSetupScript || !targetWorktreePath) {
                return;
              }
              const worktreePath = targetWorktreePath;
              const requestedAt = yield* nowIso;
              yield* projectSetupScriptRunner
                .runForThread({
                  threadId: command.threadId,
                  ...(targetProjectId ? { projectId: targetProjectId } : {}),
                  ...(targetProjectCwd ? { projectCwd: targetProjectCwd } : {}),
                  worktreePath,
                })
                .pipe(
                  Effect.matchEffect({
                    onFailure: (error) =>
                      recordSetupScriptLaunchFailure({
                        error,
                        requestedAt,
                        worktreePath,
                      }),
                    onSuccess: (setupResult) => {
                      if (setupResult.status !== "started") {
                        return Effect.void;
                      }
                      return recordSetupScriptStarted({
                        requestedAt,
                        worktreePath,
                        scriptId: setupResult.scriptId,
                        scriptName: setupResult.scriptName,
                        terminalId: setupResult.terminalId,
                      });
                    },
                  }),
                );
            });

          const bootstrapProgram = Effect.gen(function* () {
            if (bootstrap?.createThread) {
              yield* orchestrationEngine.dispatch({
                type: "thread.create",
                commandId: yield* serverCommandId("bootstrap-thread-create"),
                threadId: command.threadId,
                projectId: bootstrap.createThread.projectId,
                title: bootstrap.createThread.title,
                modelSelection: bootstrap.createThread.modelSelection,
                runtimeMode: bootstrap.createThread.runtimeMode,
                interactionMode: bootstrap.createThread.interactionMode,
                branch: bootstrap.createThread.branch,
                worktreePath: bootstrap.createThread.worktreePath,
                createdAt: bootstrap.createThread.createdAt,
              });
              createdThread = true;
            }

            if (bootstrap?.prepareWorktree) {
              let worktreeBaseRef = bootstrap.prepareWorktree.baseBranch;
              if (bootstrap.prepareWorktree.startFromOrigin) {
                yield* gitWorkflow.fetchRemote({
                  cwd: bootstrap.prepareWorktree.projectCwd,
                  remoteName: "origin",
                });
                const resolvedRemoteBase = yield* gitWorkflow.resolveRemoteTrackingCommit({
                  cwd: bootstrap.prepareWorktree.projectCwd,
                  refName: bootstrap.prepareWorktree.baseBranch,
                  fallbackRemoteName: "origin",
                });
                worktreeBaseRef = resolvedRemoteBase.commitSha;
              }
              const worktree = yield* gitWorkflow.createWorktree({
                cwd: bootstrap.prepareWorktree.projectCwd,
                refName: worktreeBaseRef,
                newRefName: bootstrap.prepareWorktree.branch,
                baseRefName: bootstrap.prepareWorktree.baseBranch,
                path: null,
              });
              targetWorktreePath = worktree.worktree.path;
              yield* orchestrationEngine.dispatch({
                type: "thread.meta.update",
                commandId: yield* serverCommandId("bootstrap-thread-meta-update"),
                threadId: command.threadId,
                branch: worktree.worktree.refName,
                worktreePath: targetWorktreePath,
              });
              yield* refreshGitStatus(targetWorktreePath);
            }

            yield* runSetupProgram();

            return yield* orchestrationEngine.dispatch(finalTurnStartCommand);
          });

          return yield* bootstrapProgram.pipe(
            Effect.catchCause((cause) => {
              const dispatchError = toBootstrapDispatchCommandCauseError(cause);
              if (Cause.hasInterruptsOnly(cause)) {
                return Effect.fail(dispatchError);
              }
              return cleanupCreatedThread().pipe(Effect.flatMap(() => Effect.fail(dispatchError)));
            }),
          );
        });

      const dispatchNormalizedCommand = (
        normalizedCommand: OrchestrationCommand,
      ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> => {
        const dispatchEffect =
          normalizedCommand.type === "thread.turn.start" && normalizedCommand.bootstrap
            ? dispatchBootstrapTurnStart(normalizedCommand)
            : orchestrationEngine
                .dispatch(normalizedCommand)
                .pipe(
                  Effect.mapError((cause) =>
                    toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
                  ),
                );

        return startup
          .enqueueCommand(dispatchEffect)
          .pipe(
            Effect.mapError((cause) =>
              toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
            ),
          );
      };

      const loadServerConfig = Effect.gen(function* () {
        const keybindingsConfig = yield* keybindings.loadConfigState;
        const providers = yield* providerRegistry.getProviders;
        const materializedSettings = yield* serverSettings.getSettings;
        const settings = ServerSettings.redactServerSettingsForClient(materializedSettings);
        const environment = yield* serverEnvironment.getDescriptor;
        const auth = yield* serverAuth.getDescriptor();

        return {
          environment,
          auth,
          cwd: config.cwd,
          keybindingsConfigPath: config.keybindingsConfigPath,
          keybindings: keybindingsConfig.keybindings,
          issues: keybindingsConfig.issues,
          providers,
          availableEditors: yield* externalLauncher.resolveAvailableEditors(),
          observability: {
            logsDirectoryPath: config.logsDir,
            localTracingEnabled: true,
            ...(config.otlpTracesUrl !== undefined ? { otlpTracesUrl: config.otlpTracesUrl } : {}),
            otlpTracesEnabled: config.otlpTracesUrl !== undefined,
            ...(config.otlpMetricsUrl !== undefined
              ? { otlpMetricsUrl: config.otlpMetricsUrl }
              : {}),
            otlpMetricsEnabled: config.otlpMetricsUrl !== undefined,
          },
          jarvisBrain: resolveJarvisBrainConnection(config, materializedSettings),
          settings,
        };
      });
      const useJarvisCockpitReads = shouldUseJarvisCockpitReads(config);

      const refreshGitStatus = (cwd: string) =>
        vcsStatusBroadcaster
          .refreshStatus(cwd)
          .pipe(Effect.ignoreCause({ log: true }), Effect.forkDetach, Effect.asVoid);

      return WsRpcGroup.of({
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.dispatchCommand,
            Effect.gen(function* () {
              const normalizedCommand = yield* normalizeDispatchCommand(command);
              const shouldStopSessionAfterArchive =
                normalizedCommand.type === "thread.archive"
                  ? yield* projectionSnapshotQuery
                      .getThreadShellById(normalizedCommand.threadId)
                      .pipe(
                        Effect.map(
                          Option.match({
                            onNone: () => false,
                            onSome: (thread) =>
                              thread.session !== null && thread.session.status !== "stopped",
                          }),
                        ),
                        Effect.orElseSucceed(() => false),
                      )
                  : false;
              const result =
                (yield* dispatchJarvisCommand({
                  client: jarvisClient,
                  enabled: useJarvisCockpitReads,
                  command: normalizedCommand,
                })) ?? (yield* dispatchNormalizedCommand(normalizedCommand));
              if (normalizedCommand.type === "thread.archive") {
                if (shouldStopSessionAfterArchive) {
                  yield* Effect.gen(function* () {
                    const stopCommand = yield* normalizeDispatchCommand({
                      type: "thread.session.stop",
                      commandId: CommandId.make(
                        `session-stop-for-archive:${normalizedCommand.commandId}`,
                      ),
                      threadId: normalizedCommand.threadId,
                      createdAt: yield* nowIso,
                    });

                    const stopResult = yield* dispatchJarvisCommand({
                      client: jarvisClient,
                      enabled: useJarvisCockpitReads,
                      command: stopCommand,
                    });
                    if (stopResult === null) {
                      yield* dispatchNormalizedCommand(stopCommand);
                    }
                  }).pipe(
                    Effect.catchCause((cause) =>
                      Effect.logWarning("failed to stop provider session during archive", {
                        threadId: normalizedCommand.threadId,
                        cause,
                      }),
                    ),
                  );
                }

                yield* terminalManager.close({ threadId: normalizedCommand.threadId }).pipe(
                  Effect.catch((error) =>
                    Effect.logWarning("failed to close thread terminals after archive", {
                      threadId: normalizedCommand.threadId,
                      error: error.message,
                    }),
                  ),
                );
              }
              return result;
            }).pipe(
              Effect.mapError((cause) =>
                isOrchestrationDispatchCommandError(cause)
                  ? cause
                  : new OrchestrationDispatchCommandError({
                      message: "Failed to dispatch orchestration command",
                      cause,
                    }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getTurnDiff]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getTurnDiff,
            checkpointDiffQuery.getTurnDiff(input).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationGetTurnDiffError({
                    message: "Failed to load turn diff",
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getFullThreadDiff]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getFullThreadDiff,
            checkpointDiffQuery.getFullThreadDiff(input).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationGetFullThreadDiffError({
                    message: "Failed to load full thread diff",
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.replayEvents]: (input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.replayEvents,
            Stream.runCollect(
              orchestrationEngine.readEvents(
                clamp(input.fromSequenceExclusive, {
                  maximum: Number.MAX_SAFE_INTEGER,
                  minimum: 0,
                }),
              ),
            ).pipe(
              Effect.map((events) => Array.from(events)),
              Effect.flatMap(enrichOrchestrationEvents),
              Effect.mapError(
                (cause) =>
                  new OrchestrationReplayEventsError({
                    message: "Failed to replay orchestration events",
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.subscribeShell]: (_input) =>
          observeRpcStreamEffect(
            ORCHESTRATION_WS_METHODS.subscribeShell,
            Effect.gen(function* () {
              const snapshot = useJarvisCockpitReads
                ? yield* loadJarvisShellSnapshotFromHub(jarvisClient, jarvisEvents).pipe(
                    Effect.tapError((cause) =>
                      Effect.logError("orchestration shell snapshot load failed", { cause }),
                    ),
                    Effect.mapError(
                      (cause) =>
                        new OrchestrationGetSnapshotError({
                          message: "Failed to load orchestration shell snapshot",
                          cause,
                        }),
                    ),
                  )
                : yield* projectionSnapshotQuery.getShellSnapshot().pipe(
                    Effect.tapError((cause) =>
                      Effect.logError("orchestration shell snapshot load failed", { cause }),
                    ),
                    Effect.mapError(
                      (cause) =>
                        new OrchestrationGetSnapshotError({
                          message: "Failed to load orchestration shell snapshot",
                          cause,
                        }),
                    ),
                  );

              const liveStream = useJarvisCockpitReads
                ? jarvisShellPollingStream(jarvisClient, jarvisEvents)
                : orchestrationEngine.streamDomainEvents.pipe(
                    Stream.mapEffect(toShellStreamEvent),
                    Stream.flatMap((event) =>
                      Option.isSome(event) ? Stream.succeed(event.value) : Stream.empty,
                    ),
                  );

              return Stream.concat(
                Stream.make({
                  kind: "snapshot" as const,
                  snapshot,
                }),
                liveStream,
              );
            }),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot]: (_input) =>
          observeRpcEffect(
            ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot,
            Effect.gen(function* () {
              return useJarvisCockpitReads
                ? yield* loadJarvisArchivedShellSnapshot(jarvisClient).pipe(
                    Effect.tapError((cause) =>
                      Effect.logError("orchestration archived shell snapshot load failed", {
                        cause,
                      }),
                    ),
                    Effect.mapError(
                      (cause) =>
                        new OrchestrationGetSnapshotError({
                          message: "Failed to load archived orchestration shell snapshot",
                          cause,
                        }),
                    ),
                  )
                : yield* projectionSnapshotQuery.getArchivedShellSnapshot().pipe(
                    Effect.tapError((cause) =>
                      Effect.logError("orchestration archived shell snapshot load failed", {
                        cause,
                      }),
                    ),
                    Effect.mapError(
                      (cause) =>
                        new OrchestrationGetSnapshotError({
                          message: "Failed to load archived orchestration shell snapshot",
                          cause,
                        }),
                    ),
                  );
            }),
            { "rpc.aggregate": "orchestration" },
          ),
        [ORCHESTRATION_WS_METHODS.subscribeThread]: (input) =>
          observeRpcStreamEffect(
            ORCHESTRATION_WS_METHODS.subscribeThread,
            Effect.gen(function* () {
              const [threadDetail, snapshotSequence] = useJarvisCockpitReads
                ? yield* Effect.all([
                    loadJarvisThreadDetail(jarvisClient, input.threadId).pipe(
                      Effect.mapError(
                        (cause) =>
                          new OrchestrationGetSnapshotError({
                            message: `Failed to load Jarvis thread ${input.threadId}`,
                            cause,
                          }),
                      ),
                    ),
                    Effect.succeed(0),
                  ])
                : yield* Effect.all([
                    projectionSnapshotQuery.getThreadDetailById(input.threadId).pipe(
                      Effect.mapError(
                        (cause) =>
                          new OrchestrationGetSnapshotError({
                            message: `Failed to load thread ${input.threadId}`,
                            cause,
                          }),
                      ),
                    ),
                    projectionSnapshotQuery.getSnapshotSequence().pipe(
                      Effect.map(({ snapshotSequence }) => snapshotSequence),
                      Effect.mapError(
                        (cause) =>
                          new OrchestrationGetSnapshotError({
                            message: "Failed to load orchestration snapshot sequence",
                            cause,
                          }),
                      ),
                    ),
                  ]);

              if (Option.isNone(threadDetail)) {
                return yield* new OrchestrationGetSnapshotError({
                  message: `Thread ${input.threadId} was not found`,
                  cause: input.threadId,
                });
              }

              const liveStream = useJarvisCockpitReads
                ? jarvisThreadPollingStream(jarvisClient, jarvisEvents, input.threadId)
                : orchestrationEngine.streamDomainEvents.pipe(
                    Stream.filter(
                      (event) =>
                        event.aggregateKind === "thread" &&
                        event.aggregateId === input.threadId &&
                        isThreadDetailEvent(event),
                    ),
                    Stream.map((event) => ({
                      kind: "event" as const,
                      event,
                    })),
                  );

              return Stream.concat(
                Stream.make({
                  kind: "snapshot" as const,
                  snapshot: {
                    snapshotSequence,
                    thread: threadDetail.value,
                  },
                }),
                liveStream,
              );
            }),
            { "rpc.aggregate": "orchestration" },
          ),
        [WS_METHODS.serverGetConfig]: (_input) =>
          observeRpcEffect(WS_METHODS.serverGetConfig, loadServerConfig, {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.serverRefreshProviders]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverRefreshProviders,
            (input.instanceId !== undefined
              ? providerRegistry.refreshInstance(input.instanceId)
              : providerRegistry.refresh()
            ).pipe(Effect.map((providers) => ({ providers }))),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverUpdateProvider]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateProvider,
            providerMaintenanceRunner.updateProvider(input),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUpsertKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverUpsertKeybinding,
            Effect.gen(function* () {
              const keybindingsConfig = yield* keybindings.upsertKeybindingRule(rule);
              return { keybindings: keybindingsConfig, issues: [] };
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverRemoveKeybinding]: (rule) =>
          observeRpcEffect(
            WS_METHODS.serverRemoveKeybinding,
            Effect.gen(function* () {
              const keybindingsConfig = yield* keybindings.removeKeybindingRule(rule);
              return { keybindings: keybindingsConfig, issues: [] };
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverGetSettings]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetSettings,
            serverSettings.getSettings.pipe(
              Effect.map(ServerSettings.redactServerSettingsForClient),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUpdateSettings]: ({ patch }) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateSettings,
            serverSettings
              .updateSettings(patch)
              .pipe(Effect.map(ServerSettings.redactServerSettingsForClient)),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverCheckJarvisBrain]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverCheckJarvisBrain,
            serverSettings.getSettings.pipe(
              Effect.flatMap((settings) =>
                checkJarvisBrain({
                  config,
                  settings,
                  ...input,
                  oauthAccessToken: jarvisOAuthAccessToken(WS_METHODS.serverCheckJarvisBrain),
                }),
              ),
              Effect.catch((error) =>
                nowIso.pipe(
                  Effect.map((checkedAt) => ({
                    ok: false,
                    checkedAt,
                    apiBaseUrl:
                      input.apiBaseUrl ??
                      config.jarvisApiBaseUrl?.toString() ??
                      "http://127.0.0.1:8791",
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis brain health check failed.",
                  })),
                ),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisMcpStatus]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisMcpStatus,
            jarvisClient.getMcpStatus().pipe(
              Effect.map((status) => ({ ok: true as const, status })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false as const,
                  error: {
                    message: error.message,
                    status: error.status,
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisCapabilities]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisCapabilities,
            jarvisClient.getCapabilities().pipe(
              Effect.catch((error) =>
                nowIso.pipe(
                  Effect.map((checkedAt) => ({
                    ok: false as const,
                    checked_at: checkedAt,
                    routes: [],
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis capability scan failed.",
                      status: error instanceof JarvisClientError ? error.status : null,
                    },
                  })),
                ),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisSnapshot]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisSnapshot,
            jarvisClient
              .getSnapshot(input.sync === undefined ? undefined : { sync: input.sync })
              .pipe(
                Effect.map((snapshot) => ({
                  ok: true,
                  snapshot,
                })),
                Effect.catch((error) =>
                  Effect.succeed({
                    ok: false,
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis cockpit snapshot request failed.",
                    },
                  }),
                ),
              ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjects]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjects,
            jarvisClient
              .getProjects(
                input.includeArchived === undefined
                  ? undefined
                  : { includeArchived: input.includeArchived },
              )
              .pipe(
                Effect.map((projects) => ({
                  ok: true,
                  projects,
                })),
                Effect.catch((error) =>
                  Effect.succeed({
                    ok: false,
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis projects request failed.",
                    },
                  }),
                ),
              ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProject]: ({ projectId }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProject,
            jarvisClient.getProject(projectId).pipe(
              Effect.map((project) => ({
                ok: true,
                project,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project request failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjectPullRequests]: ({ projectId }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjectPullRequests,
            jarvisClient.getProject(projectId).pipe(
              Effect.flatMap((project) =>
                projectPullRequests.list({ cwd: config.cwd, repos: project.repos }),
              ),
              Effect.map(({ pullRequests, errors }) => ({
                ok: true,
                pullRequests,
                errors,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project pull requests request failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjectMemory]: ({ projectId }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjectMemory,
            jarvisClient.getProjectMemory(projectId).pipe(
              Effect.map((memory) => ({
                ok: true,
                memory,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project memory request failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjectFiles]: ({ projectId, includeRetracted }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjectFiles,
            jarvisClient
              .getProjectFiles(
                projectId,
                includeRetracted === undefined ? undefined : { includeRetracted },
              )
              .pipe(
                Effect.map((files) => ({
                  ok: true,
                  files,
                })),
                Effect.catch((error) =>
                  Effect.succeed({
                    ok: false,
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis project files request failed.",
                    },
                  }),
                ),
              ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjectThreads]: ({ projectId, includeArchived }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjectThreads,
            jarvisClient
              .getProjectThreads(
                projectId,
                includeArchived === undefined ? undefined : { includeArchived },
              )
              .pipe(
                Effect.map((threads) => ({
                  ok: true,
                  threads,
                })),
                Effect.catch((error) =>
                  Effect.succeed({
                    ok: false,
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis project conversations request failed.",
                    },
                  }),
                ),
              ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetJarvisProjectThread]: ({ projectId, threadId }) =>
          observeRpcEffect(
            WS_METHODS.serverGetJarvisProjectThread,
            jarvisClient.getProjectThread(projectId, threadId).pipe(
              Effect.map((threads) => ({
                ok: true,
                thread: threads,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation detail request failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.subscribeJarvisProjectThread]: ({ projectId, threadId }) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeJarvisProjectThread,
            jarvisClient.getProjectThread(projectId, threadId).pipe(
              Effect.map((thread) =>
                Stream.concat(
                  Stream.make({ kind: "snapshot" as const, thread }),
                  jarvisProjectThreadPollingStream(
                    jarvisClient,
                    jarvisEvents,
                    projectId,
                    threadId,
                    thread,
                  ),
                ),
              ),
              Effect.mapError(
                (cause) =>
                  new OrchestrationGetSnapshotError({
                    message: `Failed to load Jarvis project thread ${threadId}`,
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverValidateJarvisWork]: ({ input }) =>
          observeRpcEffect(
            WS_METHODS.serverValidateJarvisWork,
            jarvisClient.validateWork(input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis work validation failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverPruneJarvisWorkerWorktrees]: ({ input }) =>
          observeRpcEffect(
            WS_METHODS.serverPruneJarvisWorkerWorktrees,
            jarvisClient
              .pruneWorkerWorktrees({
                workerId: input.workerId,
                idempotencyKey: input.idempotencyKey,
              })
              .pipe(
                Effect.map((result) => ({
                  ok: result.ok,
                  result,
                })),
                Effect.catch((error) =>
                  Effect.succeed({
                    ok: false,
                    error: {
                      message:
                        error instanceof Error && error.message.trim().length > 0
                          ? error.message
                          : "Jarvis worker worktree prune failed.",
                    },
                  }),
                ),
              ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverCreateJarvisProject]: ({ input }) =>
          observeRpcEffect(
            WS_METHODS.serverCreateJarvisProject,
            jarvisClient.createProject(input).pipe(
              Effect.map((project) => ({
                ok: true,
                project,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project creation failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUpdateJarvisProject]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverUpdateJarvisProject,
            jarvisClient.updateProject(projectId, input).pipe(
              Effect.map((project) => ({
                ok: true,
                project,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project update failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverCloseJarvisSession]: ({ sessionRef, input }) =>
          observeRpcEffect(
            WS_METHODS.serverCloseJarvisSession,
            jarvisClient.closeSession(sessionRef, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis session close failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverArchiveJarvisSession]: ({ sessionRef, input }) =>
          observeRpcEffect(
            WS_METHODS.serverArchiveJarvisSession,
            jarvisClient.archiveSession(sessionRef, input).pipe(
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    code: "internal_error" as const,
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis session archive failed.",
                    recoverable: true,
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverDeleteJarvisSession]: ({ sessionRef, input }) =>
          observeRpcEffect(
            WS_METHODS.serverDeleteJarvisSession,
            jarvisClient.deleteSession(sessionRef, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis session delete failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverDeleteJarvisRun]: ({ runId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverDeleteJarvisRun,
            jarvisClient.deleteRun(runId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis run delete failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverArchiveJarvisProject]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverArchiveJarvisProject,
            jarvisClient.archiveProject(projectId, input).pipe(
              Effect.map((project) => ({
                ok: true,
                project,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project archive failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverDeleteJarvisProject]: ({ projectId }) =>
          observeRpcEffect(
            WS_METHODS.serverDeleteJarvisProject,
            jarvisClient.deleteProject(projectId).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project delete failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverRecordJarvisProjectFinding]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRecordJarvisProjectFinding,
            jarvisClient.recordProjectFinding(projectId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project finding write failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverRecordJarvisProjectDecision]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRecordJarvisProjectDecision,
            jarvisClient.recordProjectDecision(projectId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project decision write failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverForgetJarvisProjectMemory]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverForgetJarvisProjectMemory,
            jarvisClient.forgetProjectMemory(projectId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project memory forget failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverCorrectJarvisProjectMemory]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverCorrectJarvisProjectMemory,
            jarvisClient.correctProjectMemory(projectId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project memory correction failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUploadJarvisProjectFile]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverUploadJarvisProjectFile,
            jarvisClient.uploadProjectFile(projectId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project file upload failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverImportJarvisProjectSource]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverImportJarvisProjectSource,
            Effect.tryPromise({
              try: (signal) => importProjectSourceFromUrl(input, undefined, signal),
              catch: (cause) => new ProjectSourceImportError({ cause }),
            }).pipe(
              Effect.flatMap((source) =>
                jarvisClient.getProjectFiles(projectId).pipe(
                  Effect.flatMap((files) => {
                    const sourcePrefix = `src-${source.sourceIdentity.slice(0, 16)}-`;
                    const currentVersions = files.filter(
                      (file) => file.retracted !== true && file.doc_id.startsWith(sourcePrefix),
                    );
                    const unchanged = currentVersions.find(
                      (file) =>
                        file.doc_id === source.docId ||
                        file.content_hash === `sha256:${source.contentSha256}`,
                    );
                    if (unchanged) {
                      return Effect.succeed({
                        status: "unchanged",
                        provider: source.provider,
                        canonical_url: source.canonicalUrl,
                        doc_id: unchanged.doc_id,
                        content_sha256: source.contentSha256,
                      });
                    }
                    return jarvisClient
                      .uploadProjectFile(projectId, {
                        doc_id: source.docId,
                        filename: source.filename,
                        content_base64: source.contentBase64,
                        title: source.title,
                        artifact_type: `${source.provider}-source`,
                        mime_type: source.mimeType,
                        idempotency_key: `url-import:${source.sourceIdentity}:${source.contentSha256}`,
                        metadata: {
                          surface: "jarvis-cockpit",
                          source: "url",
                          source_provider: source.provider,
                          source_url: source.requestedUrl,
                          source_canonical_url: source.canonicalUrl,
                          source_final_url: source.finalUrl,
                          fetched_at: source.fetchedAt,
                          content_sha256: source.contentSha256,
                        },
                      })
                      .pipe(
                        Effect.flatMap((result) =>
                          Effect.all(
                            currentVersions.map((file) =>
                              jarvisClient
                                .retractProjectFile(projectId, file.doc_id, {
                                  reason: "Replaced by refreshed source",
                                  idempotency_key: `url-replace:${source.sourceIdentity}:${file.doc_id}:${source.contentSha256}`,
                                })
                                .pipe(
                                  Effect.map(() => ({ ok: true as const, docId: file.doc_id })),
                                  Effect.catch((error) =>
                                    Effect.succeed({
                                      ok: false as const,
                                      docId: file.doc_id,
                                      message:
                                        error instanceof Error
                                          ? error.message
                                          : "The previous source version could not be retired.",
                                    }),
                                  ),
                                ),
                            ),
                            { concurrency: 1 },
                          ).pipe(
                            Effect.map((retractions) => ({
                              status: "imported",
                              provider: source.provider,
                              canonical_url: source.canonicalUrl,
                              doc_id: source.docId,
                              content_sha256: source.contentSha256,
                              result,
                              replaced: retractions
                                .filter((entry) => entry.ok)
                                .map((entry) => entry.docId),
                              warnings: retractions
                                .filter((entry) => !entry.ok)
                                .map((entry) => `${entry.docId}: ${entry.message}`),
                            })),
                          ),
                        ),
                      );
                  }),
                ),
              ),
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Project source import failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverRetractJarvisProjectFile]: ({ projectId, docId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRetractJarvisProjectFile,
            jarvisClient.retractProjectFile(projectId, docId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project file retract failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverCreateJarvisProjectThread]: ({ projectId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverCreateJarvisProjectThread,
            jarvisClient.createProjectThread(projectId, input).pipe(
              Effect.map((thread) => ({
                ok: true,
                thread,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation creation failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverArchiveJarvisProjectThread]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverArchiveJarvisProjectThread,
            jarvisClient.archiveProjectThread(projectId, threadId, input).pipe(
              Effect.map((thread) => ({
                ok: true,
                thread,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation archive failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverRenameJarvisProjectThread]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRenameJarvisProjectThread,
            jarvisClient.renameProjectThread(projectId, threadId, input).pipe(
              Effect.map((thread) => ({
                ok: true,
                thread,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation rename failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGenerateThreadTitle]: ({ message }) =>
          observeRpcEffect(
            WS_METHODS.serverGenerateThreadTitle,
            Effect.gen(function* () {
              const { textGenerationModelSelection: modelSelection } =
                yield* serverSettings.getSettings;
              return yield* textGeneration.generateThreadTitle({
                cwd: config.cwd,
                message,
                modelSelection,
              });
            }),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverUnarchiveJarvisProjectThread]: ({ projectId, threadId }) =>
          observeRpcEffect(
            WS_METHODS.serverUnarchiveJarvisProjectThread,
            jarvisClient.unarchiveProjectThread(projectId, threadId).pipe(
              Effect.map((thread) => ({
                ok: true,
                thread,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation unarchive failed.",
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverSendJarvisProjectThreadTurn]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverSendJarvisProjectThreadTurn,
            jarvisClient.sendProjectThreadTurn(projectId, threadId, input).pipe(
              Effect.map((result) => ({
                ok: true,
                result,
              })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message: formatJarvisProjectTurnFailure(error),
                  },
                }),
              ),
            ),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverRespondJarvisProjectThreadApproval]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRespondJarvisProjectThreadApproval,
            jarvisClient.respondProjectThreadApproval(projectId, threadId, input).pipe(
              Effect.map((result) => ({ ok: true, result })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation approval failed.",
                  },
                }),
              ),
            ),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverRespondJarvisProjectThreadInput]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverRespondJarvisProjectThreadInput,
            jarvisClient.respondProjectThreadInput(projectId, threadId, input).pipe(
              Effect.map((result) => ({ ok: true, result })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation input failed.",
                  },
                }),
              ),
            ),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverInterruptJarvisProjectThread]: ({ projectId, threadId, input }) =>
          observeRpcEffect(
            WS_METHODS.serverInterruptJarvisProjectThread,
            jarvisClient.interruptProjectThread(projectId, threadId, input).pipe(
              Effect.map((result) => ({ ok: true, result })),
              Effect.catch((error) =>
                Effect.succeed({
                  ok: false,
                  error: {
                    message:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Jarvis project conversation interrupt failed.",
                  },
                }),
              ),
            ),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.serverDiscoverSourceControl]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverDiscoverSourceControl,
            sourceControlDiscovery.discover,
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetTraceDiagnostics]: (_input) =>
          observeRpcEffect(
            WS_METHODS.serverGetTraceDiagnostics,
            TraceDiagnostics.readTraceDiagnostics({
              traceFilePath: config.serverTracePath,
              maxFiles: config.traceMaxFiles,
            }),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverGetProcessDiagnostics]: (_input) =>
          observeRpcEffect(WS_METHODS.serverGetProcessDiagnostics, processDiagnostics.read, {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.serverGetProcessResourceHistory]: (input) =>
          observeRpcEffect(
            WS_METHODS.serverGetProcessResourceHistory,
            processResourceMonitor.readHistory(input),
            {
              "rpc.aggregate": "server",
            },
          ),
        [WS_METHODS.serverSignalProcess]: (input) =>
          observeRpcEffect(WS_METHODS.serverSignalProcess, processDiagnostics.signal(input), {
            "rpc.aggregate": "server",
          }),
        [WS_METHODS.cloudGetRelayClientStatus]: (_input) =>
          observeRpcEffect(WS_METHODS.cloudGetRelayClientStatus, relayClient.resolve, {
            "rpc.aggregate": "cloud",
          }),
        [WS_METHODS.cloudInstallRelayClient]: (_input) =>
          observeRpcStream(
            WS_METHODS.cloudInstallRelayClient,
            Stream.callback<RelayClientInstallProgressEvent, RelayClientInstallFailedError>(
              (queue) =>
                relayClient
                  .installWithProgress((event) => Queue.offer(queue, event).pipe(Effect.asVoid))
                  .pipe(
                    Effect.flatMap((status) =>
                      Queue.offer(queue, {
                        type: "complete",
                        status,
                      }),
                    ),
                    Effect.catchTag("RelayClientInstallError", (error) =>
                      Queue.fail(
                        queue,
                        new RelayClientInstallFailedError({
                          reason: error.reason,
                          message: error.message,
                        }),
                      ),
                    ),
                    Effect.andThen(Queue.end(queue)),
                    Effect.forkScoped,
                  ),
            ),
            { "rpc.aggregate": "cloud" },
          ),
        [WS_METHODS.sourceControlLookupRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlLookupRepository,
            sourceControlRepositories.lookupRepository(input),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.sourceControlCloneRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlCloneRepository,
            sourceControlRepositories.cloneRepository(input),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.sourceControlPublishRepository]: (input) =>
          observeRpcEffect(
            WS_METHODS.sourceControlPublishRepository,
            sourceControlRepositories
              .publishRepository(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            {
              "rpc.aggregate": "source-control",
            },
          ),
        [WS_METHODS.projectsSearchEntries]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsSearchEntries,
            workspaceEntries.search(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectSearchEntriesError({
                    cwd: input.cwd,
                    queryLength: input.query.length,
                    limit: input.limit,
                    ...projectEntriesFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsListEntries]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsListEntries,
            workspaceEntries.list(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectListEntriesError({
                    ...input,
                    ...projectEntriesFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsReadFile]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsReadFile,
            workspaceFileSystem.readFile(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectReadFileError({
                    ...input,
                    ...projectFileFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.projectsWriteFile]: (input) =>
          observeRpcEffect(
            WS_METHODS.projectsWriteFile,
            workspaceFileSystem.writeFile(input).pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectWriteFileError({
                    cwd: input.cwd,
                    relativePath: input.relativePath,
                    ...projectFileFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.shellOpenInEditor]: (input) =>
          observeRpcEffect(WS_METHODS.shellOpenInEditor, externalLauncher.launchEditor(input), {
            "rpc.aggregate": "workspace",
          }),
        [WS_METHODS.filesystemBrowse]: (input) =>
          observeRpcEffect(
            WS_METHODS.filesystemBrowse,
            workspaceEntries.browse(input).pipe(
              Effect.mapError(
                (cause) =>
                  new FilesystemBrowseError({
                    ...input,
                    ...filesystemBrowseFailureContext(cause),
                    cause,
                  }),
              ),
            ),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.assetsCreateUrl]: (input) =>
          observeRpcEffect(
            WS_METHODS.assetsCreateUrl,
            Effect.gen(function* () {
              if (input.resource._tag !== "workspace-file") {
                return yield* issueAssetUrl({ resource: input.resource });
              }
              const thread = yield* projectionSnapshotQuery
                .getThreadShellById(input.resource.threadId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new AssetWorkspaceContextResolutionError({
                        resource: input.resource,
                        cause,
                      }),
                  ),
                );
              if (Option.isNone(thread)) {
                return yield* new AssetWorkspaceContextNotFoundError({
                  resource: input.resource,
                });
              }
              const project = yield* projectionSnapshotQuery
                .getProjectShellById(thread.value.projectId)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new AssetWorkspaceContextResolutionError({
                        resource: input.resource,
                        cause,
                      }),
                  ),
                );
              if (Option.isNone(project)) {
                return yield* new AssetWorkspaceContextNotFoundError({
                  resource: input.resource,
                });
              }
              return yield* issueAssetUrl({
                resource: input.resource,
                workspaceRoot: thread.value.worktreePath ?? project.value.workspaceRoot,
              });
            }),
            { "rpc.aggregate": "workspace" },
          ),
        [WS_METHODS.subscribeVcsStatus]: (input) =>
          observeRpcStream(
            WS_METHODS.subscribeVcsStatus,
            vcsStatusBroadcaster.streamStatus(input, {
              automaticRemoteRefreshInterval: automaticGitFetchInterval,
            }),
            {
              "rpc.aggregate": "vcs",
            },
          ),
        [WS_METHODS.vcsRefreshStatus]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsRefreshStatus,
            vcsStatusBroadcaster.refreshStatus(input.cwd),
            {
              "rpc.aggregate": "vcs",
            },
          ),
        [WS_METHODS.vcsPull]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsPull,
            gitWorkflow.pullCurrentBranch(input.cwd).pipe(
              Effect.matchCauseEffect({
                onFailure: (cause) => Effect.failCause(cause),
                onSuccess: (result) =>
                  refreshGitStatus(input.cwd).pipe(Effect.ignore({ log: true }), Effect.as(result)),
              }),
            ),
            { "rpc.aggregate": "git" },
          ),
        [WS_METHODS.gitRunStackedAction]: (input) =>
          observeRpcStream(
            WS_METHODS.gitRunStackedAction,
            Stream.callback<GitActionProgressEvent, GitManagerServiceError>((queue) =>
              gitWorkflow
                .runStackedAction(input, {
                  actionId: input.actionId,
                  progressReporter: {
                    publish: (event) => Queue.offer(queue, event).pipe(Effect.asVoid),
                  },
                })
                .pipe(
                  Effect.matchCauseEffect({
                    onFailure: (cause) => Queue.failCause(queue, cause),
                    onSuccess: () =>
                      refreshGitStatus(input.cwd).pipe(
                        Effect.andThen(Queue.end(queue).pipe(Effect.asVoid)),
                      ),
                  }),
                ),
            ),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.gitResolvePullRequest]: (input) =>
          observeRpcEffect(
            WS_METHODS.gitResolvePullRequest,
            gitWorkflow.resolvePullRequest(input),
            {
              "rpc.aggregate": "git",
            },
          ),
        [WS_METHODS.gitPreparePullRequestThread]: (input) =>
          observeRpcEffect(
            WS_METHODS.gitPreparePullRequestThread,
            gitWorkflow
              .preparePullRequestThread(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "git" },
          ),
        [WS_METHODS.vcsListRefs]: (input) =>
          observeRpcEffect(WS_METHODS.vcsListRefs, gitWorkflow.listRefs(input), {
            "rpc.aggregate": "vcs",
          }),
        [WS_METHODS.vcsCreateWorktree]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsCreateWorktree,
            gitWorkflow.createWorktree(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsRemoveWorktree]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsRemoveWorktree,
            gitWorkflow.removeWorktree(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsCreateRef]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsCreateRef,
            gitWorkflow.createRef(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsSwitchRef]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsSwitchRef,
            gitWorkflow.switchRef(input).pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.vcsInit]: (input) =>
          observeRpcEffect(
            WS_METHODS.vcsInit,
            vcsProvisioning
              .initRepository(input)
              .pipe(Effect.tap(() => refreshGitStatus(input.cwd))),
            { "rpc.aggregate": "vcs" },
          ),
        [WS_METHODS.reviewGetDiffPreview]: (input) =>
          observeRpcEffect(WS_METHODS.reviewGetDiffPreview, review.getDiffPreview(input), {
            "rpc.aggregate": "review",
          }),
        [WS_METHODS.terminalOpen]: (input) =>
          observeRpcEffect(WS_METHODS.terminalOpen, terminalManager.open(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalAttach]: (input) =>
          observeRpcStream(
            WS_METHODS.terminalAttach,
            Stream.callback<TerminalAttachStreamEvent, TerminalError>((queue) =>
              Effect.acquireRelease(
                terminalManager.attachStream(input, (event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.terminalWrite]: (input) =>
          observeRpcEffect(WS_METHODS.terminalWrite, terminalManager.write(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalResize]: (input) =>
          observeRpcEffect(WS_METHODS.terminalResize, terminalManager.resize(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalClear]: (input) =>
          observeRpcEffect(WS_METHODS.terminalClear, terminalManager.clear(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalRestart]: (input) =>
          observeRpcEffect(WS_METHODS.terminalRestart, terminalManager.restart(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.terminalClose]: (input) =>
          observeRpcEffect(WS_METHODS.terminalClose, terminalManager.close(input), {
            "rpc.aggregate": "terminal",
          }),
        [WS_METHODS.subscribeTerminalEvents]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeTerminalEvents,
            Stream.callback<TerminalEvent>((queue) =>
              Effect.acquireRelease(
                terminalManager.subscribe((event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.subscribeTerminalMetadata]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeTerminalMetadata,
            Stream.callback<TerminalMetadataStreamEvent>((queue) =>
              Effect.acquireRelease(
                terminalManager.subscribeMetadata((event) => Queue.offer(queue, event)),
                (unsubscribe) => Effect.sync(unsubscribe),
              ),
            ),
            { "rpc.aggregate": "terminal" },
          ),
        [WS_METHODS.previewOpen]: (input) =>
          observeRpcEffect(WS_METHODS.previewOpen, previewManager.open(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewNavigate]: (input) =>
          observeRpcEffect(WS_METHODS.previewNavigate, previewManager.navigate(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewResize]: (input) =>
          observeRpcEffect(WS_METHODS.previewResize, previewManager.resize(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewRefresh]: (input) =>
          observeRpcEffect(WS_METHODS.previewRefresh, previewManager.refresh(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewClose]: (input) =>
          observeRpcEffect(WS_METHODS.previewClose, previewManager.close(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewList]: (input) =>
          observeRpcEffect(WS_METHODS.previewList, previewManager.list(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewReportStatus]: (input) =>
          observeRpcEffect(WS_METHODS.previewReportStatus, previewManager.reportStatus(input), {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.previewAutomationConnect]: (input) =>
          observeRpcStreamEffect(
            WS_METHODS.previewAutomationConnect,
            previewAutomationBroker.connect(input),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.previewAutomationRespond]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewAutomationRespond,
            previewAutomationBroker.respond(input),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.previewAutomationFocusHost]: (input) =>
          observeRpcEffect(
            WS_METHODS.previewAutomationFocusHost,
            previewAutomationBroker.focusHost(input),
            { "rpc.aggregate": "preview-automation" },
          ),
        [WS_METHODS.subscribePreviewEvents]: (_input) =>
          observeRpcStream(WS_METHODS.subscribePreviewEvents, previewManager.events, {
            "rpc.aggregate": "preview",
          }),
        [WS_METHODS.subscribeDiscoveredLocalServers]: (_input) =>
          observeRpcStream(
            WS_METHODS.subscribeDiscoveredLocalServers,
            Stream.callback<DiscoveredLocalServerList>((queue) =>
              Effect.gen(function* () {
                yield* portDiscovery.retain;
                const initial = yield* portDiscovery.scan();
                const initialScannedAt = DateTime.formatIso(yield* DateTime.now);
                yield* Queue.offer(queue, {
                  servers: initial,
                  scannedAt: initialScannedAt,
                });
                yield* portDiscovery.subscribe((servers) =>
                  Effect.gen(function* () {
                    const scannedAt = DateTime.formatIso(yield* DateTime.now);
                    yield* Queue.offer(queue, { servers, scannedAt });
                  }),
                );
              }),
            ),
            { "rpc.aggregate": "preview" },
          ),
        [WS_METHODS.subscribeServerConfig]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerConfig,
            Effect.gen(function* () {
              const keybindingsUpdates = keybindings.streamChanges.pipe(
                Stream.map((event) => ({
                  version: 1 as const,
                  type: "keybindingsUpdated" as const,
                  payload: {
                    keybindings: event.keybindings,
                    issues: event.issues,
                  },
                })),
              );
              const providerStatuses = providerRegistry.streamChanges.pipe(
                Stream.map((providers) => ({
                  version: 1 as const,
                  type: "providerStatuses" as const,
                  payload: { providers },
                })),
                Stream.debounce(Duration.millis(PROVIDER_STATUS_DEBOUNCE_MS)),
              );
              const settingsUpdates = serverSettings.streamChanges.pipe(
                Stream.map((settings) => ServerSettings.redactServerSettingsForClient(settings)),
                Stream.map((settings) => ({
                  version: 1 as const,
                  type: "settingsUpdated" as const,
                  payload: { settings },
                })),
              );

              yield* providerRegistry
                .refresh()
                .pipe(Effect.ignoreCause({ log: true }), Effect.forkScoped);

              const liveUpdates = Stream.merge(
                keybindingsUpdates,
                Stream.merge(providerStatuses, settingsUpdates),
              );

              return Stream.concat(
                Stream.make({
                  version: 1 as const,
                  type: "snapshot" as const,
                  config: yield* loadServerConfig,
                }),
                liveUpdates,
              );
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.subscribeServerLifecycle]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeServerLifecycle,
            Effect.gen(function* () {
              const snapshot = yield* lifecycleEvents.snapshot;
              const snapshotEvents = Array.from(snapshot.events).toSorted(
                (left, right) => left.sequence - right.sequence,
              );
              const liveEvents = lifecycleEvents.stream.pipe(
                Stream.filter((event) => event.sequence > snapshot.sequence),
              );
              return Stream.concat(Stream.fromIterable(snapshotEvents), liveEvents);
            }),
            { "rpc.aggregate": "server" },
          ),
        [WS_METHODS.subscribeAuthAccess]: (_input) =>
          observeRpcStreamEffect(
            WS_METHODS.subscribeAuthAccess,
            Effect.gen(function* () {
              const initialSnapshot = yield* loadAuthAccessSnapshot();
              const revisionRef = yield* Ref.make(1);
              const accessChanges: Stream.Stream<
                PairingGrantStore.BootstrapCredentialChange | SessionStore.SessionCredentialChange
              > = Stream.merge(bootstrapCredentials.streamChanges, sessions.streamChanges);

              const liveEvents: Stream.Stream<AuthAccessStreamEvent> = accessChanges.pipe(
                Stream.mapEffect((change) =>
                  Ref.updateAndGet(revisionRef, (revision) => revision + 1).pipe(
                    Effect.map((revision) =>
                      toAuthAccessStreamEvent(change, revision, currentSessionId),
                    ),
                  ),
                ),
              );

              return Stream.concat(
                Stream.make({
                  version: 1 as const,
                  revision: 1,
                  type: "snapshot" as const,
                  payload: initialSnapshot,
                }),
                liveEvents,
              );
            }),
            { "rpc.aggregate": "auth" },
          ),
      });
    }),
  );

function formatJarvisProjectTurnFailure(error: unknown): string {
  const fallback = "Jarvis project conversation turn failed.";
  const message =
    error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
  if (!(error instanceof JarvisClientError)) {
    return message;
  }
  const responseBody = error.responseBody?.trim();
  if (!responseBody) {
    return message;
  }
  return `${message} ${responseBody}`;
}

export const websocketRpcRouteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const previewAutomationBroker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
    const config = yield* ServerConfig.ServerConfig;
    const serverSettings = yield* ServerSettings.ServerSettingsService;
    const secretStore = yield* ServerSecretStore.ServerSecretStore;
    const jarvisOAuthAccessToken = (operation: string) =>
      makeJarvisOAuthAccessToken({ config, secrets: secretStore }).pipe(
        Effect.mapError(
          (cause) =>
            new JarvisClientError({
              operation,
              message: "Failed to issue Jarvis OAuth access token.",
              cause,
            }),
        ),
      );
    const jarvisEventsClient = makeJarvisClient({
      ...config,
      getSettings: serverSettings.getSettings,
      oauthAccessToken: jarvisOAuthAccessToken,
    });
    // A route-layer hub is shared by every WebSocket client and is stopped
    // when its last consumer disconnects; fixture mode stays on polling.
    const jarvisEvents = yield* makeJarvisEventsHub(jarvisEventsClient, {
      enabled: !config.jarvisFixtureMode && process.env.JARVIS_EVENTS_SSE_ENABLED !== "false",
      restartWhen: serverSettings.streamChanges,
    });
    return HttpRouter.add(
      "GET",
      "/ws",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
        const sessions = yield* SessionStore.SessionStore;
        const session = yield* serverAuth.authenticateWebSocketUpgrade(request).pipe(
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, (error) =>
            failEnvironmentAuthInvalid(EnvironmentAuth.serverAuthCredentialReason(error)),
          ),
          Effect.catchIf(EnvironmentAuth.isServerAuthInternalError, (error) =>
            failEnvironmentInternal("internal_error", error),
          ),
        );
        const rpcWebSocketHttpEffect = yield* RpcServer.toHttpEffectWebsocket(WsRpcGroup, {
          disableTracing: true,
        }).pipe(
          Effect.provide(
            makeWsRpcLayer(session, previewAutomationBroker, jarvisEvents).pipe(
              Layer.provideMerge(RpcSerialization.layerJson),
              Layer.provide(ProviderMaintenanceRunner.layer),
              Layer.provide(
                SourceControlDiscovery.layer.pipe(
                  Layer.provide(
                    SourceControlProviderRegistry.layer.pipe(
                      Layer.provide(
                        Layer.mergeAll(
                          AzureDevOpsCli.layer,
                          BitbucketApi.layer,
                          GitHubCli.layer,
                          GitLabCli.layer,
                        ),
                      ),
                      Layer.provideMerge(GitVcsDriver.layer),
                      Layer.provide(
                        VcsDriverRegistry.layer.pipe(Layer.provide(VcsProjectConfig.layer)),
                      ),
                    ),
                  ),
                  Layer.provide(VcsProcess.layer),
                ),
              ),
            ),
          ),
        );
        return yield* Effect.acquireUseRelease(
          sessions.markConnected(session.sessionId),
          () => rpcWebSocketHttpEffect,
          () => sessions.markDisconnected(session.sessionId),
        );
      }).pipe(
        Effect.catchTags({
          EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
          EnvironmentInternalError: HttpServerRespondable.toResponse,
        }),
      ),
    );
  }),
);
