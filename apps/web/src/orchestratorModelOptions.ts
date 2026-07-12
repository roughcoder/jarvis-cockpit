import type {
  JarvisWorkerProfile,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";

import { deriveProviderInstanceEntries } from "./providerInstances";
import {
  workerIsHealthyEnough,
  workerSupportsEngine,
} from "./components/composer/composerJarvisRouting.logic";

export interface CodeAgentModelOption {
  readonly key: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly engine: string;
  readonly model: string;
  readonly label: string;
}

function engineForDriver(driver: ProviderDriverKind): string {
  return driver === "claudeAgent" ? "claude" : String(driver);
}

/**
 * Flattens enabled, available provider instances into model routes while
 * preserving the exact provider instance selected by the user.
 */
export function deriveCodeAgentModelOptions(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<CodeAgentModelOption> {
  const seen = new Set<string>();
  const options: Array<CodeAgentModelOption> = [];
  for (const entry of deriveProviderInstanceEntries(providers)) {
    if (!entry.enabled || !entry.isAvailable) continue;
    for (const model of entry.models) {
      const key = `${entry.instanceId}::${model.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        key,
        providerInstanceId: entry.instanceId,
        engine: engineForDriver(entry.driverKind),
        model: model.slug,
        label: `${entry.displayName} · ${model.shortName ?? model.name}`,
      });
    }
  }
  return options;
}

export function deriveOrchestratorOptions(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<CodeAgentModelOption> {
  return deriveCodeAgentModelOptions(providers).filter(
    (option) => option.engine === "codex" || option.engine === "claude",
  );
}

export function resolveOrchestratorKey(input: {
  readonly options: ReadonlyArray<CodeAgentModelOption>;
  readonly instanceId: ProviderInstanceId;
  readonly model: string;
}): string | undefined {
  return (
    input.options.find(
      (option) => option.providerInstanceId === input.instanceId && option.model === input.model,
    ) ??
    input.options.find((option) => option.engine === "codex" && option.model === "gpt-5.5") ??
    input.options.find((option) => option.engine === "codex") ??
    input.options[0]
  )?.key;
}

export function selectOrchestratorWorker(input: {
  readonly workers: ReadonlyArray<JarvisWorkerProfile>;
  readonly engine: string;
  readonly avoidWorkerId?: string;
  readonly requiredSlots?: number;
}): string | undefined {
  const requiredSlots = input.requiredSlots ?? 1;
  const eligible = input.workers.filter((worker) => {
    const used = worker.capacity.active_sessions + worker.capacity.queued_sessions;
    return (
      workerIsHealthyEnough(worker) &&
      workerSupportsEngine(worker, input.engine) &&
      used + requiredSlots <= worker.capacity.max_sessions
    );
  });
  eligible.sort((left, right) => {
    const leftSeparate = left.worker_id === input.avoidWorkerId ? 0 : 1;
    const rightSeparate = right.worker_id === input.avoidWorkerId ? 0 : 1;
    if (leftSeparate !== rightSeparate) return rightSeparate - leftSeparate;
    const leftFree =
      left.capacity.max_sessions - left.capacity.active_sessions - left.capacity.queued_sessions;
    const rightFree =
      right.capacity.max_sessions - right.capacity.active_sessions - right.capacity.queued_sessions;
    return rightFree - leftFree;
  });
  return eligible[0]?.worker_id;
}
