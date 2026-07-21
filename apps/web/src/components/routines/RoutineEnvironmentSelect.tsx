import { EnvironmentId } from "@t3tools/contracts";

export function RoutineEnvironmentSelect({
  environments,
  value,
  onChange,
}: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly onChange: (environmentId: EnvironmentId) => void;
  readonly value: EnvironmentId;
}) {
  if (environments.length < 2) return null;

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="routine-environment">
        Jarvis environment
      </label>
      <select
        id="routine-environment"
        name="routine-environment"
        aria-label="Jarvis environment"
        className="h-10 min-w-48 appearance-none rounded-lg border border-input bg-background px-3 pr-8 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24 sm:h-8 sm:text-sm"
        value={value}
        onChange={(event) => onChange(EnvironmentId.make(event.target.value))}
      >
        {environments.map((environment) => (
          <option key={environment.environmentId} value={environment.environmentId}>
            {environment.label}
          </option>
        ))}
      </select>
    </div>
  );
}
