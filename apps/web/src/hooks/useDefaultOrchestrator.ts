import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, JarvisWorkerProfile, ServerProvider } from "@t3tools/contracts";
import { useMemo } from "react";

import { buildOrchestratorTarget, deriveOrchestratorOptions } from "../orchestratorModelOptions";
import { serverEnvironment } from "../state/server";
import { useEnvironmentSettings } from "./useSettings";

export interface DefaultOrchestratorTarget {
  readonly chat_type: "orchestrator";
  readonly engine: string;
  readonly model: string;
  /**
   * A preference, not a requirement. Jarvis binds a worker when a turn actually
   * needs one, so opening a conversation must not wait on the fleet snapshot —
   * a degraded or slow snapshot would otherwise make the project unusable.
   */
  readonly worker_id?: string;
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
    if (!environmentId) return null;
    return buildOrchestratorTarget({
      options: deriveOrchestratorOptions(providers),
      instanceId: selection.instanceId,
      model: selection.model,
      workers,
    });
  }, [environmentId, providers, selection.instanceId, selection.model, workers]);
}
