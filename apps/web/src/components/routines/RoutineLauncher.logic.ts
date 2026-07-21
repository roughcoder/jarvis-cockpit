import { JarvisProjectId, type EnvironmentId } from "@t3tools/contracts";

import type {
  RoutineDefinition,
  RoutineLaunchContext,
  RoutineParameterValue,
} from "./routineCatalog";

export function buildConversationRoutineContext(input: {
  readonly conversationTitle: string;
  readonly projectName?: string | null;
}): RoutineLaunchContext {
  const projectName = input.projectName?.trim();
  if (projectName) {
    return {
      kind: "project",
      label: `${projectName} · ${input.conversationTitle}`,
      parameterValues: {
        repository: "Current project repository",
        scope: "Current project",
      },
      lockedParameterIds: ["repository", "scope"],
    };
  }

  return {
    kind: "conversation",
    label: input.conversationTitle,
  };
}

export function buildContextualRoutineRunCommand(input: {
  readonly environmentId: EnvironmentId;
  readonly idempotencyKey: string;
  readonly parameterValues: Readonly<Record<string, RoutineParameterValue>>;
  readonly projectId: string;
  readonly routine: RoutineDefinition;
}) {
  return {
    environmentId: input.environmentId,
    input: {
      routineId: input.routine.id,
      input: {
        ...(input.routine.version === undefined ? {} : { routine_version: input.routine.version }),
        project_id: JarvisProjectId.make(input.projectId),
        params: input.parameterValues,
        idempotency_key: input.idempotencyKey,
      },
    },
  };
}
