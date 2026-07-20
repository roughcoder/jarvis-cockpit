import { ChevronDownIcon, CircleHelpIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";
import {
  initialRoutineParameterValues,
  missingRequiredParameterIds,
  routineSubmissionParameterValues,
  toggleRoutineParameterOption,
  type RoutineLaunchContext,
  type RoutineDefinition,
  type RoutineParameterDefinition,
  type RoutineParameterValue,
} from "./routineCatalog";
import { RoutineIcon } from "./RoutineIcon";

interface RoutineRunDialogProps {
  readonly cancelLabel?: string;
  readonly closeAfterSubmit?: boolean;
  readonly context?: RoutineLaunchContext | null;
  readonly onCancel?: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRun: (
    routine: RoutineDefinition,
    values: Readonly<Record<string, RoutineParameterValue>>,
  ) => Promise<void>;
  readonly open: boolean;
  readonly purpose?: "run" | "schedule";
  readonly routine: RoutineDefinition | null;
}

export function RoutineRunDialog({
  open,
  routine,
  purpose = "run",
  cancelLabel = "Cancel",
  closeAfterSubmit = true,
  context = null,
  onCancel,
  onOpenChange,
  onRun,
}: RoutineRunDialogProps) {
  const [values, setValues] = useState<Readonly<Record<string, RoutineParameterValue>>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (routine === null) {
      setValues({});
      setRunError(null);
      return;
    }
    setValues(initialRoutineParameterValues(routine, new Date(), context));
    setRunError(null);
  }, [context, routine]);

  const missingRequired = useMemo(
    () => (routine === null ? [] : missingRequiredParameterIds(routine, values)),
    [routine, values],
  );

  if (routine === null) return null;

  const setValue = (parameterId: string, value: RoutineParameterValue) => {
    setValues((current) => ({ ...current, [parameterId]: value }));
  };

  const submit = async () => {
    if (missingRequired.length > 0 || isRunning) return;
    setIsRunning(true);
    setRunError(null);
    try {
      await onRun(routine, routineSubmissionParameterValues(routine, values));
      if (closeAfterSubmit) onOpenChange(false);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Jarvis could not start this routine.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader className="gap-3 pr-14">
          <div className="flex items-start gap-3">
            <RoutineIcon name={routine.icon} className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <DialogTitle className="text-balance">
                {purpose === "schedule" ? "Schedule" : "Run"} {routine.name}
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-[56ch] text-pretty text-base/6 sm:text-sm/5">
                {routine.description}
              </DialogDescription>
              {context !== null ? (
                <p className="mt-2 text-base/6 text-muted-foreground sm:text-sm/5">
                  Context: <span className="font-medium text-foreground">{context.label}</span>
                </p>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <DialogPanel className="space-y-5">
          {routine.parameters.length === 0 ? (
            <p className="text-base/7 text-muted-foreground sm:text-sm/6">
              This routine has no inputs. Jarvis will use the selected context whenever it starts.
            </p>
          ) : (
            routine.parameters.map((parameter) => (
              <RoutineParameterField
                key={parameter.id}
                parameter={parameter}
                value={values[parameter.id] ?? ""}
                locked={context?.lockedParameterIds?.includes(parameter.id) ?? false}
                onChange={(value) => setValue(parameter.id, value)}
              />
            ))
          )}

          <div className="flex items-start gap-2 border-t border-border/65 pt-4 text-base/6 text-muted-foreground sm:text-sm/5">
            <CircleHelpIcon className="size-4 h-lh shrink-0" />
            <p className="text-pretty">
              {purpose === "schedule"
                ? "Saved inputs are checked now and resolved again whenever the schedule starts."
                : "Defaults and current context are resolved when the routine starts. Complete required values before Jarvis begins work."}
            </p>
          </div>
          {runError !== null ? (
            <p role="alert" className="text-base/6 text-destructive sm:text-sm/5">
              {runError}
            </p>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => (onCancel ? onCancel() : onOpenChange(false))}
          >
            {cancelLabel}
          </Button>
          <Button type="button" disabled={missingRequired.length > 0 || isRunning} onClick={submit}>
            <PlayIcon className="size-4" />
            {isRunning
              ? purpose === "schedule"
                ? "Creating…"
                : "Starting…"
              : purpose === "schedule"
                ? "Create schedule"
                : "Run routine"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function RoutineParameterField({
  parameter,
  value,
  locked,
  onChange,
}: {
  readonly locked: boolean;
  readonly onChange: (value: RoutineParameterValue) => void;
  readonly parameter: RoutineParameterDefinition;
  readonly value: RoutineParameterValue;
}) {
  const controlId = `routine-parameter-${parameter.id}`;

  if (parameter.kind === "boolean") {
    return (
      <label
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/65 bg-muted/14 p-3.5"
        htmlFor={controlId}
      >
        <span className="h-lh items-center text-base sm:text-sm">
          <input
            id={controlId}
            name={parameter.id}
            type="checkbox"
            checked={Boolean(value)}
            disabled={locked}
            className="size-5 rounded border-border accent-foreground sm:size-4"
            onChange={(event) => onChange(event.target.checked)}
          />
        </span>
        <span className="min-w-0">
          <span className="font-medium text-foreground">{parameter.label}</span>
          <span className="mt-1 block text-base/6 text-muted-foreground sm:text-sm/5">
            {parameter.description}
          </span>
        </span>
      </label>
    );
  }

  const selectOptions = parameter.options;
  const isSelect = selectOptions !== undefined && selectOptions.length > 0;

  if (parameter.allowMultiple && isSelect) {
    return (
      <fieldset className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <legend className="font-medium text-foreground">{parameter.label}</legend>
          <p className="text-sm text-muted-foreground sm:text-xs">
            {locked ? "From context" : parameter.required ? "Required" : "Optional"} · Multiple
            choices
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-border/65 bg-muted/14 p-3 sm:grid-cols-2">
          {selectOptions.map((option) => (
            <RoutineParameterCheckbox
              key={option}
              locked={locked}
              option={option}
              parameter={parameter}
              value={value}
              onChange={onChange}
            />
          ))}
        </div>
        <p className="text-base/6 text-muted-foreground sm:text-sm/5">{parameter.description}</p>
      </fieldset>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={controlId}>{parameter.label}</Label>
        <p className="text-sm text-muted-foreground sm:text-xs">
          {locked ? "From context" : parameter.required ? "Required" : "Optional"} ·{" "}
          {parameterKindLabel(parameter)}
        </p>
      </div>
      {parameter.allowMultiple && !isSelect ? (
        <Input
          id={controlId}
          name={parameter.id}
          disabled={locked}
          value={Array.isArray(value) ? value.join(", ") : String(value)}
          placeholder={parameter.placeholder ?? "Separate values with commas"}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
        />
      ) : parameter.kind === "text" && !parameter.required ? (
        <Textarea
          id={controlId}
          name={parameter.id}
          disabled={locked}
          rows={3}
          value={String(value)}
          placeholder={parameter.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : isSelect ? (
        <div className="relative">
          <select
            id={controlId}
            name={parameter.id}
            disabled={locked}
            value={String(value)}
            className={cn(
              "h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/24 sm:h-8 sm:text-sm",
            )}
            onChange={(event) => onChange(event.target.value)}
          >
            {selectOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      ) : (
        <Input
          id={controlId}
          name={parameter.id}
          type={parameter.kind === "date" ? "date" : "text"}
          disabled={locked}
          value={String(value)}
          placeholder={parameter.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <p className="text-base/6 text-muted-foreground sm:text-sm/5">{parameter.description}</p>
    </div>
  );
}

function RoutineParameterCheckbox({
  locked,
  onChange,
  option,
  parameter,
  value,
}: {
  readonly locked: boolean;
  readonly onChange: (value: RoutineParameterValue) => void;
  readonly option: string;
  readonly parameter: RoutineParameterDefinition;
  readonly value: RoutineParameterValue;
}) {
  const selected = Array.isArray(value) && value.includes(option);
  const selectedCount = Array.isArray(value) ? value.length : 0;
  const atMaximum = parameter.maxItems !== undefined && selectedCount >= parameter.maxItems;

  return (
    <label className="flex items-center gap-2 text-base sm:text-sm">
      <input
        name={parameter.id}
        type="checkbox"
        checked={selected}
        disabled={locked || (!selected && atMaximum)}
        className="size-5 rounded border-border accent-foreground sm:size-4"
        onChange={(event) =>
          onChange(toggleRoutineParameterOption(value, option, event.target.checked))
        }
      />
      <span>{option}</span>
    </label>
  );
}

function parameterKindLabel(parameter: RoutineParameterDefinition): string {
  if (parameter.allowMultiple) return "Multiple values";
  const kind = parameter.kind;
  if (kind === "date") return "Date";
  if (kind === "github-repository") return "GitHub repository";
  if (kind === "model") return "Model";
  if (kind === "pull-request") return "Pull request";
  if (kind === "select") return "Choice";
  return "Text";
}
