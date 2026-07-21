import { Link } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  LoaderCircleIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { isJarvisCockpitEnvironment } from "../../jarvisCockpit";
import { randomUUID } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { RoutineIcon } from "./RoutineIcon";
import { RoutineEnvironmentSelect } from "./RoutineEnvironmentSelect";
import { RoutinePageTitlebar } from "./RoutinePageTitlebar";
import { RoutineScheduleCreateFlow } from "./RoutineScheduleCreateFlow";
import { scheduleRoutinePresentation } from "./ScheduledPage.logic";
import { resolveRoutineEnvironment } from "./routineEnvironment";
import {
  buildRoutineScheduleCreateInput,
  type ScheduleDetails,
} from "./RoutineScheduleCreate.logic";
import {
  routineCatalogAdapter,
  type RoutineDefinition,
  type RoutineParameterValue,
  type RoutineSchedule,
  type RoutineScheduleHealth,
} from "./routineCatalog";
import {
  isRoutineApiUnavailable,
  runtimeRoutineToDefinition,
  runtimeScheduleToPresentation,
} from "./routineRuntimePresentation";

const compatibilitySnapshot = routineCatalogAdapter.getSnapshot();
type ScheduleFilter = "all" | "attention" | "enabled";

export function ScheduledPage() {
  const { environments } = useEnvironments();
  const routineEnvironments = useMemo(
    () =>
      environments.filter((candidate) =>
        isJarvisCockpitEnvironment(candidate.serverConfig ?? undefined),
      ),
    [environments],
  );
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const environment = useMemo(
    () => resolveRoutineEnvironment(routineEnvironments, selectedEnvironmentId),
    [routineEnvironments, selectedEnvironmentId],
  );
  const schedulesQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisRoutineSchedules({
          environmentId: environment.environmentId,
          input: {},
        }),
  );
  const routinesQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisRoutines({ environmentId: environment.environmentId, input: {} }),
  );
  const projectsQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisProjects({
          environmentId: environment.environmentId,
          input: { includeArchived: false },
        }),
  );
  const createJarvisRoutineSchedule = useAtomCommand(
    serverEnvironment.createJarvisRoutineSchedule,
    { reportFailure: false },
  );
  const runJarvisRoutineSchedule = useAtomCommand(serverEnvironment.runJarvisRoutineSchedule, {
    reportFailure: false,
  });
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const [newScheduleOpen, setNewScheduleOpen] = useState(false);
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null);
  const scheduleFailure =
    schedulesQuery.error ??
    (schedulesQuery.data?.ok === false
      ? (schedulesQuery.data.error?.message ?? "Jarvis did not return schedules.")
      : null);
  const compatibilityMode = isRoutineApiUnavailable(scheduleFailure);
  const runtimeConnected = schedulesQuery.data?.ok === true;
  const schedules = useMemo(
    () =>
      runtimeConnected
        ? (schedulesQuery.data?.schedules ?? []).map(runtimeScheduleToPresentation)
        : compatibilityMode
          ? compatibilitySnapshot.schedules
          : [],
    [compatibilityMode, runtimeConnected, schedulesQuery.data],
  );
  const runtimeRoutines = useMemo(
    () =>
      (routinesQuery.data?.ok === true ? (routinesQuery.data.routines ?? []) : []).map((routine) =>
        runtimeRoutineToDefinition(routine, 0),
      ),
    [routinesQuery.data],
  );
  const runtimeRoutineById = useMemo(
    () => new Map(runtimeRoutines.map((routine) => [routine.id, routine] as const)),
    [runtimeRoutines],
  );
  const routineById = useMemo(
    () =>
      runtimeConnected
        ? runtimeRoutineById
        : new Map(compatibilitySnapshot.routines.map((routine) => [routine.id, routine] as const)),
    [runtimeConnected, runtimeRoutineById],
  );
  const projects = useMemo(
    () => (projectsQuery.data?.ok === true ? (projectsQuery.data.projects ?? []) : []),
    [projectsQuery.data],
  );
  const filteredSchedules = useMemo(() => {
    if (filter === "enabled") {
      return schedules.filter((schedule) => schedule.health !== "paused");
    }
    if (filter === "attention") {
      return schedules.filter((schedule) => schedule.health === "attention");
    }
    return schedules;
  }, [filter, schedules]);
  const enabledCount = schedules.filter((schedule) => schedule.health !== "paused").length;
  const attentionCount = schedules.filter((schedule) => schedule.health === "attention").length;
  const nextRunLabel =
    schedules.find((schedule) => schedule.health !== "paused")?.trigger ?? "None";

  const createSchedule = async (
    routine: RoutineDefinition,
    details: ScheduleDetails,
    parameterValues: Readonly<Record<string, RoutineParameterValue>>,
  ) => {
    if (environment === null || routine.source !== "runtime") {
      throw new Error("Upgrade the connected Jarvis runtime before creating a schedule.");
    }
    const created = await createJarvisRoutineSchedule({
      environmentId: environment.environmentId,
      input: {
        input: buildRoutineScheduleCreateInput({
          routine,
          name: details.name,
          projectId: details.projectId,
          time: details.time,
          timezone: details.timezone,
          cadence: details.cadence,
          customWeekdays: details.customWeekdays,
          parameterValues,
          idempotencyKey: `cockpit-schedule-create:${routine.id}:${randomUUID()}`,
        }),
      },
    });
    if (created._tag === "Failure") {
      if (isAtomCommandInterrupted(created)) throw new Error("Schedule creation was interrupted.");
      const failure = squashAtomCommandFailure(created);
      throw new Error(
        failure instanceof Error ? failure.message : "Jarvis could not create this schedule.",
      );
    }
    if (created.value.ok !== true || !created.value.schedule) {
      throw new Error(created.value.error?.message ?? "Jarvis could not create this schedule.");
    }
    schedulesQuery.refresh();
    routinesQuery.refresh();
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `${created.value.schedule.name} scheduled`,
        description: "The new trigger is now part of the scheduled work queue.",
      }),
    );
  };

  const runSchedule = async (schedule: RoutineSchedule) => {
    if (schedule.source !== "runtime" || environment === null) {
      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: "Compatibility preview only",
          description: "Upgrade the connected Jarvis runtime before running this schedule.",
        }),
      );
      return;
    }
    setRunningScheduleId(schedule.id);
    try {
      const started = await runJarvisRoutineSchedule({
        environmentId: environment.environmentId,
        input: {
          scheduleId: schedule.id,
          input: { idempotency_key: `cockpit-schedule:${schedule.id}:${randomUUID()}` },
        },
      });
      if (started._tag === "Failure") {
        if (isAtomCommandInterrupted(started)) return;
        const failure = squashAtomCommandFailure(started);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not run schedule",
            description:
              failure instanceof Error ? failure.message : "Jarvis did not start this schedule.",
          }),
        );
        return;
      }
      if (started.value.ok !== true || !started.value.run) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not run schedule",
            description: started.value.error?.message ?? "Jarvis did not start this schedule.",
          }),
        );
        return;
      }
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: `${schedule.name} started`,
          description: `Run ${started.value.run.run_id} is ${started.value.run.status}.`,
        }),
      );
    } finally {
      setRunningScheduleId(null);
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <RoutinePageTitlebar title="Scheduled" />

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-7 sm:pt-11 lg:px-10 lg:pb-24">
            <header className="flex flex-col gap-7 border-b border-border/65 pb-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Trigger layer
                </p>
                <h1 className="mt-3 max-w-[24ch] text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  Keep recurring work predictable.
                </h1>
                <p className="mt-4 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-lg/7">
                  Scheduled work binds a reusable routine to a time, context, and saved inputs. Run
                  anything early without changing its next trigger.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {environment !== null ? (
                  <RoutineEnvironmentSelect
                    environments={routineEnvironments}
                    value={environment.environmentId}
                    onChange={(environmentId) => {
                      setSelectedEnvironmentId(environmentId);
                      setNewScheduleOpen(false);
                    }}
                  />
                ) : null}
                <Button render={<Link to="/routines" />} size="lg" variant="outline">
                  Open routine library
                </Button>
                <Button
                  size="lg"
                  disabled={
                    !runtimeConnected || runtimeRoutines.length === 0 || projects.length === 0
                  }
                  onClick={() => setNewScheduleOpen(true)}
                >
                  <PlusIcon className="size-4" />
                  New schedule
                </Button>
              </div>
            </header>

            <ScheduledRuntimeNotice
              compatibilityMode={compatibilityMode}
              environmentLabel={environment?.label ?? null}
              failure={scheduleFailure}
              isPending={schedulesQuery.isPending && schedulesQuery.data === null}
              runtimeConnected={runtimeConnected}
            />

            <section
              className="grid border-b border-border/65 sm:grid-cols-3"
              aria-label="Scheduled work summary"
            >
              <ScheduleMetric label="Enabled" value={String(enabledCount)} />
              <ScheduleMetric label="Needs attention" value={String(attentionCount)} divided />
              <ScheduleMetric label="Next trigger" value={nextRunLabel} divided />
            </section>

            <section className="pt-9" aria-labelledby="scheduled-work-heading">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Schedule queue
                  </p>
                  <h2
                    id="scheduled-work-heading"
                    className="mt-2 text-balance text-2xl font-semibold tracking-tight"
                  >
                    Upcoming triggers
                  </h2>
                  <p className="mt-2 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
                    Every row points to a routine and its saved execution context.
                  </p>
                </div>

                <div
                  className="flex gap-1 overflow-x-auto rounded-lg bg-muted/35 p-1"
                  aria-label="Filter schedules"
                >
                  {(["all", "enabled", "attention"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      className="h-8 shrink-0 rounded-md px-3 text-base font-medium capitalize text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs/5 sm:h-7 sm:text-sm"
                      onClick={() => setFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="@container mt-5 overflow-hidden rounded-2xl border border-border/70">
                <div className="hidden grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.9fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_7rem_auto] gap-4 border-b border-border/65 bg-muted/18 px-5 py-2.5 text-sm font-medium text-muted-foreground @5xl:grid sm:text-xs">
                  <p>Routine</p>
                  <p>Trigger</p>
                  <p>Next</p>
                  <p>Last</p>
                  <p>Health</p>
                  <span aria-hidden="true" />
                </div>

                {filteredSchedules.length > 0 ? (
                  <div className="divide-y divide-border/65">
                    {filteredSchedules.map((schedule) => {
                      const routine = routineById.get(schedule.routineId) ?? null;
                      const routinePresentation = scheduleRoutinePresentation(schedule, routine);
                      const isRunning = runningScheduleId === schedule.id;

                      return (
                        <article
                          key={schedule.id}
                          className="grid min-w-0 gap-5 px-4 py-5 @5xl:grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.9fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_7rem_auto] @5xl:items-center @5xl:gap-4 sm:px-5"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <RoutineIcon
                              name={routinePresentation.icon}
                              className="size-4 h-lh shrink-0 text-muted-foreground"
                            />
                            <div className="min-w-0">
                              <h3 className="truncate font-medium">{schedule.name}</h3>
                              <p className="mt-1 truncate text-base/6 text-muted-foreground sm:text-sm/5">
                                {routinePresentation.name} · {schedule.context}
                              </p>
                            </div>
                          </div>

                          <ScheduleCell label="Trigger" value={schedule.trigger} />
                          <ScheduleCell label="Next" value={schedule.nextRun} tabular />
                          <ScheduleCell label="Last" value={schedule.lastRun} tabular />
                          <ScheduleHealth health={schedule.health} />

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRunning || schedule.source !== "runtime"}
                            onClick={() => runSchedule(schedule)}
                          >
                            {isRunning ? (
                              <LoaderCircleIcon className="size-4 animate-spin" />
                            ) : (
                              <PlayIcon className="size-4" />
                            )}
                            Run now
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-16 text-center">
                    <CircleCheckIcon className="mx-auto size-4 text-muted-foreground" />
                    <h3 className="mt-4 font-medium">Nothing in this view</h3>
                    <p className="mt-1 text-base/7 text-muted-foreground sm:text-sm/6">
                      Try another filter or create a schedule from the routine library.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 flex flex-col gap-4 border-t border-border/65 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CalendarClockIcon className="size-4 h-lh shrink-0 text-muted-foreground" />
                <div>
                  <h2 className="font-medium">Schedules do not duplicate the process</h2>
                  <p className="mt-1 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
                    Edit a routine once and every manual, contextual, and scheduled trigger keeps
                    using that definition.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  schedulesQuery.refresh();
                  routinesQuery.refresh();
                }}
              >
                <RefreshCwIcon className="size-4" />
                Refresh status
              </Button>
            </section>
          </div>
        </main>
      </div>

      <RoutineScheduleCreateFlow
        open={newScheduleOpen}
        projects={projects}
        routines={runtimeRoutines}
        onOpenChange={setNewScheduleOpen}
        onCreate={createSchedule}
      />
    </SidebarInset>
  );
}

function ScheduledRuntimeNotice({
  compatibilityMode,
  environmentLabel,
  failure,
  isPending,
  runtimeConnected,
}: {
  readonly compatibilityMode: boolean;
  readonly environmentLabel: string | null;
  readonly failure: string | null;
  readonly isPending: boolean;
  readonly runtimeConnected: boolean;
}) {
  if (runtimeConnected) {
    return (
      <div className="border-b border-border/65 py-3 text-base/6 text-muted-foreground sm:text-sm/5">
        Schedule service connected{environmentLabel ? ` · ${environmentLabel}` : ""}.
      </div>
    );
  }
  if (compatibilityMode) {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-3 text-base/6 text-amber-800 sm:text-sm/5 dark:text-amber-300">
        Compatibility preview. This Jarvis runtime does not expose schedules yet, so the rows below
        are illustrative and Run now is disabled.
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="border-b border-border/65 py-3 text-base/6 text-muted-foreground sm:text-sm/5">
        Loading scheduled work…
      </div>
    );
  }
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-3 text-base/6 text-destructive sm:text-sm/5">
      Scheduled work is unavailable
      {failure ? `: ${failure}` : ". Connect a Jarvis environment to continue."}
    </div>
  );
}

function ScheduleMetric({
  label,
  value,
  divided = false,
}: {
  readonly divided?: boolean;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      className={`${divided ? "border-t border-border/60 sm:border-t-0 sm:border-l sm:pl-6" : ""} py-5`}
    >
      <p className="truncate text-sm font-medium text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-1 truncate font-mono text-2xl font-medium tabular-nums">{value}</p>
    </div>
  );
}

function ScheduleCell({
  label,
  value,
  tabular = false,
}: {
  readonly label: string;
  readonly tabular?: boolean;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-muted-foreground @5xl:hidden sm:text-xs">{label}</p>
      <p
        className={`mt-1 truncate text-base/6 @5xl:mt-0 sm:text-sm/5 ${tabular ? "tabular-nums" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ScheduleHealth({ health }: { readonly health: RoutineScheduleHealth }) {
  const presentation = {
    attention: {
      icon: CircleAlertIcon,
      label: "Attention",
      className: "text-amber-600 dark:text-amber-400",
    },
    healthy: {
      icon: CircleCheckIcon,
      label: "Healthy",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    paused: { icon: CirclePauseIcon, label: "Paused", className: "text-muted-foreground" },
    running: {
      icon: LoaderCircleIcon,
      label: "Running",
      className: "text-blue-600 dark:text-blue-400",
    },
  }[health];
  const Icon = presentation.icon;

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground @5xl:hidden sm:text-xs">Health</p>
      <p
        className={`mt-1 flex items-center gap-1.5 text-base/6 @5xl:mt-0 sm:text-sm/5 ${presentation.className}`}
      >
        <Icon className={`size-4 shrink-0 ${health === "running" ? "animate-spin" : ""}`} />
        {presentation.label}
      </p>
    </div>
  );
}
