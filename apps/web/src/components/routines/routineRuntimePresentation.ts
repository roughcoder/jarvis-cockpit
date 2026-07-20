import type {
  JarvisRoutine,
  JarvisRoutineParameter,
  JarvisRoutineSchedule,
} from "@t3tools/contracts";

import type {
  RoutineApplicability,
  RoutineDefinition,
  RoutineIconName,
  RoutineParameterDefinition,
  RoutineParameterKind,
  RoutineSchedule,
} from "./routineCatalog";

function parameterKind(parameter: JarvisRoutineParameter): RoutineParameterKind {
  if (parameter.type === "boolean") return "boolean";
  if (parameter.type === "date") return "date";
  if (parameter.type === "repository_ref") return "github-repository";
  if (parameter.type === "pull_request_ref") return "pull-request";
  if (parameter.type === "model_ref") return "model";
  if (parameter.type === "enum" || parameter.type === "worker_ref") return "select";
  return "text";
}

function scalarDefault(
  parameter: JarvisRoutineParameter,
): string | boolean | ReadonlyArray<string> | undefined {
  if (parameter.default?.source === "today") return "today";
  if (parameter.default?.source !== "literal") return undefined;
  const value = parameter.default.value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(String);
  return undefined;
}

function runtimeParameter(parameter: JarvisRoutineParameter): RoutineParameterDefinition {
  const choices = parameter.choices.filter((choice) => choice.trim().length > 0);
  const cardinalityHint = parameter.allow_multiple
    ? parameter.min_items === parameter.max_items && parameter.min_items > 0
      ? `Choose exactly ${parameter.min_items}`
      : [
          parameter.min_items > 0 ? `Choose at least ${parameter.min_items}` : null,
          parameter.max_items > 0 ? `up to ${parameter.max_items}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(" and ")
    : "";
  return {
    id: parameter.name,
    label: parameter.label,
    kind: parameterKind(parameter),
    allowMultiple: parameter.allow_multiple,
    ...(parameter.min_items > 0 ? { minItems: parameter.min_items } : {}),
    ...(parameter.max_items > 0 ? { maxItems: parameter.max_items } : {}),
    required: parameter.required,
    description:
      cardinalityHint.length > 0
        ? `${parameter.description.trimEnd()} ${cardinalityHint}.`
        : parameter.description,
    ...(scalarDefault(parameter) === undefined ? {} : { defaultValue: scalarDefault(parameter)! }),
    ...(choices.length > 0 ? { options: choices } : {}),
  };
}

function applicability(targetType: string): RoutineApplicability | null {
  if (targetType === "pull_request") return "Pull request";
  if (targetType === "repository" || targetType === "github_repository") {
    return "GitHub repository";
  }
  if (targetType === "project") return "Project";
  if (targetType === "conversation" || targetType === "chat") return "Any conversation";
  if (targetType === "worker" || targetType === "worker_fleet") return "Worker fleet";
  return null;
}

function routineIcon(routine: JarvisRoutine): RoutineIconName {
  const targets = new Set(routine.target_types);
  if (targets.has("pull_request")) return "pull-request";
  if (targets.has("worker") || targets.has("worker_fleet")) return "health";
  if (/release/iu.test(routine.routine_id)) return "release";
  if (/triage|issue/iu.test(routine.routine_id)) return "triage";
  return "brief";
}

export function runtimeRoutineToDefinition(
  routine: JarvisRoutine,
  scheduleCount: number,
): RoutineDefinition {
  const routineApplicability = routine.target_types
    .map(applicability)
    .filter((value): value is RoutineApplicability => value !== null);
  const contextualTriggers = routineApplicability.map((value) =>
    value === "Any conversation" ? "Conversation" : value,
  );
  return {
    id: routine.routine_id,
    version: routine.version,
    name: routine.name,
    category: routine.builtin ? "Built in" : "Custom",
    description: routine.summary || routine.description,
    icon: routineIcon(routine),
    applicability: routineApplicability.length > 0 ? routineApplicability : ["Project"],
    triggerLabels: ["Manual", ...contextualTriggers, ...(scheduleCount > 0 ? ["Scheduled"] : [])],
    scheduleCount,
    source: "runtime",
    parameters: routine.parameters.map(runtimeParameter),
  };
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function runtimeScheduleTrigger(schedule: JarvisRoutineSchedule): string {
  const weekdays =
    schedule.weekdays.length === 7
      ? "Every day"
      : schedule.weekdays.length === 5 && schedule.weekdays.every((day, index) => day === index)
        ? "Weekdays"
        : schedule.weekdays.map((day) => weekdayLabels[day] ?? String(day)).join(", ");
  return `${weekdays} at ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
}

export function runtimeScheduleToPresentation(schedule: JarvisRoutineSchedule): RoutineSchedule {
  return {
    id: schedule.schedule_id,
    routineId: schedule.routine_id,
    name: schedule.name,
    context: schedule.project_id,
    trigger: runtimeScheduleTrigger(schedule),
    nextRun: schedule.enabled
      ? `Next ${runtimeScheduleTrigger(schedule).toLocaleLowerCase()}`
      : "Paused",
    lastRun: schedule.last_fired_date || "Never",
    health: schedule.enabled ? "healthy" : "paused",
    source: "runtime",
  };
}

export function isRoutineApiUnavailable(
  ...messages: ReadonlyArray<string | null | undefined>
): boolean {
  return messages.some(
    (message) =>
      message !== null &&
      message !== undefined &&
      /(HTTP (404|405|501)|not expose|not implemented|unknown (RPC )?method|unsupported)/iu.test(
        message,
      ),
  );
}
