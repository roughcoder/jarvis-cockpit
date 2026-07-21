export type RoutineApplicability =
  | "Any conversation"
  | "GitHub repository"
  | "Project"
  | "Pull request"
  | "Worker fleet";

export type RoutineContextKind =
  | "conversation"
  | "github-repository"
  | "project"
  | "pull-request"
  | "worker-fleet";

export interface RoutineLaunchContext {
  readonly kind: RoutineContextKind;
  readonly label: string;
  readonly lockedParameterIds?: ReadonlyArray<string>;
  readonly parameterValues?: Readonly<Record<string, RoutineParameterValue>>;
}

export type RoutineParameterValue = string | boolean | ReadonlyArray<string>;

export type RoutineParameterKind =
  | "boolean"
  | "date"
  | "github-repository"
  | "model"
  | "pull-request"
  | "select"
  | "text";

export type RoutineIconName = "brief" | "health" | "pull-request" | "release" | "triage";

export interface RoutineParameterDefinition {
  readonly allowMultiple?: boolean;
  readonly defaultValue?: RoutineParameterValue;
  readonly description: string;
  readonly id: string;
  readonly kind: RoutineParameterKind;
  readonly label: string;
  readonly maxItems?: number;
  readonly minItems?: number;
  readonly options?: ReadonlyArray<string>;
  readonly placeholder?: string;
  readonly required: boolean;
}

export interface RoutineDefinition {
  readonly applicability: ReadonlyArray<RoutineApplicability>;
  readonly category: string;
  readonly description: string;
  readonly icon: RoutineIconName;
  readonly id: string;
  readonly name: string;
  readonly parameters: ReadonlyArray<RoutineParameterDefinition>;
  readonly scheduleCount: number;
  readonly source: "compatibility" | "runtime";
  readonly triggerLabels: ReadonlyArray<string>;
  readonly version?: number;
}

export type RoutineScheduleHealth = "attention" | "healthy" | "paused" | "running";

export interface RoutineSchedule {
  readonly context: string;
  readonly health: RoutineScheduleHealth;
  readonly id: string;
  readonly lastRun: string;
  readonly name: string;
  readonly nextRun: string;
  readonly routineId: string;
  readonly source: "compatibility" | "runtime";
  readonly trigger: string;
}

export interface RoutineCatalogSnapshot {
  readonly routines: ReadonlyArray<RoutineDefinition>;
  readonly schedules: ReadonlyArray<RoutineSchedule>;
}

export interface RoutineRunInput {
  readonly parameterValues: Readonly<Record<string, RoutineParameterValue>>;
  readonly routineId: string;
}

export interface RoutineRunReceipt {
  readonly runId: string;
  readonly startedAt: string;
}

export interface RoutineCatalogAdapter {
  getSnapshot(): RoutineCatalogSnapshot;
  runRoutine(input: RoutineRunInput): Promise<RoutineRunReceipt>;
}

