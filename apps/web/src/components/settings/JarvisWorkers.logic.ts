import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type JarvisWorkerProfile,
  type MessageId,
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
  readonly gitIdentity: string;
  readonly repoAccess: string;
  readonly worktreeInventory: string;
}

export const NOT_REPORTED = "Not reported";

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
    gitIdentity:
      metadataText(worker, ["git_identity", "gitIdentity", "github_identity", "githubIdentity"]) ??
      NOT_REPORTED,
    repoAccess:
      metadataText(worker, [
        "repo_access_summary",
        "repoAccessSummary",
        "access_summary",
        "accessSummary",
      ]) ?? NOT_REPORTED,
    worktreeInventory: formatWorktreeInventory(
      metadataValue(worker, ["worktree_inventory", "worktreeInventory"]),
    ),
  };
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
  readonly createdAt?: string;
}): StartThreadTurnInput {
  const repo = selectWorkerTestJobRepo(input.worker);
  const engine = selectWorkerTestJobEngine(input.worker);
  return {
    threadId: input.threadId,
    message: {
      messageId: input.messageId,
      role: "user",
      text: WORKER_TEST_JOB_OBJECTIVE,
      attachments: [],
    },
    titleSeed: `Worker readiness test: ${input.worker.display_name}`,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    bootstrap: {
      jarvisWorkerId: input.worker.worker_id,
      ...(engine ? { jarvisEngine: engine } : {}),
      ...(repo ? { jarvisRepo: repo } : {}),
    },
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
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

function metadataText(worker: JarvisWorkerProfile, keys: ReadonlyArray<string>): string | null {
  const value = metadataValue(worker, keys);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (isRecord(value)) {
    const label = [value["label"], value["display_name"], value["name"], value["login"]].find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0,
    );
    return label?.trim() ?? null;
  }
  return null;
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
  const disk =
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
