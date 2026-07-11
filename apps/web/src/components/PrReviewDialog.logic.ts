import type {
  JarvisWorkerProfile,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";

import {
  workerCanStartRepo,
  workerIsHealthyEnough,
  workerSupportsEngine,
} from "./composer/composerJarvisRouting.logic";
import { deriveProviderInstanceEntries } from "../providerInstances";

export interface ReviewerOption {
  readonly key: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly engine: string;
  readonly model: string;
  readonly label: string;
}

const DEFAULT_REVIEWER_MODELS = [
  { engine: "claude", model: "claude-opus-4-7" },
  { engine: "codex", model: "gpt-5.5" },
] as const;

function reviewEngineForDriver(driver: ProviderDriverKind): string {
  return driver === "claudeAgent" ? "claude" : String(driver);
}

/**
 * Flattens the enabled, available provider instances into a flat list of
 * selectable models. Keep the provider instance, runtime engine, and model
 * together: an orchestrator must be able to reproduce the user's exact route,
 * including when several instances share the same engine.
 */
export function deriveReviewerOptions(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ReviewerOption> {
  const seen = new Set<string>();
  const options: Array<ReviewerOption> = [];
  for (const entry of deriveProviderInstanceEntries(providers)) {
    if (!entry.enabled || !entry.isAvailable) {
      continue;
    }
    for (const model of entry.models) {
      const key = `${entry.instanceId}::${model.slug}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push({
        key,
        providerInstanceId: entry.instanceId,
        engine: reviewEngineForDriver(entry.driverKind),
        model: model.slug,
        label: `${entry.displayName} · ${model.shortName ?? model.name}`,
      });
    }
  }
  return options;
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

export function selectCommonReviewWorker(input: {
  readonly workers: ReadonlyArray<JarvisWorkerProfile>;
  readonly reviewers: ReadonlyArray<Pick<ReviewerOption, "engine">>;
  readonly repo: string;
}): string | undefined {
  const engines = [...new Set(input.reviewers.map((reviewer) => reviewer.engine))];
  if (engines.length === 0) return undefined;

  const eligible = input.workers.filter((worker) => {
    const used = worker.capacity.active_sessions + worker.capacity.queued_sessions;
    return (
      workerIsHealthyEnough(worker) &&
      workerCanStartRepo(worker, input.repo) &&
      used + input.reviewers.length <= worker.capacity.max_sessions &&
      engines.every((engine) => workerSupportsEngine(worker, engine))
    );
  });

  eligible.sort((left, right) => {
    const leftAuthenticated = left.git_identity?.authenticated === true ? 1 : 0;
    const rightAuthenticated = right.git_identity?.authenticated === true ? 1 : 0;
    if (leftAuthenticated !== rightAuthenticated) return rightAuthenticated - leftAuthenticated;
    const leftFree =
      left.capacity.max_sessions - left.capacity.active_sessions - left.capacity.queued_sessions;
    const rightFree =
      right.capacity.max_sessions - right.capacity.active_sessions - right.capacity.queued_sessions;
    return rightFree - leftFree;
  });

  return eligible[0]?.worker_id;
}
