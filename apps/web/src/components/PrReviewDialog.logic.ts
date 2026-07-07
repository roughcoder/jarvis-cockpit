import type { ServerProvider } from "@t3tools/contracts";

import { deriveProviderInstanceEntries } from "../providerInstances";

export interface ReviewerOption {
  readonly key: string;
  /** Model slug named in the orchestrator prompt. */
  readonly model: string;
  readonly label: string;
}

/**
 * Flattens the enabled, available provider instances into a flat list of
 * selectable models. The cockpit only names these models in the orchestrator
 * prompt — it does not run them itself — so a plain slug + label is enough.
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
        model: model.slug,
        label: `${entry.displayName} · ${model.shortName ?? model.name}`,
      });
    }
  }
  return options;
}