const ROUTINES: ReadonlyArray<RoutineDefinition> = [
  {
    id: "pull-request-review",
    name: "Pull request review",
    category: "Engineering",
    description:
      "Run a multi-model review, reconcile the findings, and prepare a GitHub-ready decision.",
    icon: "pull-request",
    applicability: ["Pull request", "GitHub repository"],
    triggerLabels: ["Manual", "Pull request", "Scheduled"],
    scheduleCount: 1,
    source: "compatibility",
    parameters: [
      {
        id: "pullRequest",
        label: "Pull request",
        kind: "pull-request",
        required: true,
        description: "A pull request from a repository connected to your GitHub account.",
        placeholder: "roughcoder/jarvis#123",
      },
      {
        id: "model",
        label: "Lead model",
        kind: "model",
        required: true,
        description: "The model that synthesizes the final review.",
        defaultValue: "Claude Sonnet 4.5",
        options: ["Claude Sonnet 4.5", "GPT-5.5", "Gemini 2.5 Pro"],
      },
      {
        id: "instructions",
        label: "Extra details",
        kind: "text",
        required: false,
        description: "Optional focus areas, constraints, or context for the reviewers.",
        placeholder: "Focus on failure recovery and backward compatibility…",
      },
    ],
  },
  {
    id: "morning-brief",
    name: "Morning brief",
    category: "Planning",
    description:
      "Summarize active project work, blockers, decisions, and conversations needing attention.",
    icon: "brief",
    applicability: ["Project", "Any conversation"],
    triggerLabels: ["Manual", "Scheduled"],
    scheduleCount: 1,
    source: "compatibility",
    parameters: [
      {
        id: "day",
        label: "Day",
        kind: "date",
        required: true,
        description: "The working day to summarize.",
        defaultValue: "today",
      },
      {
        id: "scope",
        label: "Scope",
        kind: "select",
        required: true,
        description: "Which work should be included in the brief.",
        defaultValue: "All active projects",
        options: ["All active projects", "Pinned projects", "Current project"],
      },
    ],
  },
  {
    id: "issue-triage",
    name: "Issue triage",
    category: "Engineering",
    description:
      "Group new issues, identify likely duplicates, and flag reports that need an immediate response.",
    icon: "triage",
    applicability: ["GitHub repository", "Project"],
    triggerLabels: ["Manual", "Repository", "Scheduled"],
    scheduleCount: 1,
    source: "compatibility",
    parameters: [
      {
        id: "repository",
        label: "Repository",
        kind: "github-repository",
        required: true,
        description: "A repository connected to your GitHub account.",
        defaultValue: "Current project repository",
        options: ["Current project repository", "roughcoder/jarvis", "roughcoder/jarvis-cockpit"],
      },
      {
        id: "since",
        label: "Issues since",
        kind: "date",
        required: true,
        description: "Only include issues created on or after this date.",
        defaultValue: "today",
      },
    ],
  },
  {
    id: "release-readiness",
    name: "Release readiness",
    category: "Delivery",
    description:
      "Check pull requests, tests, release notes, and unresolved risks before a release decision.",
    icon: "release",
    applicability: ["GitHub repository", "Project"],
    triggerLabels: ["Manual", "Project"],
    scheduleCount: 0,
    source: "compatibility",
    parameters: [
      {
        id: "repository",
        label: "Repository",
        kind: "github-repository",
        required: true,
        description: "The repository being prepared for release.",
        defaultValue: "Current project repository",
        options: ["Current project repository", "roughcoder/jarvis", "roughcoder/jarvis-cockpit"],
      },
      {
        id: "target",
        label: "Target",
        kind: "text",
        required: true,
        description: "The branch, tag, or version being considered for release.",
        placeholder: "main or v1.8.0",
      },
      {
        id: "publish",
        label: "Prepare release notes",
        kind: "boolean",
        required: false,
        description: "Ask Jarvis to draft release notes as part of the process.",
        defaultValue: true,
      },
    ],
  },
  {
    id: "system-health-check",
    name: "System health check",
    category: "Operations",
    description:
      "Inspect workers and active sessions, reporting only changes that require intervention.",
    icon: "health",
    applicability: ["Worker fleet"],
    triggerLabels: ["Manual", "Scheduled"],
    scheduleCount: 1,
    source: "compatibility",
    parameters: [
      {
        id: "depth",
        label: "Check depth",
        kind: "select",
        required: true,
        description: "How much diagnostic work Jarvis should perform.",
        defaultValue: "Standard",
        options: ["Quick", "Standard", "Deep"],
      },
    ],
  },
];

const SCHEDULES: ReadonlyArray<RoutineSchedule> = [
  {
    id: "weekday-brief",
    routineId: "morning-brief",
    name: "Weekday morning brief",
    context: "All active projects",
    trigger: "Weekdays at 08:30",
    nextRun: "Tomorrow, 08:30",
    lastRun: "Today, 08:31",
    health: "healthy",
    source: "compatibility",
  },
  {
    id: "pr-review-follow-up",
    routineId: "pull-request-review",
    name: "Open PR follow-up",
    context: "All linked repositories",
    trigger: "Weekdays at 16:00",
    nextRun: "Today, 16:00",
    lastRun: "Yesterday, 16:04",
    health: "healthy",
    source: "compatibility",
  },
  {
    id: "daily-issue-triage",
    routineId: "issue-triage",
    name: "New issue triage",
    context: "roughcoder/jarvis",
    trigger: "Every day at 09:15",
    nextRun: "Tomorrow, 09:15",
    lastRun: "Today, 09:16",
    health: "attention",
    source: "compatibility",
  },
  {
    id: "fleet-watch",
    routineId: "system-health-check",
    name: "Fleet health watch",
    context: "All workers",
    trigger: "Every 30 minutes",
    nextRun: "In 17 minutes",
    lastRun: "13 minutes ago",
    health: "running",
    source: "compatibility",
  },
  {
    id: "release-preflight",
    routineId: "release-readiness",
    name: "Release preflight",
    context: "roughcoder/jarvis-cockpit",
    trigger: "Fridays at 14:00",
    nextRun: "Paused",
    lastRun: "10 days ago",
    health: "paused",
    source: "compatibility",
  },
];

