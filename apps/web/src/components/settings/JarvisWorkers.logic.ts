import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type JarvisWorkerProfile,
  type JarvisWorkerWorktreePruneResponse,
  type MessageId,
  ProjectId,
  ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";

export type WorkerReadinessStatus = "reported-healthy" | "reported-unhealthy" | "not-reported";

export interface WorkerReadinessRow {
  readonly id:
    | "codex-installed"
    | "codex-authenticated"
    | "git-credentials"
    | "worktree-materialization"
    | "package-manager"
    | "browser-dev-server";
  readonly label: string;
  readonly status: WorkerReadinessStatus;
  readonly detail: string;
}

export interface WorkerWarmCheckout {
  readonly repo: string;
  readonly status: string;
  readonly defaultBranch: string | null;
  readonly isDefault: boolean;
  readonly canStartWork: boolean;
}

export interface WorkerIdentityAccessSummary {
  readonly gitIdentity: WorkerGitIdentityPresentation;
  readonly repoAccess: WorkerRepoAccessPresentation;
  readonly worktreeInventory: string;
}

export type WorkerGitAuthStatePresentation = "valid" | "expired" | "unconfigured" | "not-reported";

export interface WorkerGitIdentityPresentation {
  readonly label: string;
  readonly detail: string;
  readonly authState: WorkerGitAuthStatePresentation;
}

export interface WorkerRepoAccessRow {
  readonly repo: string;
  readonly accessible: boolean | null;
  readonly reasonCode: string;
  readonly reason: string | null;
  readonly remediation: string | null;
}

export interface WorkerRepoAccessPresentation {
  readonly summary: string;
  readonly rows: ReadonlyArray<WorkerRepoAccessRow>;
  readonly reported: boolean;
}

export type WorkerTestJobState = "pending" | "dispatched" | "failed";

export interface WorkerTestJobStatus {
  readonly state: WorkerTestJobState;
  readonly updatedAt: string;
  readonly promotedThreadId?: string;
  readonly error?: string;
}

export interface WorkerTestJobStatusPresentation {
  readonly label: string;
  readonly detail: string;
  readonly variant: "success" | "warning" | "error" | "outline";
  readonly timestamp: string | null;
}

export const NOT_REPORTED = "Not reported";
export const WORKER_TEST_JOB_PROJECT_ID = ProjectId.make("jarvis-start");

export const WORKER_TEST_JOB_OBJECTIVE =
  "Run a trivial Jarvis Cockpit worker readiness test. Report that the worker accepted the job, then stop without modifying files.";

export function workerReadinessRows(worker: JarvisWorkerProfile): WorkerReadinessRow[] {
  const codexEngine = worker.engines.find((engine) => normalize(engine.engine) === "codex");
  return [
    {
      id: "codex-installed",
      label: "Codex installed",
      status: codexEngine
        ? "reported-healthy"
        : engineListWasReported(worker)
          ? "reported-unhealthy"
          : "not-reported",
      detail: codexEngine
        ? "Codex engine reported by worker"
        : engineListWasReported(worker)
          ? "No Codex engine reported"
          : NOT_REPORTED,
    },
    {
      id: "codex-authenticated",
      label: "Codex authenticated",
      status: codexEngineStatus(codexEngine?.status),
      detail:
        codexEngine?.status === "available"
          ? "Codex engine reported available"
          : codexEngine
            ? `Codex engine reported ${codexEngine.status}`
            : NOT_REPORTED,
    },
    {
      id: "git-credentials",
      label: "Git credentials valid",
      ...capabilityReadiness(worker, {
        healthy: ["git.credentials.valid", "git.identity.connected", "github.authenticated"],
        unhealthy: ["git.credentials.invalid", "git.identity.missing", "github.unauthenticated"],
        healthyDetail: "Git credential capability reported",
        unhealthyDetail: "Git credential problem reported",
      }),
    },
    {
      id: "worktree-materialization",
      label: "Can materialize worktrees",
      ...capabilityReadiness(worker, {
        healthy: ["git.worktree", "worktree.materialize", "repo.clone", "repository.clone"],
        unhealthy: ["worktree.unavailable", "git.worktree.unavailable", "repo.clone.unavailable"],
        healthyDetail: "Worktree materialization capability reported",
        unhealthyDetail: "Worktree materialization problem reported",
      }),
    },
    {
      id: "package-manager",
      label: "Package manager",
      ...capabilityReadiness(worker, {
        healthy: ["package-manager", "package.manager", "pnpm", "npm", "bun"],
        unhealthy: ["package-manager.unavailable", "package.manager.unavailable"],
        healthyDetail: "Package manager capability reported",
        unhealthyDetail: "Package manager problem reported",
      }),
    },
    {
      id: "browser-dev-server",
      label: "Browser/dev-server capability",
      ...capabilityReadiness(worker, {
        healthy: ["browser.use", "browser.dev-server", "dev-server", "dev.server"],
        unhealthy: [
          "browser.unavailable",
          "browser.dev-server.unavailable",
          "dev-server.unavailable",
        ],
        healthyDetail: "Browser or dev-server capability reported",
        unhealthyDetail: "Browser or dev-server problem reported",
      }),
    },
  ];
}

