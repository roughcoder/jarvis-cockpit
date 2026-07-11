import type { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

import { deriveProviderInstanceEntries } from "./providerInstances";

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
