import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, JarvisWorkerProfile, ServerProvider } from "@t3tools/contracts";
import { useMemo } from "react";

import {
  deriveOrchestratorOptions,
  resolveOrchestratorKey,
  selectOrchestratorWorker,
} from "../orchestratorModelOptions";
import { serverEnvironment } from "../state/server";
import { useEnvironmentSettings } from "./useSettings";

export interface DefaultOrchestratorTarget {
  readonly chat_type: "orchestrator";
  readonly engine: string;
  readonly model: string;
  readonly worker_id: string;
}

export function useDefaultOrchestratorTarget(
  environmentId: EnvironmentId | null,
  workers: ReadonlyArray<JarvisWorkerProfile>,
): DefaultOrchestratorTarget | null {
  const targetEnvironmentId = environmentId ?? ("__no-environment__" as EnvironmentId);
  const providers =
    (useAtomValue(
      serverEnvironment.providersValueAtom(targetEnvironmentId),
    ) as ReadonlyArray<ServerProvider> | null) ?? [];
  const selection = useEnvironmentSettings(
    targetEnvironmentId,
    (settings) => settings.orchestratorModelSelection,
  );
  return useMemo(() => {
    const options = deriveOrchestratorOptions(providers);
    const key = resolveOrchestratorKey({
      options,
      instanceId: selection.instanceId,
      model: selection.model,
    });
    const option = options.find((candidate) => candidate.key === key);
    if (!environmentId || !option) return null;
    const workerId = selectOrchestratorWorker({ workers, engine: option.engine });
    if (!workerId) return null;
    return {
      chat_type: "orchestrator",
      engine: option.engine,
      model: option.model,
      worker_id: workerId,
    };
  }, [environmentId, providers, selection.instanceId, selection.model, workers]);
}