export function workerWarmCheckouts(worker: JarvisWorkerProfile): WorkerWarmCheckout[] {
  return (worker.repositories ?? [])
    .map((repository) => ({
      repo: repository.repo,
      status: repository.status?.trim() || NOT_REPORTED,
      defaultBranch: repository.default_branch?.trim() || null,
      isDefault: repository.is_default === true,
      canStartWork: repository.can_start_work === true,
    }))
    .sort((left, right) => {
      if (left.canStartWork !== right.canStartWork) return left.canStartWork ? -1 : 1;
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.repo.localeCompare(right.repo);
    });
}

export function workerIdentityAccessSummary(
  worker: JarvisWorkerProfile,
): WorkerIdentityAccessSummary {
  return {
    gitIdentity: formatGitIdentity(
      worker.git_identity ??
        metadataValue(worker, ["git_identity", "gitIdentity", "github_identity", "githubIdentity"]),
    ),
    repoAccess: formatRepoAccess(
      worker.repo_access ??
        metadataValue(worker, [
          "repo_access",
          "repoAccess",
          "repo_access_summary",
          "repoAccessSummary",
          "access_summary",
          "accessSummary",
        ]),
    ),
    worktreeInventory: formatWorktreeInventory(
      worker.worktree_inventory ??
        metadataValue(worker, ["worktree_inventory", "worktreeInventory"]),
    ),
  };
}

export function formatWorkerWorktreePruneResult(result: JarvisWorkerWorktreePruneResponse): string {
  const reclaimed = formatBytes(result.bytes);
  const pruned = `${result.worktrees} worktree${result.worktrees === 1 ? "" : "s"}`;
  if (result.refused.length > 0) {
    return `Pruned ${pruned}, reclaimed ${reclaimed}; ${result.refused.length} refused.`;
  }
  return `Pruned ${pruned}, reclaimed ${reclaimed}.`;
}

export function selectWorkerTestJobRepo(worker: JarvisWorkerProfile): string | null {
  return (
    workerWarmCheckouts(worker).find((repository) => repository.canStartWork)?.repo ??
    workerWarmCheckouts(worker)[0]?.repo ??
    null
  );
}

export function selectWorkerTestJobEngine(worker: JarvisWorkerProfile): string | null {
  return (
    worker.engines.find((engine) => engine.default && engine.status === "available")?.engine ??
    worker.engines.find((engine) => engine.status === "available")?.engine ??
    worker.engines[0]?.engine ??
    null
  );
}

