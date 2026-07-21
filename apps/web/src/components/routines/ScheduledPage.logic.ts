import type { RoutineDefinition, RoutineIconName, RoutineSchedule } from "./routineCatalog";

export function scheduleRoutinePresentation(
  schedule: Pick<RoutineSchedule, "routineId">,
  routine: RoutineDefinition | null,
): { readonly icon: RoutineIconName; readonly name: string } {
  return routine === null
    ? { icon: "brief", name: schedule.routineId }
    : { icon: routine.icon, name: routine.name };
}
