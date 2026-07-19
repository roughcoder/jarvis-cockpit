import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  DatabaseZapIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { JarvisRetentionSettings } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { cn, randomUUID } from "../../lib/utils";
import { primaryServerConfigAtom, serverEnvironment } from "../../state/server";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  formatRetentionBytes,
  formatRetentionInterval,
  formatRetentionPruneResult,
  formatRetentionTotal,
  orderedRetentionClasses,
  retentionSourceLabel,
} from "./JarvisRetention.logic";

type RetentionField = keyof JarvisRetentionSettings;

interface RetentionPruneStatus {
  readonly updatedAt: string;
  readonly description: string;
}

const FIELD_LABELS: Record<RetentionField, string> = {
  enabled: "Auto cleanup",
  interval_s: "Sweep interval",
  archived_ttl_days: "Archived TTL",
  chat_ttl_days: "Chat TTL",
  tree_ttl_days: "Review tree TTL",
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return dateTimeFormatter.format(new Date(parsed));
}

function commandErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return fallback;
}

function NumberSettingControl({
  label,
  value,
  disabled,
  suffix,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
  readonly suffix: string;
  readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, parsed) : value;
    setDraft(String(next));
    if (next !== value) {
      onCommit(next);
    }
  }, [draft, onCommit, value]);

  return (
    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
      <Input
        nativeInput
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        className="w-28 text-right"
        value={draft}
        disabled={disabled}
        aria-label={label}
        onBlur={commit}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <span className="w-16 text-xs text-muted-foreground">{suffix}</span>
    </div>
  );
}

