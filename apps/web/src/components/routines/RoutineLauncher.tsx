import type { EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ChevronDownIcon, WorkflowIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { randomUUID } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Menu, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { RoutineIcon } from "./RoutineIcon";
import { RoutineRunDialog } from "./RoutineRunDialog";
import { buildContextualRoutineRunCommand } from "./RoutineLauncher.logic";
import {
  routinesForContext,
  type RoutineDefinition,
  type RoutineLaunchContext,
  type RoutineParameterValue,
} from "./routineCatalog";
import { runtimeRoutineToDefinition } from "./routineRuntimePresentation";

export function RoutineLauncherControl({
  context,
  environmentId,
  projectId,
  showLabel = false,
}: {
  readonly context: RoutineLaunchContext;
  readonly environmentId: EnvironmentId;
  readonly projectId: string | null;
  readonly showLabel?: boolean;
}) {
  const [selectedRoutine, setSelectedRoutine] = useState<RoutineDefinition | null>(null);
  const routinesQuery = useEnvironmentQuery(
    serverEnvironment.jarvisRoutines({ environmentId, input: {} }),
  );
  const runJarvisRoutine = useAtomCommand(serverEnvironment.runJarvisRoutine, {
    reportFailure: false,
  });
  const routines = useMemo(
    () =>
      projectId === null || routinesQuery.data?.ok !== true
        ? []
        : routinesForContext(
            (routinesQuery.data.routines ?? []).map((routine) =>
              runtimeRoutineToDefinition(routine, 0),
            ),
            context,
          ),
    [context, projectId, routinesQuery.data],
  );

  const runRoutine = async (
    routine: RoutineDefinition,
    parameterValues: Readonly<Record<string, RoutineParameterValue>>,
  ) => {
    if (projectId === null) {
      throw new Error("This conversation is not attached to a Jarvis project.");
    }
    const started = await runJarvisRoutine(
      buildContextualRoutineRunCommand({
        environmentId,
        projectId,
        routine,
        parameterValues,
        idempotencyKey: `cockpit-contextual-routine:${routine.id}:${randomUUID()}`,
      }),
    );
    if (started._tag === "Failure") {
      if (isAtomCommandInterrupted(started)) throw new Error("Routine launch was interrupted.");
      const failure = squashAtomCommandFailure(started);
      throw new Error(
        failure instanceof Error ? failure.message : "Jarvis could not start the routine.",
      );
    }
    if (started.value.ok !== true || !started.value.run) {
      throw new Error(started.value.error?.message ?? "Jarvis could not start the routine.");
    }
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `${routine.name} started`,
        description: `Run ${started.value.run.run_id} started with context from ${context.label}.`,
      }),
    );
  };

  return (
    <>
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                disabled={routines.length === 0}
                render={
                  <Button
                    aria-label="Run routine"
                    size={showLabel ? "xs" : "icon-xs"}
                    variant="outline"
                  />
                }
              />
            }
          >
            <WorkflowIcon className="size-3.5" />
            {showLabel ? <span>Run routine</span> : null}
            {showLabel ? <ChevronDownIcon className="size-3.5" /> : null}
          </TooltipTrigger>
          <TooltipPopup side="bottom">Run a routine with this conversation</TooltipPopup>
        </Tooltip>

        <MenuPopup align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <MenuGroupLabel className="truncate">Routines for {context.label}</MenuGroupLabel>
          {routines.map((routine) => (
            <MenuItem
              key={routine.id}
              className="items-start py-2"
              onClick={() => setSelectedRoutine(routine)}
            >
              <RoutineIcon name={routine.icon} className="size-4 h-lh shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium">{routine.name}</p>
                <p className="mt-0.5 line-clamp-2 text-sm/5 text-muted-foreground sm:text-xs/4">
                  {routine.description}
                </p>
              </div>
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>

      <RoutineRunDialog
        context={context}
        open={selectedRoutine !== null}
        routine={selectedRoutine}
        onOpenChange={(open) => {
          if (!open) setSelectedRoutine(null);
        }}
        onRun={runRoutine}
      />
    </>
  );
}
