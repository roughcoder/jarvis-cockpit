import { Link } from "@tanstack/react-router";
import { EnvironmentId, JarvisProjectId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn, randomUUID } from "../../lib/utils";
import { isJarvisCockpitEnvironment } from "../../jarvisCockpit";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { RoutineIcon } from "./RoutineIcon";
import { RoutineEnvironmentSelect } from "./RoutineEnvironmentSelect";
import { RoutinePageTitlebar } from "./RoutinePageTitlebar";
import { RoutineRunDialog } from "./RoutineRunDialog";
import { resolveRoutineEnvironment } from "./routineEnvironment";
import {
  routineCatalogAdapter,
  type RoutineDefinition,
  type RoutineRunInput,
} from "./routineCatalog";
import { isRoutineApiUnavailable, runtimeRoutineToDefinition } from "./routineRuntimePresentation";

const compatibilitySnapshot = routineCatalogAdapter.getSnapshot();

export function RoutinesPage() {
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
  const routinesQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisRoutines({ environmentId: environment.environmentId, input: {} }),
  );
  const schedulesQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisRoutineSchedules({
          environmentId: environment.environmentId,
          input: {},
        }),
  );
  const projectsQuery = useEnvironmentQuery(
    environment === null
      ? null
      : serverEnvironment.jarvisProjects({
          environmentId: environment.environmentId,
          input: { includeArchived: false },
        }),
  );
  const runJarvisRoutine = useAtomCommand(serverEnvironment.runJarvisRoutine, {
    reportFailure: false,
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeRoutine, setActiveRoutine] = useState<RoutineDefinition | null>(null);
  const routineFailure =
    routinesQuery.error ??
    (routinesQuery.data?.ok === false
      ? (routinesQuery.data.error?.message ?? "Jarvis did not return routines.")
      : null);
  const compatibilityMode = isRoutineApiUnavailable(routineFailure);
  const runtimeConnected = routinesQuery.data?.ok === true;
  const runtimeSchedules =
    schedulesQuery.data?.ok === true ? (schedulesQuery.data.schedules ?? []) : [];
  const scheduleCountByRoutineId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const schedule of runtimeSchedules) {
      counts.set(schedule.routine_id, (counts.get(schedule.routine_id) ?? 0) + 1);
    }
    return counts;
  }, [runtimeSchedules]);
  const availableRoutines = useMemo(
    () =>
      runtimeConnected
        ? (routinesQuery.data?.routines ?? []).map((routine) =>
            runtimeRoutineToDefinition(
              routine,
              scheduleCountByRoutineId.get(routine.routine_id) ?? 0,
            ),
          )
        : compatibilityMode
          ? compatibilitySnapshot.routines
          : [],
    [compatibilityMode, routinesQuery.data, runtimeConnected, scheduleCountByRoutineId],
  );
  const projects = useMemo(
    () => (projectsQuery.data?.ok === true ? (projectsQuery.data.projects ?? []) : []),
    [projectsQuery.data],
  );

  useEffect(() => {
    if (
      selectedProjectId !== null &&
      projects.some((project) => project.id === selectedProjectId)
    ) {
      return;
    }
    setSelectedProjectId(projects[0]?.id ?? null);
  }, [projects, selectedProjectId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const routines = useMemo(
    () =>
      normalizedQuery.length === 0
        ? availableRoutines
        : availableRoutines.filter((routine) =>
            [
              routine.name,
              routine.description,
              routine.category,
              ...routine.applicability,
              ...routine.triggerLabels,
            ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
          ),
    [availableRoutines, normalizedQuery],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedRepository =
    selectedProject?.repos.find((repository) => repository.default)?.name ??
    selectedProject?.repos[0]?.name ??
    null;

  const runRoutine = async (
    routine: RoutineDefinition,
    parameterValues: RoutineRunInput["parameterValues"],
  ) => {
    if (routine.source !== "runtime" || environment === null) {
      throw new Error(
        "This is a compatibility preview. Upgrade the connected Jarvis runtime before running it.",
      );
    }
    if (selectedProjectId === null) {
      throw new Error("Choose a Jarvis project before running this routine.");
    }
    const started = await runJarvisRoutine({
      environmentId: environment.environmentId,
      input: {
        routineId: routine.id,
        input: {
          ...(routine.version === undefined ? {} : { routine_version: routine.version }),
          project_id: JarvisProjectId.make(selectedProjectId),
          params: parameterValues,
          idempotency_key: `cockpit-routine:${routine.id}:${randomUUID()}`,
        },
      },
    });
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
        description: `Run ${started.value.run.run_id} is ${started.value.run.status}.`,
      }),
    );
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <RoutinePageTitlebar title="Routines" />

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-7 sm:pt-11 lg:px-10 lg:pb-24">
            <header className="grid items-end gap-7 border-b border-border/65 pb-8 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reusable processes
                </p>
                <h1 className="mt-3 max-w-[24ch] text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  Build once. Run whenever the work needs it.
                </h1>
                <p className="mt-4 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-lg/7">
                  Routines package prompts, models, tools, and typed inputs into a process Jarvis
                  can run now, from a conversation, against a pull request, or on a schedule.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {environment !== null ? (
                  <RoutineEnvironmentSelect
                    environments={routineEnvironments}
                    value={environment.environmentId}
                    onChange={(environmentId) => {
                      setSelectedEnvironmentId(environmentId);
                      setActiveRoutine(null);
                      setSelectedProjectId(null);
                    }}
                  />
                ) : null}
                <Button render={<Link to="/scheduled" />} size="lg" variant="outline">
                  <CalendarClockIcon className="size-4" />
                  View scheduled
                </Button>
                <Button render={<a href="#routine-library" />} size="lg">
                  <SparklesIcon className="size-4" />
                  Browse routines
                </Button>
              </div>
            </header>

            <RuntimeSourceNotice
              compatibilityMode={compatibilityMode}
              environmentLabel={environment?.label ?? null}
              failure={routineFailure}
              isPending={routinesQuery.isPending && routinesQuery.data === null}
              runtimeConnected={runtimeConnected}
            />

            <section
              className="grid border-b border-border/65 py-6 sm:grid-cols-3"
              aria-label="Routine capabilities"
            >
              <Capability
                title="Typed inputs"
                description="Dates, models, repositories, pull requests, choices, and free-form context."
              />
              <Capability
                title="Context aware"
                description="Launchers can prefill and lock values from the current project or conversation."
                divided
              />
              <Capability
                title="Many triggers"
                description="Play manually today; connect the same definition to contextual actions or schedules."
                divided
              />
            </section>

            <section
              id="routine-library"
              className="pt-9"
              aria-labelledby="routine-library-heading"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Library
                  </p>
                  <h2
                    id="routine-library-heading"
                    className="mt-2 text-balance text-2xl font-semibold tracking-tight"
                  >
                    Ready to run
                  </h2>
                  <p className="mt-2 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
                    Built-in routines use the same contract as the custom routines you create.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {runtimeConnected && projects.length > 0 ? (
                    <div className="relative">
                      <label className="sr-only" htmlFor="routine-project">
                        Project for manual routine runs
                      </label>
                      <select
                        id="routine-project"
                        name="routine-project"
                        className="h-10 min-w-48 appearance-none rounded-lg border border-input bg-background px-3 pr-8 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24 sm:h-8 sm:text-sm"
                        value={selectedProjectId ?? ""}
                        onChange={(event) => setSelectedProjectId(event.target.value)}
                      >
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search routines"
                      className="pl-9"
                      name="routine-search"
                      placeholder="Search routines"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <Button
                    size="default"
                    variant="outline"
                    onClick={() =>
                      toastManager.add({
                        type: "info",
                        title: "Routine designer",
                        description:
                          "Custom definitions will use this same typed routine contract when create transport lands.",
                      })
                    }
                  >
                    <PlusIcon className="size-4" />
                    New routine
                  </Button>
                </div>
              </div>

              {routines.length > 0 ? (
                <div className="@container mt-5">
                  <div className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 @3xl:grid-cols-2">
                    {routines.map((routine) => (
                      <RoutineCard
                        key={routine.id}
                        routine={routine}
                        onPlay={() => setActiveRoutine(routine)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/12 px-5 py-16 text-center">
                  <SlidersHorizontalIcon className="mx-auto size-4 text-muted-foreground" />
                  <h3 className="mt-4 font-medium">No matching routines</h3>
                  <p className="mt-1 text-base/7 text-muted-foreground sm:text-sm/6">
                    Try a process, trigger, or context such as pull request, project, or scheduled.
                  </p>
                </div>
              )}
            </section>

            <section className="mt-10 flex flex-col gap-4 border-t border-border/65 pt-7 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CircleHelpIcon className="size-4 h-lh shrink-0 text-muted-foreground" />
                <div>
                  <h2 className="font-medium">Routines and schedules stay separate</h2>
                  <p className="mt-1 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
                    A routine defines what Jarvis does. A schedule is one way to decide when that
                    routine runs.
                  </p>
                </div>
              </div>
              <Button render={<Link to="/scheduled" />} size="sm" variant="ghost">
                Open scheduled work
                <ArrowRightIcon className="size-4" />
              </Button>
            </section>
          </div>
        </main>
      </div>

      <RoutineRunDialog
        context={
          selectedProject === null
            ? null
            : {
                kind: "project",
                label: selectedProject.name,
                ...(selectedRepository === null
                  ? {}
                  : {
                      parameterValues: { repository: selectedRepository },
                      lockedParameterIds: ["repository"],
                    }),
              }
        }
        open={activeRoutine !== null}
        routine={activeRoutine}
        onOpenChange={(open) => {
          if (!open) setActiveRoutine(null);
        }}
        onRun={runRoutine}
      />
    </SidebarInset>
  );
}

function RuntimeSourceNotice({
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
        Runtime catalog connected{environmentLabel ? ` · ${environmentLabel}` : ""}.
      </div>
    );
  }
  if (compatibilityMode) {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-3 text-base/6 text-amber-800 sm:text-sm/5 dark:text-amber-300">
        Compatibility preview. This Jarvis runtime does not expose routines yet, so the library
        below is illustrative and cannot be run.
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="border-b border-border/65 py-3 text-base/6 text-muted-foreground sm:text-sm/5">
        Loading the Jarvis routine catalog…
      </div>
    );
  }
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 px-3 py-3 text-base/6 text-destructive sm:text-sm/5">
      Routines are unavailable
      {failure ? `: ${failure}` : ". Connect a Jarvis environment to continue."}
    </div>
  );
}

function Capability({
  title,
  description,
  divided = false,
}: {
  readonly description: string;
  readonly divided?: boolean;
  readonly title: string;
}) {
  return (
    <div
      className={cn(
        "py-3 sm:py-0",
        divided && "border-t border-border/60 sm:border-t-0 sm:border-l sm:pl-6",
      )}
    >
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 max-w-[44ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
        {description}
      </p>
    </div>
  );
}

function RoutineCard({
  routine,
  onPlay,
}: {
  readonly onPlay: () => void;
  readonly routine: RoutineDefinition;
}) {
  return (
    <article className="flex min-w-0 flex-col bg-background p-5 sm:p-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <RoutineIcon name={routine.icon} className="size-4 h-lh shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {routine.category}
            </p>
            <h3 className="mt-1 text-balance text-lg font-semibold">{routine.name}</h3>
          </div>
        </div>
        <Button
          aria-label={`Run ${routine.name}`}
          size="icon-sm"
          variant="outline"
          onClick={onPlay}
        >
          <PlayIcon className="size-4" />
        </Button>
      </div>

      <p className="mt-4 max-w-[64ch] text-pretty text-base/7 text-muted-foreground sm:text-sm/6">
        {routine.description}
      </p>

      <dl className="mt-5 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-foreground sm:text-xs">Works with</dt>
          <dd className="mt-1 text-base/6 text-muted-foreground sm:text-sm/5">
            {routine.applicability.join(" · ")}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-foreground sm:text-xs">Can start from</dt>
          <dd className="mt-1 text-base/6 text-muted-foreground sm:text-sm/5">
            {routine.triggerLabels.join(" · ")}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-1.5" aria-label={`${routine.name} inputs`}>
        {routine.parameters.map((parameter) => (
          <span
            key={parameter.id}
            className="rounded-md border border-border/65 bg-muted/18 px-2 py-1 text-sm text-muted-foreground sm:text-xs"
          >
            {parameter.label}
            {parameter.defaultValue !== undefined
              ? " · default"
              : parameter.required
                ? " · required"
                : ""}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <p className="text-sm text-muted-foreground sm:text-xs">
          {routine.scheduleCount > 0
            ? `${routine.scheduleCount} active ${routine.scheduleCount === 1 ? "schedule" : "schedules"}`
            : "No schedules"}
        </p>
        <Button size="sm" variant="ghost" onClick={onPlay}>
          Run routine
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </article>
  );
}
