import type { JarvisWorkerProfile, PrReviewAccessMode, ServerProvider } from "@t3tools/contracts";

import {
  workerCanStartRepo,
  workerIsHealthyEnough,
  workerSupportsEngine,
} from "./composer/composerJarvisRouting.logic";
import {
  deriveCodeAgentModelOptions,
  selectOrchestratorWorker,
  type CodeAgentModelOption,
} from "../orchestratorModelOptions";
export { deriveOrchestratorOptions, resolveOrchestratorKey } from "../orchestratorModelOptions";

export type ReviewerOption = CodeAgentModelOption;

export type CommonReviewWorkerUnavailableReason =
  | "no_workers"
  | "availability"
  | "repository"
  | "engines"
  | "capacity";

export type CommonReviewWorkerSelection =
  | { readonly kind: "not_requested" }
  | { readonly kind: "selected"; readonly workerId: string }
  | {
      readonly kind: "unavailable";
      readonly reason: CommonReviewWorkerUnavailableReason;
      readonly message: string;
    };

interface CommonReviewWorkerSelectionInput {
  readonly workers: ReadonlyArray<JarvisWorkerProfile>;
  readonly reviewers: ReadonlyArray<Pick<ReviewerOption, "engine">>;
  readonly repo: string;
}

export const PR_REVIEW_ACCESS_OPTIONS: ReadonlyArray<{
  readonly id: PrReviewAccessMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    id: "read_only",
    label: "Read only",
    description: "Allow inspection and bounded read commands only.",
  },
  {
    id: "interactive",
    label: "Interactive",
    description: "Ask in Cockpit before commands or file changes.",
  },
  {
    id: "full_trust",
    label: "Full trust",
    description: "Allow commands and file changes without prompts.",
  },
];

export function isPrReviewAccessMode(value: string): value is PrReviewAccessMode {
  return PR_REVIEW_ACCESS_OPTIONS.some((option) => option.id === value);
}

const DEFAULT_REVIEWER_MODELS = [
  { engine: "claude", model: "claude-opus-4-7" },
  { engine: "codex", model: "gpt-5.5" },
] as const;

function workerHasConfirmedAvailability(worker: JarvisWorkerProfile): boolean {
  return (
    (worker.status === "online" || worker.status === "degraded") &&
    (worker.health === "healthy" || worker.health === "degraded")
  );
}

/**
 * PR reviewers can use every code-agent provider route exposed by the fleet.
 */
export function deriveReviewerOptions(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ReviewerOption> {
  return deriveCodeAgentModelOptions(providers);
}

export function defaultReviewerKeys(options: ReadonlyArray<ReviewerOption>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const target of DEFAULT_REVIEWER_MODELS) {
    const match = options.find(
      (option) => option.engine === target.engine && option.model === target.model,
    );
    if (match) {
      keys.add(match.key);
    }
  }
  return keys;
}

function freeWorkerSlots(worker: JarvisWorkerProfile): number {
  return (
    worker.capacity.max_sessions - worker.capacity.active_sessions - worker.capacity.queued_sessions
  );
}

export function evaluateCommonReviewWorkerSelection(
  input: CommonReviewWorkerSelectionInput,
): CommonReviewWorkerSelection {
  const engines = [...new Set(input.reviewers.map((reviewer) => reviewer.engine))];
  const requiredSlots = input.reviewers.length;
  if (engines.length === 0) return { kind: "not_requested" };
  if (input.workers.length === 0) {
    return {
      kind: "unavailable",
      reason: "no_workers",
      message: "No workers are available in the current Jarvis snapshot.",
    };
  }

  const available = input.workers.filter(
    (worker) => workerHasConfirmedAvailability(worker) && workerIsHealthyEnough(worker),
  );
  if (available.length === 0) {
    const details = input.workers
      .map((worker) => `${worker.display_name} (status ${worker.status}, health ${worker.health})`)
      .join("; ");
    return {
      kind: "unavailable",
      reason: "availability",
      message:
        "No worker has confirmed online/degraded status and healthy/degraded health. " +
        `${details}.`,
    };
  }

  const repoCapable = available.filter((worker) => workerCanStartRepo(worker, input.repo));
  if (repoCapable.length === 0) {
    return {
      kind: "unavailable",
      reason: "repository",
      message:
        `No confirmed healthy worker can start ${input.repo}. Checked: ` +
        `${available.map((worker) => worker.display_name).join(", ")}.`,
    };
  }

  const engineCapable = repoCapable.filter((worker) =>
    engines.every((engine) => workerSupportsEngine(worker, engine)),
  );
  if (engineCapable.length === 0) {
    const details = repoCapable
      .map((worker) => {
        const missing = engines.filter((engine) => !workerSupportsEngine(worker, engine));
        return `${worker.display_name} is missing ${missing.join(", ")}`;
      })
      .join("; ");
    return {
      kind: "unavailable",
      reason: "engines",
      message: `No repo-capable worker supports all selected reviewer engines. ${details}.`,
    };
  }

  const eligible = engineCapable.filter((worker) => freeWorkerSlots(worker) >= requiredSlots);
  if (eligible.length === 0) {
    const details = engineCapable
      .map(
        (worker) =>
          `${worker.display_name} has ${String(Math.max(0, freeWorkerSlots(worker)))}/` +
          `${String(requiredSlots)} slots free (max ${String(worker.capacity.max_sessions)}, ` +
          `${String(worker.capacity.active_sessions)} active, ` +
          `${String(worker.capacity.queued_sessions)} queued)`,
      )
      .join("; ");
    return {
      kind: "unavailable",
      reason: "capacity",
      message: `No compatible worker has ${String(requiredSlots)} free slots. ${details}.`,
    };
  }

  eligible.sort((left, right) => {
    const leftAuthenticated = left.git_identity?.authenticated === true ? 1 : 0;
    const rightAuthenticated = right.git_identity?.authenticated === true ? 1 : 0;
    if (leftAuthenticated !== rightAuthenticated) return rightAuthenticated - leftAuthenticated;
    return freeWorkerSlots(right) - freeWorkerSlots(left);
  });

  return { kind: "selected", workerId: eligible[0]!.worker_id };
}

export function selectCommonReviewWorker(
  input: CommonReviewWorkerSelectionInput,
): string | undefined {
  const selection = evaluateCommonReviewWorkerSelection(input);
  return selection.kind === "selected" ? selection.workerId : undefined;
}

export function selectReviewOrchestratorWorker(input: {
  readonly workers: ReadonlyArray<JarvisWorkerProfile>;
  readonly childWorkerId?: string;
  readonly engine: string;
}): string | undefined {
  const confirmedWorkers = input.workers.filter(workerHasConfirmedAvailability);
  const selected = selectOrchestratorWorker({
    workers: confirmedWorkers,
    engine: input.engine,
    ...(input.childWorkerId ? { avoidWorkerId: input.childWorkerId } : {}),
  });
  if (selected !== input.childWorkerId) return selected;
  return selectOrchestratorWorker({
    workers: confirmedWorkers,
    engine: input.engine,
    ...(input.childWorkerId ? { avoidWorkerId: input.childWorkerId } : {}),
    requiredSlots: 3,
  });
}