export function JarvisRetentionPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
  const fixtureMode = useAtomValue(primaryServerConfigAtom)?.jarvisBrain?.fixtureMode === true;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingField, setSavingField] = useState<RetentionField | null>(null);
  const [pruning, setPruning] = useState(false);
  const [lastPrune, setLastPrune] = useState<RetentionPruneStatus | null>(null);

  const planQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisRetentionPlan({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const settingsQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisRetentionSettings({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const pruneRetention = useAtomCommand(serverEnvironment.pruneJarvisRetention, {
    reportFailure: false,
  });
  const updateRetentionSettings = useAtomCommand(serverEnvironment.updateJarvisRetentionSettings, {
    reportFailure: false,
  });

  const planResult = planQuery.data;
  const settingsResult = settingsQuery.data;
  const unsupported = planResult?.unsupported === true || settingsResult?.unsupported === true;
  const settings = settingsResult?.settings ?? planResult?.settings ?? null;
  const source = settingsResult?.source ?? {};
  const plan = planResult?.plan ?? null;
  const classRows = useMemo(() => orderedRetentionClasses({ plan, settings }), [plan, settings]);
  const loading =
    (planQuery.isPending && !planResult) || (settingsQuery.isPending && !settingsResult);
  const requestError = planQuery.error ?? settingsQuery.error ?? null;

  const refreshRetention = useCallback(() => {
    planQuery.refresh();
    settingsQuery.refresh();
  }, [planQuery, settingsQuery]);

  const updateField = useCallback(
    (field: RetentionField, value: JarvisRetentionSettings[RetentionField] | null) => {
      if (!primaryEnvironment) {
        toastManager.add({
          type: "error",
          title: "Retention settings unavailable",
          description: "No primary environment is available.",
        });
        return;
      }
      setSavingField(field);
      void (async () => {
        const result = await updateRetentionSettings({
          environmentId: primaryEnvironment.environmentId,
          input: {
            input: {
              idempotency_key: `settings-retention-${field}-${randomUUID()}`,
              [field]: value,
            },
          },
        });
        setSavingField(null);
        if (result._tag === "Success" && result.value.ok) {
          refreshRetention();
          return;
        }
        if (!isAtomCommandInterrupted(result)) {
          const error =
            result._tag === "Success"
              ? result.value.error?.message
              : squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: `${FIELD_LABELS[field]} update failed`,
            description: commandErrorMessage(error, "Jarvis did not update retention settings."),
          });
          refreshRetention();
        }
      })();
    },
    [primaryEnvironment, refreshRetention, updateRetentionSettings],
  );

  const runPrune = useCallback(() => {
    if (!primaryEnvironment || !plan) return;
    setConfirmOpen(false);
    setPruning(true);
    void (async () => {
      const result = await pruneRetention({
        environmentId: primaryEnvironment.environmentId,
        input: {
          input: {
            idempotency_key: `settings-retention-prune-${randomUUID()}`,
          },
        },
      });
      setPruning(false);
      if (result._tag === "Success" && result.value.ok && result.value.result) {
        const description = formatRetentionPruneResult(result.value.result);
        setLastPrune({ updatedAt: new Date().toISOString(), description });
        toastManager.add({
          type: "success",
          title: "Retention cleanup completed",
          description,
        });
        refreshRetention();
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error =
          result._tag === "Success"
            ? result.value.error?.message
            : squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Retention cleanup failed",
          description: commandErrorMessage(error, "Jarvis did not run retention cleanup."),
        });
        refreshRetention();
      }
    })();
  }, [plan, primaryEnvironment, pruneRetention, refreshRetention]);

  const autoSummary = planResult?.auto
    ? `${planResult.auto.enabled ? "On" : "Off"} · every ${formatRetentionInterval(
        planResult.auto.interval_s,
      )} · last run ${formatDateTime(planResult.auto.last_run_at)}${
        planResult.auto.last_result
          ? ` · deleted ${planResult.auto.last_result.deleted}, reclaimed ${formatRetentionBytes(
              planResult.auto.last_result.bytes,
            )}`
          : ""
      }`
    : settings
      ? `${settings.enabled ? "On" : "Off"} · every ${formatRetentionInterval(settings.interval_s)}`
      : "Not reported";

  return (
    <>
      <SettingsSection
        title="Retention"
        icon={<DatabaseZapIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={refreshRetention}>
            <RefreshCwIcon className={loading ? "size-3 animate-spin" : "size-3"} />
            Refresh
          </Button>
        }
      >
        {fixtureMode ? (
          <div className="border-b border-border/60 px-4 py-4 sm:px-5">
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Fixture mode: retention data is simulated</AlertTitle>
              <AlertDescription>
                Plan, cleanup, and settings responses come from deterministic fixture data.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading retention plan
          </div>
        ) : null}

        {unsupported ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Brain does not support retention yet</AlertTitle>
              <AlertDescription>
                Upgrade Jarvis to a build with the retention API before managing cleanup from
                cockpit.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {requestError && !unsupported ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Retention request failed</AlertTitle>
              <AlertDescription>
                {commandErrorMessage(requestError, "Request failed.")}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {planResult?.ok === false && !unsupported ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Retention plan failed</AlertTitle>
              <AlertDescription>
                {planResult.error?.message ?? "Jarvis did not return a retention plan."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {plan && !unsupported ? (
          <>
            <div className="grid border-b border-border/60 sm:grid-cols-3">
              {classRows.map((row) => (
                <div
                  key={row.id}
                  className="border-t border-border/60 px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 sm:px-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">{row.label}</div>
                    <Badge variant={row.disabled ? "outline" : "success"} size="sm">
                      {row.ttlLabel}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{row.countLabel}</span>
                    <span className="font-mono text-sm text-foreground">{row.bytesLabel}</span>
                  </div>
                </div>
              ))}
            </div>

            <SettingsRow
              title="Plan summary"
              description={formatRetentionTotal(plan)}
              status={autoSummary}
              control={
                <Button
                  size="sm"
                  variant="destructive-outline"
                  disabled={pruning || plan.total_count === 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  {pruning ? <Spinner className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
                  Clean up now
                </Button>
              }
            />
          </>
        ) : null}

        {lastPrune ? (
          <div className="border-t border-border/60 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-2 rounded-md border bg-background/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <RotateCcwIcon className="mt-0.5 size-3.5 text-muted-foreground" />
                <div>
                  <div className="text-xs font-medium text-foreground">Last cleanup result</div>
                  <div className="text-xs text-muted-foreground">{lastPrune.description}</div>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {formatDateTime(lastPrune.updatedAt)}
              </span>
            </div>
          </div>
        ) : null}

        {settings && !unsupported ? (
          <>
            <SettingsRow
              title="Auto cleanup"
              description="Controls the scheduled retention sweep in the Jarvis brain."
              status={retentionSourceLabel(source, "enabled")}
              resetAction={
                retentionSourceLabel(source, "enabled") === "custom" ? (
                  <SettingResetButton
                    label="auto cleanup"
                    onClick={() => updateField("enabled", null)}
                  />
                ) : null
              }
              control={
                <div className="flex items-center gap-2">
                  {savingField === "enabled" ? <Spinner className="size-3.5" /> : null}
                  <Switch
                    checked={settings.enabled}
                    disabled={savingField !== null}
                    aria-label="Toggle retention auto cleanup"
                    onCheckedChange={(checked) => updateField("enabled", checked)}
                  />
                </div>
              }
            />

            <SettingsRow
              title="Sweep interval"
              description="How often Jarvis runs the automatic retention sweep."
              status={`${retentionSourceLabel(source, "interval_s")} · ${formatRetentionInterval(
                settings.interval_s,
              )}`}
              resetAction={
                retentionSourceLabel(source, "interval_s") === "custom" ? (
                  <SettingResetButton
                    label="retention sweep interval"
                    onClick={() => updateField("interval_s", null)}
                  />
                ) : null
              }
              control={
                <NumberSettingControl
                  label="Retention sweep interval seconds"
                  value={settings.interval_s}
                  disabled={savingField !== null}
                  suffix="seconds"
                  onCommit={(value) => updateField("interval_s", value)}
                />
              }
            />

            <SettingsRow
              title="Archived conversations"
              description="Archived conversations older than this many days are cleanup candidates. Use 0 to disable this class."
              status={retentionSourceLabel(source, "archived_ttl_days")}
              resetAction={
                retentionSourceLabel(source, "archived_ttl_days") === "custom" ? (
                  <SettingResetButton
                    label="archived conversation TTL"
                    onClick={() => updateField("archived_ttl_days", null)}
                  />
                ) : null
              }
              control={
                <NumberSettingControl
                  label="Archived retention days"
                  value={settings.archived_ttl_days}
                  disabled={savingField !== null}
                  suffix="days"
                  onCommit={(value) => updateField("archived_ttl_days", value)}
                />
              }
            />

            <SettingsRow
              title="Chats"
              description="Unarchived chat conversations older than this many days are cleanup candidates. Use 0 to disable this class."
              status={retentionSourceLabel(source, "chat_ttl_days")}
              resetAction={
                retentionSourceLabel(source, "chat_ttl_days") === "custom" ? (
                  <SettingResetButton
                    label="chat TTL"
                    onClick={() => updateField("chat_ttl_days", null)}
                  />
                ) : null
              }
              control={
                <NumberSettingControl
                  label="Chat retention days"
                  value={settings.chat_ttl_days}
                  disabled={savingField !== null}
                  suffix="days"
                  onCommit={(value) => updateField("chat_ttl_days", value)}
                />
              }
            />

            <SettingsRow
              title="Review trees"
              description="Review tree records older than this many days are cleanup candidates. Use 0 to disable this class."
              status={retentionSourceLabel(source, "tree_ttl_days")}
              resetAction={
                retentionSourceLabel(source, "tree_ttl_days") === "custom" ? (
                  <SettingResetButton
                    label="review tree TTL"
                    onClick={() => updateField("tree_ttl_days", null)}
                  />
                ) : null
              }
              control={
                <NumberSettingControl
                  label="Review tree retention days"
                  value={settings.tree_ttl_days}
                  disabled={savingField !== null}
                  suffix="days"
                  onCommit={(value) => updateField("tree_ttl_days", value)}
                />
              }
            />

            {savingField ? (
              <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:px-5">
                <Spinner className="size-3.5" />
                Saving {FIELD_LABELS[savingField].toLowerCase()}
              </div>
            ) : null}
          </>
        ) : null}
      </SettingsSection>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clean up retained conversations?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan
                ? `${formatRetentionTotal(plan)}. This runs the Jarvis retention prune now.`
                : "No retention plan is loaded."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {plan ? (
            <div className="px-6 pb-4">
              <div className="rounded-md border bg-background/50 p-3">
                {classRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 py-1 text-xs"
                  >
                    <span className={cn(row.disabled && "text-muted-foreground")}>{row.label}</span>
                    <span className="font-mono text-foreground">
                      {row.count} · {row.bytesLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" disabled={!plan || pruning} onClick={runPrune}>
              {pruning ? <Spinner className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
              Clean up now
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
