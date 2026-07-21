import { CalendarClockIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RoutineIcon } from "./RoutineIcon";
import { RoutineRunDialog } from "./RoutineRunDialog";
import {
  completeRoutineScheduleCreation,
  moveRoutineScheduleCreateFlow,
  scheduleDetailsErrors,
  type RoutineScheduleCreateFlowState,
  type ScheduleCadence,
  type ScheduleDetails,
} from "./RoutineScheduleCreate.logic";
import type {
  RoutineDefinition,
  RoutineLaunchContext,
  RoutineParameterValue,
} from "./routineCatalog";

interface ScheduleProject {
  readonly id: string;
  readonly name: string;
  readonly repos: ReadonlyArray<{ readonly default?: boolean; readonly name: string }>;
}

interface RoutineScheduleCreateFlowProps {
  readonly onCreate: (
    routine: RoutineDefinition,
    details: ScheduleDetails,
    parameterValues: Readonly<Record<string, RoutineParameterValue>>,
  ) => Promise<void>;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly projects: ReadonlyArray<ScheduleProject>;
  readonly routines: ReadonlyArray<RoutineDefinition>;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SELECT_CLASS =
  "h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24 sm:h-8 sm:text-sm";

export function RoutineScheduleCreateFlow({
  open,
  routines,
  projects,
  onOpenChange,
  onCreate,
}: RoutineScheduleCreateFlowProps) {
  const [flow, setFlow] = useState<RoutineScheduleCreateFlowState>(() => ({
    phase: "details",
    details: initialDetails(routines[0] ?? null, projects[0] ?? null),
  }));
  const [showErrors, setShowErrors] = useState(false);
  const wasOpen = useRef(false);
  const { phase, details } = flow;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setFlow({
        phase: "details",
        details: initialDetails(routines[0] ?? null, projects[0] ?? null),
      });
      setShowErrors(false);
    }
    wasOpen.current = open;
  }, [open, projects, routines]);

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === details.routineId) ?? null,
    [details.routineId, routines],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === details.projectId) ?? null,
    [details.projectId, projects],
  );
  const errors = scheduleDetailsErrors(details);
  const context = scheduleProjectContext(selectedProject);

  const continueToParameters = () => {
    if (errors.length > 0 || selectedRoutine === null) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setFlow((current) => moveRoutineScheduleCreateFlow(current, "parameters"));
  };

  const updateDetails = (update: (current: ScheduleDetails) => ScheduleDetails) => {
    setFlow((current) => ({ ...current, details: update(current.details) }));
  };

  return (
    <>
      {phase === "details" ? (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onOpenChange(false);
          }}
        >
          <DialogPopup className="max-w-2xl">
            <DialogHeader className="gap-3 pr-14">
              <div className="flex items-start gap-3">
                <CalendarClockIcon className="size-4 h-lh shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <DialogTitle className="text-balance">Create a schedule</DialogTitle>
                  <DialogDescription className="mt-2 max-w-[62ch] text-pretty text-base/6 sm:text-sm/5">
                    Choose the reusable routine first, then bind it to a project and a predictable
                    trigger. The routine remains the source of truth for the process.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <DialogPanel className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="schedule-routine"
                  label="Routine"
                  value={details.routineId}
                  disabled={routines.length === 0}
                  onChange={(routineId) => {
                    const routine =
                      routines.find((candidate) => candidate.id === routineId) ?? null;
                    updateDetails((current) => ({
                      ...current,
                      routineId,
                      name: routine === null ? current.name : `${routine.name} schedule`,
                    }));
                  }}
                >
                  {routines.map((routine) => (
                    <option key={routine.id} value={routine.id}>
                      {routine.name}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="schedule-project"
                  label="Project context"
                  value={details.projectId}
                  disabled={projects.length === 0}
                  onChange={(projectId) => updateDetails((current) => ({ ...current, projectId }))}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="schedule-name">Schedule name</Label>
                <Input
                  id="schedule-name"
                  name="scheduleName"
                  value={details.name}
                  onChange={(event) =>
                    updateDetails((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField
                  id="schedule-cadence"
                  label="Cadence"
                  value={details.cadence}
                  onChange={(cadence) =>
                    updateDetails((current) => ({
                      ...current,
                      cadence: cadence as ScheduleCadence,
                    }))
                  }
                >
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="custom">Custom days</option>
                </SelectField>

                <div className="grid gap-2">
                  <Label htmlFor="schedule-time">Time</Label>
                  <Input
                    id="schedule-time"
                    name="scheduleTime"
                    type="time"
                    value={details.time}
                    onChange={(event) =>
                      updateDetails((current) => ({ ...current, time: event.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="schedule-timezone">Timezone</Label>
                  <Input
                    id="schedule-timezone"
                    name="scheduleTimezone"
                    list="schedule-timezones"
                    value={details.timezone}
                    placeholder="Europe/London"
                    onChange={(event) =>
                      updateDetails((current) => ({ ...current, timezone: event.target.value }))
                    }
                  />
                  <datalist id="schedule-timezones">
                    <option value="Europe/London" />
                    <option value="America/New_York" />
                    <option value="America/Los_Angeles" />
                    <option value="Asia/Singapore" />
                    <option value="Australia/Sydney" />
                    <option value="UTC" />
                  </datalist>
                </div>
              </div>

              {details.cadence === "custom" ? (
                <fieldset className="grid gap-2">
                  <legend className="text-base font-medium sm:text-sm">Days</legend>
                  <div className="flex flex-wrap gap-3">
                    {WEEKDAYS.map((label, weekday) => (
                      <label key={label} className="flex items-center gap-2 text-base sm:text-sm">
                        <input
                          name="scheduleWeekday"
                          type="checkbox"
                          checked={details.customWeekdays.includes(weekday)}
                          className="size-5 rounded border-border accent-foreground sm:size-4"
                          onChange={(event) =>
                            updateDetails((current) => ({
                              ...current,
                              customWeekdays: event.target.checked
                                ? [...current.customWeekdays, weekday]
                                : current.customWeekdays.filter((value) => value !== weekday),
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {selectedRoutine !== null ? (
                <div className="flex items-start gap-3 border-t border-border/65 pt-4">
                  <RoutineIcon
                    name={selectedRoutine.icon}
                    className="size-4 h-lh shrink-0 text-muted-foreground"
                  />
                  <p className="max-w-[62ch] text-pretty text-base/6 text-muted-foreground sm:text-sm/5">
                    Next, confirm the saved inputs defined by {selectedRoutine.name}.
                  </p>
                </div>
              ) : null}

              {showErrors && errors.length > 0 ? (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-base/6 text-destructive sm:text-sm/5"
                >
                  {errors[0]}
                </div>
              ) : null}
            </DialogPanel>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={routines.length === 0} onClick={continueToParameters}>
                Continue to inputs
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      ) : (
        <RoutineRunDialog
          cancelLabel="Back"
          closeAfterSubmit={false}
          context={context}
          open={open}
          purpose="schedule"
          routine={selectedRoutine}
          onCancel={() => setFlow((current) => moveRoutineScheduleCreateFlow(current, "details"))}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onOpenChange(false);
          }}
          onRun={async (routine, parameterValues) => {
            await completeRoutineScheduleCreation({
              routine,
              details,
              parameterValues,
              onCreate,
              onOpenChange,
            });
          }}
        />
      )}
    </>
  );
}

function SelectField({
  id,
  label,
  value,
  disabled = false,
  children,
  onChange,
}: {
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          name={id}
          className={cn(SELECT_CLASS, disabled && "cursor-not-allowed opacity-55")}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function initialDetails(
  routine: RoutineDefinition | null,
  project: ScheduleProject | null,
): ScheduleDetails {
  return {
    routineId: routine?.id ?? "",
    projectId: project?.id ?? "",
    name: routine === null ? "" : `${routine.name} schedule`,
    cadence: "weekdays",
    customWeekdays: [0, 1, 2, 3, 4],
    time: "09:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
  };
}

function scheduleProjectContext(project: ScheduleProject | null): RoutineLaunchContext | null {
  if (project === null) return null;
  const repository =
    project.repos.find((candidate) => candidate.default)?.name ?? project.repos[0]?.name ?? null;
  return {
    kind: "project",
    label: project.name,
    parameterValues: {
      scope: "Current project",
      ...(repository === null ? {} : { repository }),
    },
    lockedParameterIds: ["scope", ...(repository === null ? [] : ["repository"])],
  };
}