export function buildWorkerTestJobStartTurnInput(input: {
  readonly worker: JarvisWorkerProfile;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly createdAt: string;
}): StartThreadTurnInput {
  const repo = selectWorkerTestJobRepo(input.worker);
  const engine = selectWorkerTestJobEngine(input.worker);
  const title = `Worker readiness test: ${input.worker.display_name}`;
  return {
    threadId: input.threadId,
    message: {
      messageId: input.messageId,
      role: "user",
      text: WORKER_TEST_JOB_OBJECTIVE,
      attachments: [],
    },
    titleSeed: title,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    bootstrap: {
      createThread: {
        projectId: WORKER_TEST_JOB_PROJECT_ID,
        title,
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: DEFAULT_MODEL,
        },
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
        createdAt: input.createdAt,
      },
      jarvisWorkerId: input.worker.worker_id,
      ...(engine ? { jarvisEngine: engine } : {}),
      ...(repo ? { jarvisRepo: repo } : {}),
    },
    createdAt: input.createdAt,
  };
}

export function resolveWorkerTestJobStatus(
  status: WorkerTestJobStatus | null | undefined,
): WorkerTestJobStatusPresentation {
  if (!status) {
    return {
      label: "Not sent",
      detail: "No worker readiness test has been sent from this card.",
      variant: "outline",
      timestamp: null,
    };
  }
  if (status.state === "pending") {
    return {
      label: "Pending",
      detail: "Dispatch RPC is in flight.",
      variant: "warning",
      timestamp: status.updatedAt,
    };
  }
  if (status.state === "dispatched") {
    return {
      label: "Dispatched",
      detail: status.promotedThreadId
        ? `Jarvis accepted the test job as ${status.promotedThreadId}.`
        : "Jarvis accepted the test job.",
      variant: "success",
      timestamp: status.updatedAt,
    };
  }
  return {
    label: "Failed",
    detail: status.error?.trim() || "Jarvis did not accept the test job.",
    variant: "error",
    timestamp: status.updatedAt,
  };
}

function engineListWasReported(worker: JarvisWorkerProfile): boolean {
  return worker.engines.length > 0;
}

function codexEngineStatus(status: string | null | undefined): WorkerReadinessStatus {
  if (!status) return "not-reported";
  return status === "available" ? "reported-healthy" : "reported-unhealthy";
}

function capabilityReadiness(
  worker: JarvisWorkerProfile,
  config: {
    readonly healthy: ReadonlyArray<string>;
    readonly unhealthy: ReadonlyArray<string>;
    readonly healthyDetail: string;
    readonly unhealthyDetail: string;
  },
): Pick<WorkerReadinessRow, "status" | "detail"> {
  const capabilities = worker.capabilities.map(normalize);
  if (
    capabilities.some((capability) =>
      config.unhealthy.some((needle) => capabilityIncludes(capability, needle)),
    )
  ) {
    return { status: "reported-unhealthy", detail: config.unhealthyDetail };
  }
  if (
    capabilities.some((capability) =>
      config.healthy.some((needle) => capabilityIncludes(capability, needle)),
    )
  ) {
    return { status: "reported-healthy", detail: config.healthyDetail };
  }
  return { status: "not-reported", detail: NOT_REPORTED };
}

function capabilityIncludes(capability: string, needle: string): boolean {
  return capability.includes(normalize(needle));
}

function formatGitIdentity(value: unknown): WorkerGitIdentityPresentation {
  if (!isRecord(value)) {
    return {
      label: NOT_REPORTED,
      detail: NOT_REPORTED,
      authState: "not-reported",
    };
  }
  const login = stringValue(value["login"]);
  const provider = stringValue(value["provider"]) ?? "git";
  const authState = resolveGitAuthState(value);
  const detail = stringValue(value["detail"]);
  const label = login ?? metadataTextFromRecord(value) ?? NOT_REPORTED;
  return {
    label:
      label === NOT_REPORTED
        ? NOT_REPORTED
        : `${label} / ${authState === "not-reported" ? "auth state not reported" : authState}`,
    detail: detail ?? (label === NOT_REPORTED ? NOT_REPORTED : `${provider} worker identity`),
    authState,
  };
}

