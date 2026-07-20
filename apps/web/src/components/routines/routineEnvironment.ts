import type { EnvironmentId } from "@t3tools/contracts";

export function resolveRoutineEnvironment<
  TEnvironment extends { readonly environmentId: EnvironmentId },
>(
  environments: ReadonlyArray<TEnvironment>,
  selectedEnvironmentId: EnvironmentId | null,
): TEnvironment | null {
  return (
    environments.find((environment) => environment.environmentId === selectedEnvironmentId) ??
    environments[0] ??
    null
  );
}
