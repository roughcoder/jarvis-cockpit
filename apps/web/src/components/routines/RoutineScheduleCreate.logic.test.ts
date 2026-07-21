import { describe, expect, it } from "vite-plus/test";

import { routineCatalogAdapter } from "./routineCatalog";
import {
  buildRoutineScheduleCreateInput,
  completeRoutineScheduleCreation,
  moveRoutineScheduleCreateFlow,
  scheduleDetailsErrors,
  scheduleWeekdays,
} from "./RoutineScheduleCreate.logic";

const morningBrief = routineCatalogAdapter
  .getSnapshot()
  .routines.find((routine) => routine.id === "morning-brief")!;

describe("routine schedule creation", () => {
  it("maps supported cadence choices to Jarvis weekday indexes", () => {
    expect(scheduleWeekdays("daily", [])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(scheduleWeekdays("weekdays", [])).toEqual([0, 1, 2, 3, 4]);
    expect(scheduleWeekdays("custom", [4, 1, 4])).toEqual([1, 4]);
  });

  it("builds a schedule payload without freezing dynamic today defaults", () => {
    expect(
      buildRoutineScheduleCreateInput({
        routine: morningBrief,
        name: "Jarvis morning brief",
        projectId: "project-123",
        time: "08:30",
        timezone: "Europe/London",
        cadence: "weekdays",
        customWeekdays: [],
        parameterValues: { day: "2026-07-20", scope: "Current project" },
        idempotencyKey: "schedule-create-123",
        today: new Date(2026, 6, 20),
      }),
    ).toEqual({
      name: "Jarvis morning brief",
      routine_id: "morning-brief",
      project_id: "project-123",
      params: { scope: "Current project" },
      hour: 8,
      minute: 30,
      weekdays: [0, 1, 2, 3, 4],
      timezone: "Europe/London",
      enabled: true,
      idempotency_key: "schedule-create-123",
    });
  });

  it("keeps an explicitly overridden dynamic parameter", () => {
    expect(
      buildRoutineScheduleCreateInput({
        routine: morningBrief,
        name: "Historical brief",
        projectId: "project-123",
        time: "09:05",
        timezone: "UTC",
        cadence: "custom",
        customWeekdays: [6],
        parameterValues: { day: "2026-07-19", scope: "Pinned projects" },
        idempotencyKey: "schedule-create-456",
        today: new Date(2026, 6, 20),
      }).params,
    ).toEqual({ day: "2026-07-19", scope: "Pinned projects" });
  });

  it("reports incomplete custom timing details before parameter entry", () => {
    expect(
      scheduleDetailsErrors({
        name: " ",
        routineId: "",
        projectId: "",
        time: "25:90",
        timezone: "Not/AZone",
        cadence: "custom",
        customWeekdays: [],
      }),
    ).toEqual([
      "Enter a schedule name.",
      "Choose a routine.",
      "Choose a project.",
      "Enter a valid time.",
      "Enter a valid IANA timezone.",
      "Choose at least one day.",
    ]);
  });

  it("preserves the selected routine and edited details across phase transitions", () => {
    const details = {
      name: "My early brief",
      routineId: "morning-brief",
      projectId: "project-123",
      time: "07:45",
      timezone: "Europe/London",
      cadence: "weekdays",
      customWeekdays: [0, 1, 2, 3, 4],
    } as const;

    const parameters = moveRoutineScheduleCreateFlow({ phase: "details", details }, "parameters");
    const back = moveRoutineScheduleCreateFlow(parameters, "details");

    expect(parameters).toEqual({ phase: "parameters", details });
    expect(back).toEqual({ phase: "details", details });
  });

  it("closes the whole flow after the selected schedule is created", async () => {
    const details = {
      name: "My early brief",
      routineId: "morning-brief",
      projectId: "project-123",
      time: "07:45",
      timezone: "Europe/London",
      cadence: "weekdays",
      customWeekdays: [0, 1, 2, 3, 4],
    } as const;
    const calls: string[] = [];

    await completeRoutineScheduleCreation({
      routine: morningBrief,
      details,
      parameterValues: { day: "2026-07-20", scope: "Current project" },
      onCreate: async (routine, submittedDetails) => {
        calls.push(`create:${routine.id}:${submittedDetails.name}:${submittedDetails.time}`);
      },
      onOpenChange: (open) => calls.push(`open:${String(open)}`),
    });

    expect(calls).toEqual(["create:morning-brief:My early brief:07:45", "open:false"]);
  });
});
