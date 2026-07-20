import { describe, expect, it } from "vite-plus/test";

import {
  defaultParameterValue,
  initialRoutineParameterValues,
  missingRequiredParameterIds,
  routineSubmissionParameterValues,
  routineCatalogAdapter,
  routinesForContext,
  toggleRoutineParameterOption,
  type RoutineLaunchContext,
} from "./routineCatalog";

describe("routine catalog", () => {
  it("resolves relative date defaults when a run starts", () => {
    expect(
      defaultParameterValue(
        {
          id: "day",
          label: "Day",
          kind: "date",
          required: true,
          description: "Working day",
          defaultValue: "today",
        },
        new Date(2026, 6, 20),
      ),
    ).toBe("2026-07-20");
  });

  it("filters the library to routines that accept a launcher context", () => {
    const context: RoutineLaunchContext = {
      kind: "pull-request",
      label: "roughcoder/jarvis#123",
    };
    const routines = routinesForContext(routineCatalogAdapter.getSnapshot().routines, context);

    expect(routines.map((routine) => routine.id)).toEqual(["pull-request-review"]);
  });

  it("prefills and locks contextual parameters without changing the routine definition", () => {
    const routine = routineCatalogAdapter
      .getSnapshot()
      .routines.find((candidate) => candidate.id === "pull-request-review");
    expect(routine).toBeDefined();

    const values = initialRoutineParameterValues(routine!, new Date(2026, 6, 20), {
      kind: "pull-request",
      label: "roughcoder/jarvis#42",
      parameterValues: { pullRequest: "roughcoder/jarvis#42" },
      lockedParameterIds: ["pullRequest"],
    });

    expect(values.pullRequest).toBe("roughcoder/jarvis#42");
    expect(missingRequiredParameterIds(routine!, values)).toEqual([]);
  });

  it("filters undeclared context while preserving declared locked parameters", () => {
    const morningBrief = routineCatalogAdapter
      .getSnapshot()
      .routines.find((candidate) => candidate.id === "morning-brief");
    const issueTriage = routineCatalogAdapter
      .getSnapshot()
      .routines.find((candidate) => candidate.id === "issue-triage");
    expect(morningBrief).toBeDefined();
    expect(issueTriage).toBeDefined();

    const projectContext: RoutineLaunchContext = {
      kind: "project",
      label: "Jarvis",
      parameterValues: {
        repository: "roughcoder/jarvis",
        scope: "Current project",
      },
      lockedParameterIds: ["repository", "scope"],
    };
    const morningBriefValues = initialRoutineParameterValues(
      morningBrief!,
      new Date(2026, 6, 20),
      projectContext,
    );
    const issueTriageValues = initialRoutineParameterValues(
      issueTriage!,
      new Date(2026, 6, 20),
      projectContext,
    );

    expect(routineSubmissionParameterValues(morningBrief!, morningBriefValues)).toEqual({
      day: "2026-07-20",
      scope: "Current project",
    });
    expect(routineSubmissionParameterValues(issueTriage!, issueTriageValues)).toEqual({
      repository: "roughcoder/jarvis",
      since: "2026-07-20",
    });
  });

  it("reports unresolved required inputs before a manual run", () => {
    const routine = routineCatalogAdapter
      .getSnapshot()
      .routines.find((candidate) => candidate.id === "release-readiness");
    expect(routine).toBeDefined();

    const values = initialRoutineParameterValues(routine!, new Date(2026, 6, 20));
    expect(missingRequiredParameterIds(routine!, values)).toEqual(["target"]);
  });

  it("preserves array-valued enum selections for runtime submission", () => {
    const routine = {
      id: "system-health-check",
      name: "System health check",
      category: "Operations",
      description: "Check the fleet.",
      icon: "health",
      applicability: ["Worker fleet"],
      triggerLabels: ["Manual"],
      scheduleCount: 0,
      source: "runtime",
      parameters: [
        {
          id: "checks",
          label: "Checks",
          kind: "select",
          required: true,
          allowMultiple: true,
          description: "Health signals to include.",
          options: ["availability", "sessions", "recent_failures"],
          defaultValue: ["availability", "sessions"],
        },
      ],
    } as const;

    const selected = toggleRoutineParameterOption(
      initialRoutineParameterValues(routine).checks!,
      "recent_failures",
      true,
    );

    expect(selected).toEqual(["availability", "sessions", "recent_failures"]);
    expect(routineSubmissionParameterValues(routine, { checks: selected })).toEqual({
      checks: ["availability", "sessions", "recent_failures"],
    });
    expect(missingRequiredParameterIds(routine, { checks: [] })).toEqual(["checks"]);
  });

  it("enforces runtime cardinality for multi-value parameters", () => {
    const routine = {
      id: "pull-request-review",
      name: "Pull request review",
      category: "Engineering",
      description: "Review a pull request.",
      icon: "pull-request",
      applicability: ["Pull request"],
      triggerLabels: ["Manual"],
      scheduleCount: 0,
      source: "runtime",
      parameters: [
        {
          id: "reviewers",
          label: "Reviewers",
          kind: "model",
          required: true,
          allowMultiple: true,
          minItems: 2,
          maxItems: 2,
          description: "Choose exactly two reviewers.",
        },
      ],
    } as const;

    expect(missingRequiredParameterIds(routine, { reviewers: ["Claude"] })).toEqual(["reviewers"]);
    expect(missingRequiredParameterIds(routine, { reviewers: ["Claude", "Codex"] })).toEqual([]);
    expect(
      missingRequiredParameterIds(routine, {
        reviewers: ["Claude", "Codex", "Gemini"],
      }),
    ).toEqual(["reviewers"]);
  });
});