const snapshot: RoutineCatalogSnapshot = Object.freeze({
  routines: ROUTINES,
  schedules: SCHEDULES,
});

export const routineCatalogAdapter: RoutineCatalogAdapter = {
  getSnapshot() {
    return snapshot;
  },
  async runRoutine(input) {
    throw new Error(
      `Routine ${input.routineId} is a compatibility preview and cannot run until Jarvis exposes the routines API.`,
    );
  },
};

export function findRoutine(
  routines: ReadonlyArray<RoutineDefinition>,
  routineId: string,
): RoutineDefinition | null {
  return routines.find((routine) => routine.id === routineId) ?? null;
}

const applicabilityByContextKind = {
  conversation: "Any conversation",
  "github-repository": "GitHub repository",
  project: "Project",
  "pull-request": "Pull request",
  "worker-fleet": "Worker fleet",
} satisfies Record<RoutineContextKind, RoutineApplicability>;

export function routineAppliesToContext(
  routine: RoutineDefinition,
  context: RoutineLaunchContext,
): boolean {
  return routine.applicability.includes(applicabilityByContextKind[context.kind]);
}

export function routinesForContext(
  routines: ReadonlyArray<RoutineDefinition>,
  context: RoutineLaunchContext | null,
): ReadonlyArray<RoutineDefinition> {
  return context === null
    ? routines
    : routines.filter((routine) => routineAppliesToContext(routine, context));
}

export function defaultParameterValue(
  parameter: RoutineParameterDefinition,
  today = new Date(),
): RoutineParameterValue {
  if (parameter.defaultValue === "today") {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return parameter.defaultValue ?? (parameter.kind === "boolean" ? false : "");
}

export function initialRoutineParameterValues(
  routine: RoutineDefinition,
  today = new Date(),
  context: RoutineLaunchContext | null = null,
): Readonly<Record<string, RoutineParameterValue>> {
  const defaults = Object.fromEntries(
    routine.parameters.map((parameter) => [parameter.id, defaultParameterValue(parameter, today)]),
  );
  return context?.parameterValues === undefined
    ? defaults
    : { ...defaults, ...context.parameterValues };
}

export function routineSubmissionParameterValues(
  routine: RoutineDefinition,
  values: Readonly<Record<string, RoutineParameterValue>>,
): Readonly<Record<string, RoutineParameterValue>> {
  return Object.fromEntries(
    routine.parameters.flatMap((parameter) =>
      Object.prototype.hasOwnProperty.call(values, parameter.id)
        ? [[parameter.id, values[parameter.id]!]]
        : [],
    ),
  );
}

export function missingRequiredParameterIds(
  routine: RoutineDefinition,
  values: Readonly<Record<string, RoutineParameterValue>>,
): ReadonlyArray<string> {
  return routine.parameters
    .filter((parameter) => {
      const value = values[parameter.id];
      if (Array.isArray(value)) {
        if (parameter.required && value.length === 0) return true;
        if (parameter.minItems !== undefined && value.length < parameter.minItems) return true;
        if (parameter.maxItems !== undefined && value.length > parameter.maxItems) return true;
        return false;
      }
      if (!parameter.required) return false;
      return typeof value === "string" ? value.trim().length === 0 : value === undefined;
    })
    .map((parameter) => parameter.id);
}

export function toggleRoutineParameterOption(
  value: RoutineParameterValue,
  option: string,
  selected: boolean,
): ReadonlyArray<string> {
  const current = Array.isArray(value) ? value : [];
  if (selected) return current.includes(option) ? current : [...current, option];
  return current.filter((candidate) => candidate !== option);
}
