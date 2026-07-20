import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildContextualRoutineRunCommand,
  buildConversationRoutineContext,
} from "./RoutineLauncher.logic";

describe("buildConversationRoutineContext", () => {
  it("prefills and locks project-scoped routine inputs", () => {
    expect(
      buildConversationRoutineContext({
        conversationTitle: "Review the scheduler",
        projectName: "Jarvis",
      }),
    ).toEqual({
      kind: "project",
      label: "Jarvis · Review the scheduler",
      parameterValues: {
        repository: "Current project repository",
        scope: "Current project",
      },
      lockedParameterIds: ["repository", "scope"],
    });
  });

  it("uses conversation applicability when no project is active", () => {
    expect(
      buildConversationRoutineContext({
        conversationTitle: "Untitled task",
      }),
    ).toEqual({
      kind: "conversation",
      label: "Untitled task",
    });
  });

  it("keeps contextual launches scoped to their Jarvis environment and project", () => {
    expect(
      buildContextualRoutineRunCommand({
        environmentId: EnvironmentId.make("environment-jarvis"),
        projectId: "project-42",
        idempotencyKey: "contextual-run-1",
        parameterValues: { day: "2026-07-20" },
        routine: {
          id: "morning-brief",
          version: 3,
          name: "Morning brief",
          category: "Planning",
          description: "Summarize current work.",
          icon: "brief",
          applicability: ["Any conversation"],
          triggerLabels: ["Conversation"],
          scheduleCount: 0,
          source: "runtime",
          parameters: [],
        },
      }),
    ).toEqual({
      environmentId: "environment-jarvis",
      input: {
        routineId: "morning-brief",
        input: {
          routine_version: 3,
          project_id: "project-42",
          params: { day: "2026-07-20" },
          idempotency_key: "contextual-run-1",
        },
      },
    });
  });
});
