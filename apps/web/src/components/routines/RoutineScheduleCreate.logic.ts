import {
  JarvisProjectId,
  JarvisRoutineId,
  type JarvisRoutineScheduleCreateInput,
} from "@t3tools/contracts";

import {
  defaultParameterValue,
  routineSubmissionParameterValues,
  type RoutineDefinition,
  type RoutineParameterValue,
} from "./routineCatalog";

export type ScheduleCadence = "custom" | "daily" | "weekdays";

export interface ScheduleDetails {
  readonly cadence: ScheduleCadence;
  readonly customWeekdays: ReadonlyArray<number>;
  readonly name: string;
  readonly projectId: string;
  readonly routineId: string;
  readonly time: string;
  readonly timezone: string;
}

export interface RoutineScheduleCreateFlowState {
  readonly details: ScheduleDetails;
  readonly phase: "details" | "parameters";
}

const DAILY_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const WORK_WEEKDAYS = [0, 1, 2, 3, 4] as const;

export function scheduleWeekdays(
  cadence: ScheduleCadence,
  customWeekdays: ReadonlyArray<number>,
): ReadonlyArray<number> {
  if (cadence === "daily") return DAILY_WEEKDAYS;
  if (cadence === "weekdays") return WORK_WEEKDAYS;
  return [...new Set(customWeekdays)].sort((left, right) => left - right);
}

export function scheduleDetailsErrors(details: ScheduleDetails): ReadonlyArray<string> {
  const errors: string[] = [];
  if (details.name.trim().length === 0) errors.push("Enter a schedule name.");
  if (details.routineId.trim().length === 0) errors.push("Choose a routine.");
  if (details.projectId.trim().length === 0) errors.push("Choose a project.");
  if (!validScheduleTime(details.time)) errors.push("Enter a valid time.");
  if (!validTimeZone(details.timezone)) errors.push("Enter a valid IANA timezone.");
  if (scheduleWeekdays(details.cadence, details.customWeekdays).length === 0) {
    errors.push("Choose at least one day.");
  }
  return errors;
}

export function moveRoutineScheduleCreateFlow(
  state: RoutineScheduleCreateFlowState,
  phase: RoutineScheduleCreateFlowState["phase"],
): RoutineScheduleCreateFlowState {
  return { ...state, phase };
}

export async function completeRoutineScheduleCreation(input: {
  readonly details: ScheduleDetails;
  readonly onCreate: (
    routine: RoutineDefinition,
    details: ScheduleDetails,
    parameterValues: Readonly<Record<string, RoutineParameterValue>>,
  ) => Promise<void>;
  readonly onOpenChange: (open: boolean) => void;
  readonly parameterValues: Readonly<Record<string, RoutineParameterValue>>;
  readonly routine: RoutineDefinition;
}): Promise<void> {
  await input.onCreate(input.routine, input.details, input.parameterValues);
  input.onOpenChange(false);
}

export function buildRoutineScheduleCreateInput(input: {
  readonly cadence: ScheduleCadence;
  readonly customWeekdays: ReadonlyArray<number>;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly parameterValues: Readonly<Record<string, RoutineParameterValue>>;
  readonly projectId: string;
  readonly routine: RoutineDefinition;
  readonly time: string;
  readonly timezone: string;
  readonly today?: Date;
}): JarvisRoutineScheduleCreateInput {
  const [hour, minute] = parseScheduleTime(input.time);
  const today = input.today ?? new Date();
  const submittedValues = routineSubmissionParameterValues(input.routine, input.parameterValues);
  const params = Object.fromEntries(
    input.routine.parameters.flatMap((parameter) => {
      const value = submittedValues[parameter.id];
      if (value === undefined) return [];
      const defaultValue =
        parameter.defaultValue === undefined ? undefined : defaultParameterValue(parameter, today);
      if (defaultValue !== undefined && sameRoutineValue(value, defaultValue)) {
        return [];
      }
      return [[parameter.id, value]];
    }),
  );

  return {
    name: input.name.trim(),
    routine_id: JarvisRoutineId.make(input.routine.id),
    ...(input.routine.version === undefined ? {} : { routine_version: input.routine.version }),
    project_id: JarvisProjectId.make(input.projectId),
    params,
    hour,
    minute,
    weekdays: [...scheduleWeekdays(input.cadence, input.customWeekdays)],
    timezone: input.timezone.trim(),
    enabled: true,
    idempotency_key: input.idempotencyKey,
  };
}

function sameRoutineValue(left: RoutineParameterValue, right: RoutineParameterValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) && Array.isArray(right) && left.join("\u0000") === right.join("\u0000")
    );
  }
  return left === right;
}

function validScheduleTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

function parseScheduleTime(value: string): readonly [number, number] {
  if (!validScheduleTime(value)) throw new Error("Invalid schedule time.");
  const [hour, minute] = value.split(":").map(Number);
  return [hour!, minute!];
}

function validTimeZone(value: string): boolean {
  if (value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}
