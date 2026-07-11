import { useAtomValue } from "@effect/atom-react";
import {
  ActivityIcon,
  BoxesIcon,
  CheckCircle2Icon,
  Clock3Icon,
  GitBranchIcon,
  KeyRoundIcon,
  LogInIcon,
  RefreshCwIcon,
  ServerCogIcon,
  ServerIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_JARVIS_API_BASE_URL,
  type JarvisBrainCheckResult,
  type JarvisBrainConnection,
  type JarvisCockpitSnapshot,
  type JarvisRun,
  type JarvisWorkerSession,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { serverEnvironment, primaryServerConfigAtom } from "../../state/server";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function formatCommandFailure(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The Jarvis brain request failed.";
}

function sourceLabel(source: JarvisBrainConnection["apiBaseUrlSource"]): string {
  switch (source) {
    case "environment":
      return "Environment";
    case "settings":
      return "Settings";
    case "default":
      return "Default";
  }
}

function tokenLabel(connection: JarvisBrainConnection | null): string {
  if (connection?.oauthTokenConfigured) {
    return "OAuth configured";
  }
  if (!connection?.apiTokenConfigured) {
    return "Not connected";
  }
  return connection.apiTokenSource === "environment" ? "Token from env" : "Stored token";
}

function authModeLabel(connection: JarvisBrainConnection | null): string {
  if (connection?.fixtureMode) return "Fixture";
  if (connection?.oauthTokenConfigured) return "OAuth";
  if (connection?.apiTokenConfigured) return "Recovery token";
  return "Unauthenticated";
}

function authModeDescription(connection: JarvisBrainConnection | null): string {
  if (connection?.fixtureMode) {
    return "Fixture data is active. No live workers are contacted.";
  }
  if (connection?.oauthTokenConfigured) {
    return "Jarvis OAuth is configured server-side and is preferred for live brain calls.";
  }
  if (connection?.apiTokenConfigured) {
    return "A manual recovery token is configured as the fallback authority.";
  }
  return "No OAuth mapping or recovery token is configured for this brain.";
}

function failureMessage(value: unknown): string {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "No failure reported.";
}

type StatusBadgeVariant = "success" | "warning" | "error" | "outline";

const ACTIVE_RUN_STATUSES = new Set<JarvisRun["status"]>([
  "queued",
  "created",
  "active",
  "running",
  "waiting_provider",
  "needs_input",
  "needs_approval",
]);

const RUN_STATUS_VARIANTS: Record<JarvisRun["status"], StatusBadgeVariant> = {
  queued: "outline",
  created: "outline",
  active: "success",
  running: "success",
  waiting_provider: "warning",
  needs_input: "warning",
  needs_approval: "warning",
  interrupted: "warning",
  stopped: "outline",
  completed: "success",
  failed: "error",
  terminal: "outline",
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return dateTimeFormatter.format(new Date(time));
}

function syncStatusVariant(status: JarvisCockpitSnapshot["sync"]["status"]): StatusBadgeVariant {
  switch (status) {
    case "fresh":
      return "success";
    case "failed":
      return "error";
    case "partial":
    case "stale":
      return "warning";
  }
}

function isActiveRun(run: JarvisRun): boolean {
  return ACTIVE_RUN_STATUSES.has(run.status);
}

function isArchivedRun(run: JarvisRun): boolean {
  return run.archived_at != null;
}

function activeSnapshotRuns(runs: ReadonlyArray<JarvisRun>): ReadonlyArray<JarvisRun> {
  return runs.filter((run) => !isArchivedRun(run));
}

function activeSnapshotSessions(
  snapshot: JarvisCockpitSnapshot | null,
): ReadonlyArray<JarvisWorkerSession> {
  if (!snapshot) return [];
  const archivedRunIds = new Set(snapshot.runs.filter(isArchivedRun).map((run) => run.run_id));
  return snapshot.sessions.filter(
    (session) =>
      session.archived_at == null &&
      (session.run_id === null || !archivedRunIds.has(session.run_id)),
  );
}

function pendingRunWorkCount(runs: ReadonlyArray<JarvisRun>): number {
  return runs.reduce(
    (total, run) => total + run.pending_input_count + run.pending_approval_count,
    0,
  );
}

function SnapshotMetric({
  label,
  value,
  border,
}: {
  label: string;
  value: string | number;
  border?: boolean;
}) {
  return (
    <div className={border ? "border-l border-border/60 px-3 py-3" : "px-3 py-3"}>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DetailTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function LatestRunRow({ run }: { run: JarvisRun }) {
  const repositoryLabel = run.repo || "No repository";
  const branchLabel = run.branch || "No branch";
  const latestActivity = run.latest_activity_at ?? run.updated_at;

  return (
    <div className="border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold text-foreground">{run.title}</h3>
            <Badge variant={RUN_STATUS_VARIANTS[run.status]}>{run.status}</Badge>
            {run.phase ? (
              <Badge variant="outline" size="sm">
                {run.phase}
              </Badge>
            ) : null}
          </div>
          <p className="break-all font-mono text-[11px] text-muted-foreground">{run.run_id}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground/80">
            {run.objective || run.state_reason || run.terminal_reason || "No objective reported"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right sm:min-w-64">
          <div className="rounded-md border bg-background/60 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Sessions
            </div>
            <div className="text-sm font-semibold text-foreground">{run.session_count}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Pending
            </div>
            <div className="text-sm font-semibold text-foreground">
              {run.pending_input_count + run.pending_approval_count}
            </div>
          </div>
          <div className="rounded-md border bg-background/60 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Artifacts
            </div>
            <div className="text-sm font-semibold text-foreground">{run.artifact_count}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <GitBranchIcon className="size-3" />
            Source
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" size="sm">
              {repositoryLabel}
            </Badge>
            <Badge variant="outline" size="sm">
              {branchLabel}
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Clock3Icon className="size-3" />
            Latest Activity
          </div>
          <div className="text-xs text-muted-foreground">{formatDateTime(latestActivity)}</div>
        </div>
      </div>
    </div>
  );
}

export function JarvisSettingsPanel() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const primaryEnvironment = usePrimaryEnvironment();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const connection = serverConfig?.jarvisBrain ?? null;
  const checkJarvisBrain = useAtomCommand(serverEnvironment.checkJarvisBrain, {
    label: "Jarvis brain check",
    reportFailure: false,
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.jarvis.apiBaseUrl);
  const [apiToken, setApiToken] = useState("");
  const [checkResult, setCheckResult] = useState<JarvisBrainCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const snapshotQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisSnapshot({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );

  useEffect(() => {
    setApiBaseUrl(settings.jarvis.apiBaseUrl);
  }, [settings.jarvis.apiBaseUrl]);

  const envControlsUrl = connection?.apiBaseUrlSource === "environment";
  const envControlsToken = connection?.apiTokenSource === "environment";
  const oauthConfigured = Boolean(connection?.oauthTokenConfigured);
  const canCheck = primaryEnvironment !== null && apiBaseUrl.trim().length > 0;
  const effectiveUrl = connection?.apiBaseUrl ?? settings.jarvis.apiBaseUrl;
  const statusVariant = connection?.fixtureMode
    ? "warning"
    : connection?.enabled
      ? "success"
      : "error";
  const statusLabel = connection?.fixtureMode
    ? "Fixture mode"
    : connection?.enabled
      ? "Live"
      : "Disabled";
  const snapshotResult = snapshotQuery.data;
  const snapshot = snapshotResult?.snapshot ?? null;
  const lastSuccessfulSnapshotAt = snapshot?.sync.synced_at ?? snapshot?.generated_at ?? null;
  const lastFailure = (() => {
    if (snapshotQuery.error !== null && !snapshot) {
      return {
        className: "Network/RPC",
        message: failureMessage(snapshotQuery.error),
      };
    }
    if (snapshotResult?.ok === false) {
      return {
        className: "Jarvis API",
        message: snapshotResult.error?.message ?? "Jarvis did not return a cockpit snapshot.",
      };
    }
    if (checkError !== null) {
      return {
        className: "Brain check",
        message: checkError,
      };
    }
    if (checkResult?.ok === false) {
      return {
        className: `Brain check${checkResult.status ? ` HTTP ${checkResult.status}` : ""}`,
        message: checkResult.message,
      };
    }
    return null;
  })();
  const showBrainDisconnected =
    connection?.enabled === true &&
    connection.fixtureMode !== true &&
    snapshot === null &&
    lastFailure !== null;
  const snapshotRuns = activeSnapshotRuns(snapshot?.runs ?? []);
  const snapshotSessions = activeSnapshotSessions(snapshot);
  const snapshotWorkers = snapshot?.workers ?? [];
  const activeRuns = snapshotRuns.filter(isActiveRun);
  const onlineWorkers = snapshotWorkers.filter((worker) => worker.status === "online");
  const pendingRequests = (snapshot?.requests ?? []).filter(
    (request) => request.status === "pending",
  );
  const pendingWork = Math.max(pendingRunWorkCount(snapshotRuns), pendingRequests.length);
  const latestRuns = useMemo(
    () =>
      [...snapshotRuns]
        .sort((left, right) => {
          const leftTime = Date.parse(left.latest_activity_at ?? left.updated_at);
          const rightTime = Date.parse(right.latest_activity_at ?? right.updated_at);
          return (
            (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime)
          );
        })
        .slice(0, 3),
    [snapshotRuns],
  );

  const checkStatus = useMemo(() => {
    if (checkResult === null && checkError === null) return null;
    if (checkError !== null) {
      return {
        variant: "error" as const,
        icon: <XCircleIcon />,
        title: "Check failed",
        description: checkError,
      };
    }
    if (checkResult?.ok) {
      return {
        variant: "success" as const,
        icon: <CheckCircle2Icon />,
        title: "Brain reachable",
        description: `${checkResult.message} ${checkResult.status ? `HTTP ${checkResult.status}.` : ""}`,
      };
    }
    return {
      variant: "error" as const,
      icon: <XCircleIcon />,
      title: "Brain unavailable",
      description: checkResult?.message ?? "Jarvis brain did not return a healthy response.",
    };
  }, [checkError, checkResult]);

  const save = useCallback(() => {
    updateSettings({
      jarvis: {
        ...settings.jarvis,
        apiBaseUrl: apiBaseUrl.trim() || DEFAULT_JARVIS_API_BASE_URL,
        ...(apiToken.trim().length > 0 ? { apiToken: apiToken.trim() } : {}),
      },
    });
    setApiToken("");
    snapshotQuery.refresh();
    window.setTimeout(snapshotQuery.refresh, 500);
  }, [apiBaseUrl, apiToken, settings.jarvis, snapshotQuery, updateSettings]);

  const clearToken = useCallback(() => {
    updateSettings({
      jarvis: {
        ...settings.jarvis,
        apiToken: "",
        apiTokenRedacted: false,
      },
    });
    setApiToken("");
    snapshotQuery.refresh();
    window.setTimeout(snapshotQuery.refresh, 500);
  }, [settings.jarvis, snapshotQuery, updateSettings]);

  const check = useCallback(async () => {
    if (!primaryEnvironment || !canCheck) return;
    setIsChecking(true);
    setCheckError(null);
    const result = await checkJarvisBrain({
      environmentId: primaryEnvironment.environmentId,
      input: {
        apiBaseUrl: apiBaseUrl.trim() || DEFAULT_JARVIS_API_BASE_URL,
        ...(apiToken.trim().length > 0 ? { apiToken: apiToken.trim() } : {}),
      },
    });
    setIsChecking(false);
    if (result._tag === "Success") {
      setCheckResult(result.value);
      return;
    }
    if (isAtomCommandInterrupted(result)) {
      return;
    }
    setCheckResult(null);
    setCheckError(formatCommandFailure(squashAtomCommandFailure(result)));
  }, [apiBaseUrl, apiToken, canCheck, checkJarvisBrain, primaryEnvironment]);

  return (
    <SettingsPageContainer className="max-w-4xl">
      <SettingsSection
        title="Jarvis Brain"
        icon={<ServerCogIcon className="size-3.5" />}
        headerAction={<Badge variant={statusVariant}>{statusLabel}</Badge>}
      >
        <SettingsRow
          title="Effective brain"
          description="Cockpit reads and writes go through the Jarvis brain; OAuth is used before recovery tokens when configured."
          status={
            <span className="break-all">
              {sourceLabel(connection?.apiBaseUrlSource ?? "default")}: {effectiveUrl}
            </span>
          }
          control={<Badge variant="outline">{tokenLabel(connection)}</Badge>}
        />

        <SettingsRow
          title="Account pairing"
          description={
            oauthConfigured
              ? "The server has an OAuth mapping for this Jarvis brain. Browser sessions use the server-side Jarvis authority."
              : "OAuth is not configured for this Jarvis brain. Use a manual recovery token until the mapping exists."
          }
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled>
                <LogInIcon className="size-3.5" />
                Sign in
              </Button>
              <Button size="sm" disabled>
                <KeyRoundIcon className="size-3.5" />
                Connect brain
              </Button>
            </div>
          }
        />

        <SettingsRow
          title="Connection diagnostics"
          description={authModeDescription(connection)}
          status={
            <span>
              Last successful snapshot: {formatDateTime(lastSuccessfulSnapshotAt)}
              {lastFailure
                ? ` · Last failure: ${lastFailure.className} - ${lastFailure.message}`
                : ""}
            </span>
          }
          control={
            <Badge variant={connection?.oauthTokenConfigured ? "success" : "outline"}>
              {authModeLabel(connection)}
            </Badge>
          }
        />

        <SettingsRow
          title="Brain URL"
          description={
            envControlsUrl
              ? "JARVIS_API_BASE_URL is set, so environment configuration controls the active URL."
              : "Defaults to the local Jarvis API; set the fleet brain URL here when testing live workers."
          }
          control={
            <Input
              className="w-full sm:w-96"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder={DEFAULT_JARVIS_API_BASE_URL}
              spellCheck={false}
              aria-label="Jarvis brain URL"
            />
          }
        />

        <SettingsRow
          title="Manual recovery token"
          description={
            envControlsToken
              ? "JARVIS_API_TOKEN is set, so the environment token is used for checks and cockpit calls."
              : "Fallback for Pi/headless/admin recovery. Leave blank to keep the stored token."
          }
          control={
            <Input
              className="w-full sm:w-96"
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              placeholder={
                settings.jarvis.apiTokenRedacted ? "Stored recovery token configured" : "Optional"
              }
              aria-label="Jarvis brain manual recovery token"
            />
          }
        />

        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRoundIcon className="size-3.5" />
            <span>
              The browser never receives OAuth or manual tokens; checks run through the T3 server.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={clearToken} disabled={envControlsToken}>
              Clear token
            </Button>
            <Button size="sm" variant="outline" onClick={save}>
              Save
            </Button>
            <Button size="sm" onClick={() => void check()} disabled={!canCheck || isChecking}>
              {isChecking ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              Check brain
            </Button>
          </div>
        </div>
      </SettingsSection>

      {checkStatus ? (
        <Alert variant={checkStatus.variant}>
          {checkStatus.icon}
          <AlertTitle>{checkStatus.title}</AlertTitle>
          <AlertDescription>{checkStatus.description}</AlertDescription>
        </Alert>
      ) : null}

      {showBrainDisconnected && lastFailure ? (
        <Alert variant="error">
          <TriangleAlertIcon />
          <AlertTitle>Brain disconnected</AlertTitle>
          <AlertDescription>
            Reconnect Jarvis Brain before starting live work. {lastFailure.className}:{" "}
            {lastFailure.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {connection?.fixtureMode ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Fixture mode: no live workers</AlertTitle>
          <AlertDescription>
            Start work simulates dispatch against demo data. Unset JARVIS_FIXTURE_MODE to test live
            fleet data from the Jarvis brain.
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection
        title="Jarvis Snapshot"
        icon={<ServerIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={snapshotQuery.refresh}>
            <RefreshCwIcon className={snapshotQuery.isPending ? "size-3 animate-spin" : "size-3"} />
            Refresh
          </Button>
        }
      >
        {snapshot ? (
          <div className="grid grid-cols-3 border-b border-border/60 text-center sm:grid-cols-6">
            <SnapshotMetric label="Workers" value={snapshotWorkers.length} />
            <SnapshotMetric label="Online" value={onlineWorkers.length} border />
            <SnapshotMetric label="Runs" value={snapshotRuns.length} border />
            <SnapshotMetric label="Active" value={activeRuns.length} border />
            <SnapshotMetric label="Sessions" value={snapshotSessions.length} border />
            <SnapshotMetric label="Pending" value={pendingWork} border />
          </div>
        ) : null}

        {snapshotQuery.isPending && !snapshotResult ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading Jarvis snapshot
          </div>
        ) : null}

        {snapshotQuery.error !== null && !snapshot ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Snapshot request failed</AlertTitle>
              <AlertDescription>{snapshotQuery.error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {snapshotResult?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Snapshot failed</AlertTitle>
              <AlertDescription>
                {snapshotResult.error?.message ?? "Jarvis did not return a cockpit snapshot."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {snapshot ? (
          <>
            <div className="border-b border-border/60 px-4 py-4 sm:px-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <DetailTile
                  label="Sync"
                  value={`${snapshot.sync.mode} / ${snapshot.sync.status}`}
                  icon={<ActivityIcon className="size-3" />}
                />
                <DetailTile
                  label="Generated"
                  value={formatDateTime(snapshot.generated_at)}
                  icon={<Clock3Icon className="size-3" />}
                />
                <DetailTile
                  label="Artifacts"
                  value={snapshot.artifacts.length}
                  icon={<BoxesIcon className="size-3" />}
                />
                <DetailTile
                  label="Checkpoints"
                  value={(snapshot.checkpoints ?? []).length}
                  icon={<GitBranchIcon className="size-3" />}
                />
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={syncStatusVariant(snapshot.sync.status)}>
                  {snapshot.sync.status}
                </Badge>
                <span className="break-all">Cursor {snapshot.cursor}</span>
                <span>Schema v{snapshot.schema_version}</span>
                <span>Synced {formatDateTime(snapshot.sync.synced_at)}</span>
              </div>
            </div>

            {latestRuns.length > 0 ? (
              latestRuns.map((run) => <LatestRunRow key={run.run_id} run={run} />)
            ) : (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
                <BoxesIcon className="size-4" />
                The Jarvis brain returned no runs.
              </div>
            )}
          </>
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