function resolveGitAuthState(value: Record<string, unknown>): WorkerGitAuthStatePresentation {
  const explicit = stringValue(value["auth_state"]);
  if (explicit === "valid" || explicit === "expired" || explicit === "unconfigured") {
    return explicit;
  }
  const authenticated = booleanValue(value["authenticated"]);
  const authFresh = booleanValue(value["auth_fresh"]);
  const connected = booleanValue(value["connected"]);
  if (authenticated === true && authFresh !== false) return "valid";
  if (authenticated === true && authFresh === false) return "expired";
  if (connected === false || authenticated === false) return "unconfigured";
  return "not-reported";
}

function formatRepoAccess(value: unknown): WorkerRepoAccessPresentation {
  if (Array.isArray(value)) {
    const rows = value.filter(isRecord).map(formatRepoAccessRow);
    const accessibleCount = rows.filter((row) => row.accessible === true).length;
    return {
      summary:
        rows.length === 0 ? "0 repos reported" : `${accessibleCount}/${rows.length} accessible`,
      rows,
      reported: true,
    };
  }
  const legacySummary = typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  return {
    summary: legacySummary ?? NOT_REPORTED,
    rows: [],
    reported: legacySummary !== null,
  };
}

function formatRepoAccessRow(value: Record<string, unknown>): WorkerRepoAccessRow {
  const accessible = booleanValue(value["accessible"]);
  const reasonCode = stringValue(value["reason_code"]) ?? NOT_REPORTED;
  return {
    repo: stringValue(value["repo"]) ?? NOT_REPORTED,
    accessible,
    reasonCode,
    reason: stringValue(value["reason"]),
    remediation: accessible === false ? repoAccessRemediation(reasonCode) : null,
  };
}

function repoAccessRemediation(reasonCode: string): string {
  if (reasonCode === "worker-not-connected-to-github") {
    return "Connect GitHub on the worker device.";
  }
  if (reasonCode === "identity-lacks-repo-access") {
    return "Grant this worker identity access to the repository.";
  }
  if (reasonCode === "repo-access-probe-failed") {
    return "Retry after checking worker network and GitHub CLI auth.";
  }
  if (reasonCode === "repo-reference-unsupported") {
    return "Use an org/name repository reference.";
  }
  return "Check worker GitHub credentials and repository permissions.";
}

function metadataTextFromRecord(value: Record<string, unknown>): string | null {
  return (
    [value["label"], value["display_name"], value["name"], value["login"]]
      .find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      )
      ?.trim() ?? null
  );
}

function metadataValue(worker: JarvisWorkerProfile, keys: ReadonlyArray<string>): unknown {
  for (const source of [worker.public_metadata, worker.system]) {
    if (!isRecord(source)) continue;
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null) {
        return source[key];
      }
    }
  }
  return null;
}

function formatWorktreeInventory(value: unknown): string {
  if (!isRecord(value)) return NOT_REPORTED;
  const count = numberValue(value["count"]);
  const diskBytes = numberValue(value["disk_bytes"]) ?? numberValue(value["diskBytes"]);
  const disk =
    (diskBytes !== null ? formatBytes(diskBytes) : null) ??
    stringValue(value["disk"]) ??
    stringValue(value["disk_usage"]) ??
    stringValue(value["diskUsage"]);
  const stale =
    numberValue(value["stale"]) ??
    numberValue(value["stale_count"]) ??
    numberValue(value["staleCount"]);
  const parts: string[] = [];
  if (count !== null) parts.push(`${count} worktree${count === 1 ? "" : "s"}`);
  if (disk) parts.push(disk);
  if (stale !== null) parts.push(`${stale} stale`);
  return parts.length > 0 ? parts.join(" / ") : NOT_REPORTED;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
