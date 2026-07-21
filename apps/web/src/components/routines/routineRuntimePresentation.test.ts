import type { JarvisRoutine, JarvisRoutineSchedule } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isRoutineApiUnavailable,
  runtimeRoutineToDefinition,
  runtimeScheduleToPresentation,
} from "./routineRuntimePresentation";

describe("routine runtime presentation", () => {
  it("maps runtime parameters and contextual targets into the routine library", () => {
    const routine = {
      routine_id: "pull-request-review",
      version: 3,
      name: "Pull request review",
      summary: "Review a pull request with selected dimensions.",
      description: "Long description",
      builtin: true,
      target_types: ["pull_request", "project"],
      execution: {
        chat_type: "orchestrator",
        default_engine: "codex",
        supported_engines: ["codex"],
      },
      parameters: [
        {
          name: "day",
          label: "Review day",
          description: "The reporting day.",
          type: "date",
          required: true,
          default: { source: "today" },
          options_source: "",
          allow_multiple: false,
          sensitive: false,
          choices: [],
          min_items: 0,
          max_items: 1,
        },
        {
          name: "dimensions",
          label: "Dimensions",
          description: "Review focus.",
          type: "enum",
          required: true,
          default: { source: "literal", value: ["correctness", "security"] },
          options_source: "review.dimensions",
          allow_multiple: true,
          sensitive: false,
          choices: ["correctness", "security"],
          min_items: 1,
          max_items: 1,
        },
      ],
    } as unknown as JarvisRoutine;

    const result = runtimeRoutineToDefinition(routine, 2);

    expect(result).toMatchObject({
      id: "pull-request-review",
      source: "runtime",
      scheduleCount: 2,
      applicability: ["Pull request", "Project"],
      triggerLabels: ["Manual", "Pull request", "Project", "Scheduled"],
    });
    expect(result.parameters).toEqual([
      expect.objectContaining({ id: "day", kind: "date", defaultValue: "today" }),
      expect.objectContaining({
        id: "dimensions",
        kind: "select",
        allowMultiple: true,
        minItems: 1,
        maxItems: 1,
        defaultValue: ["correctness", "security"],
        options: ["correctness", "security"],
        description: "Review focus. Choose exactly 1.",
      }),
    ]);
  });

  it("presents an enabled weekday schedule without inventing run success", () => {
    const schedule = {
      schedule_id: "schedule-1",
      routine_id: "pull-request-review",
      routine_version: 3,
      project_id: "project-1",
      name: "Weekday review",
      hour: 9,
      minute: 5,
      weekdays: [0, 1, 2, 3, 4],
      timezone: "Europe/London",
      enabled: true,
      last_fired_date: "",
    } as unknown as JarvisRoutineSchedule;

    expect(runtimeScheduleToPresentation(schedule)).toMatchObject({
      id: "schedule-1",
      routineId: "pull-request-review",
      trigger: "Weekdays at 09:05",
      lastRun: "Never",
      health: "healthy",
      source: "runtime",
    });
  });

  it("treats a zero maximum as unbounded and spaces cardinality guidance", () => {
    const routine = {
      routine_id: "system-health-check",
      version: 1,
      name: "System health check",
      summary: "Check worker health.",
      description: "Check worker health.",
      builtin: true,
      target_types: ["worker_fleet"],
      execution: {
        chat_type: "orchestrator",
        default_engine: "codex",
        supported_engines: ["codex"],
      },
      parameters: [
        {
          name: "checks",
          label: "Checks",
          description: "Signals to inspect.",
          type: "enum",
          required: false,
          default: null,
          options_source: "",
          allow_multiple: true,
          sensitive: false,
          choices: ["availability", "capacity"],
          min_items: 1,
          max_items: 0,
        },
      ],
    } as unknown as JarvisRoutine;

    expect(runtimeRoutineToDefinition(routine, 0).parameters[0]).not.toHaveProperty("maxItems");
    expect(runtimeRoutineToDefinition(routine, 0).parameters[0]).toMatchObject({
      minItems: 1,
      description: "Signals to inspect. Choose at least 1.",
    });
  });

  it("only enables compatibility mode for an unavailable API", () => {
    expect(isRoutineApiUnavailable("Unknown RPC method jarvis.routines")).toBe(true);
    expect(isRoutineApiUnavailable("HTTP 501: not implemented")).toBe(true);
    expect(isRoutineApiUnavailable("Jarvis returned malformed routine data")).toBe(false);
  });
});
