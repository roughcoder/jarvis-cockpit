import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  BoxesIcon,
  CheckCircle2Icon,
  CpuIcon,
  DatabaseIcon,
  HelpCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  ServerIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import type { JarvisWorkerProfile, JarvisWorkerSession } from "@t3tools/contracts";

import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn, newMessageId, newThreadId } from "../../lib/utils";
import { primaryServerConfigAtom, serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import {
  buildWorkerTestJobStartTurnInput,
  NOT_REPORTED,
  workerIdentityAccessSummary,
  workerReadinessRows,
  workerWarmCheckouts,
  type WorkerReadinessStatus,
} from "./JarvisWorkers.logic";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const WORKER_SNAPSHOT_POLL_MS = 2_000;
const TERMINAL_SESSION_STATUSES = new Set(["completed", "failed", "stopped", "interrupted"]);
const WARM_CHECKOUT_SEARCH_THRESHOLD = 10;

function healthVariant(worker: JarvisWorkerProfile): "success" | "warning" | "error" | "outline" {
  if (worker.status === "online" && worker.health === "healthy") return "success";
  if (worker.status === "unknown" || worker.health === "unknown") return "outline";
  if (worker.status === "offline" || worker.health === "unhealthy") return "error";
  return "warning";
}

function formatWorkerStatus(worker: JarvisWorkerProfile): string {
  return `${worker.status} / ${worker.health}`;
}

function sessionVariant(session: JarvisWorkerSession): "success" | "warning" | "error" | "outline" {
  if (session.status === "completed") return "success";
  if (session.status === "failed") return "error";
  if (TERMINAL_SESSION_STATUSES.has(session.status)) return "outline";
  if (session.status === "needs_input" || session.status === "needs_approval") return "warning";
  return "outline";
}

function sessionProgressLabel(session: JarvisWorkerSession): string {
  const phase = session.status.replaceAll("_", " ");
  if (TERMINAL_SESSION_STATUSES.has(session.status)) {
    return `Terminal: ${phase}`;
  }
  if (session.pending_input_count > 0) {
    return "Waiting for input";
  }
  if (session.pending_approval_count > 0) {
    return "Waiting for approval";
  }
  return phase;
}

function readinessVariant(status: WorkerReadinessStatus): "success" | "error" | "outline" {
  if (status === "reported-healthy") return "success";
  if (status === "reported-unhealthy") return "error";
  return "outline";
}

function readinessLabel(status: WorkerReadinessStatus): string {
  if (status === "reported-healthy") return "Reported healthy";
  if (status === "reported-unhealthy") return "Reported unhealthy";
  return NOT_REPORTED;
}

function readinessIcon(status: WorkerReadinessStatus) {
  if (status === "reported-healthy") return <CheckCircle2Icon className="size-3.5" />;
  if (status === "reported-unhealthy") return <XCircleIcon className="size-3.5" />;
  return <HelpCircleIcon className="size-3.5" />;
}

function absoluteTime(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
}

function latestFailedSession(
  sessions: ReadonlyArray<JarvisWorkerSession>,
): JarvisWorkerSession | null {
  return sessions.find((session) => session.status === "failed") ?? null;
}

function WorkerReadinessRows({ worker }: { readonly worker: JarvisWorkerProfile }) {
  const rows = workerReadinessRows(worker);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 items-start justify-between gap-2 rounded-md border bg-background/50 px-2 py-1.5"
        >
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">{row.label}</div>
            <div className="truncate text-[11px] text-muted-foreground">{row.detail}</div>
          </div>
          <Badge
            variant={readinessVariant(row.status)}
            size="sm"
            className="shrink-0"
            title={row.detail}
          >
            {readinessIcon(row.status)}
            {readinessLabel(row.status)}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function WarmCheckouts({ worker }: { readonly worker: JarvisWorkerProfile }) {
  const checkouts = workerWarmCheckouts(worker);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCheckouts =
    normalizedQuery.length > 0
      ? checkouts.filter((checkout) => checkout.repo.toLowerCase().includes(normalizedQuery))
      : checkouts;

  return (
    <details className="rounded-md border bg-background/40 px-3 py-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <DatabaseIcon className="size-3.5 text-muted-foreground" />
          Warm checkouts
          <Badge variant="outline" size="sm">
            {checkouts.length}
          </Badge>
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground">
          Cache detail only; current dispatch blocking remains temporary and presence-based.
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        {checkouts.length > WARM_CHECKOUT_SEARCH_THRESHOLD ? (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              nativeInput
              type="search"
              size="sm"
              className="pl-7"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter warm checkouts"
              aria-label="Filter warm checkouts"
            />
          </div>
        ) : null}
        {visibleCheckouts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleCheckouts.map((checkout) => (
              <Badge
                key={checkout.repo}
                variant={checkout.canStartWork ? "outline" : "warning"}
                size="sm"
                title={`Status: ${checkout.status}`}
              >
                {checkout.repo}
                {checkout.isDefault ? " default" : ""}
                {checkout.defaultBranch ? ` ${checkout.defaultBranch}` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No warm checkouts match.</span>
        )}
        {checkouts.length === 0 ? (
          <span className="text-xs text-muted-foreground">No warm checkouts reported.</span>
        ) : null}
      </div>
    </details>
  );
}

function WorkerRow({
  fixtureMode,
  onSendTestJob,
  pendingTestJob,
  sessions,
  worker,
}: {
  readonly worker: JarvisWorkerProfile;
  readonly sessions: ReadonlyArray<JarvisWorkerSession>;
  readonly fixtureMode: boolean;
  readonly pendingTestJob: boolean;
  readonly onSendTestJob: (worker: JarvisWorkerProfile) => void;
}) {
  const engines = worker.engines.length > 0 ? worker.engines : [];
  const capacityLabel = `${worker.capacity.active_sessions}/${worker.capacity.max_sessions}`;
  const checkouts = workerWarmCheckouts(worker);
  const startableWarmCheckoutCount = checkouts.filter((checkout) => checkout.canStartWork).length;
  const identity = workerIdentityAccessSummary(worker);
  const failure = latestFailedSession(sessions);

  return (
    <div className="border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold text-foreground">
              {worker.display_name}
            </h3>
            <Badge variant={fixtureMode ? "warning" : healthVariant(worker)}>
              {fixtureMode ? "Fixture mode" : formatWorkerStatus(worker)}
            </Badge>
            {fixtureMode ? (
              <Badge variant="outline" size="sm">
                Simulated worker
              </Badge>
            ) : null}
          </div>
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {worker.worker_id}
          </p>
          <p className="text-xs text-muted-foreground/80">
            Last seen:{" "}
            {worker.last_seen_at ? (
              <span title={absoluteTime(worker.last_seen_at)}>
                {formatRelativeTimeLabel(worker.last_seen_at)}
              </span>
            ) : (
              NOT_REPORTED
            )}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="grid grid-cols-3 gap-2 text-right sm:min-w-72">
            <div className="rounded-md border bg-background/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Capacity
              </div>
              <div className="text-sm font-semibold text-foreground">{capacityLabel}</div>
            </div>
            <div className="rounded-md border bg-background/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Queue
              </div>
              <div className="text-sm font-semibold text-foreground">
                {worker.capacity.queued_sessions}
              </div>
            </div>
            <div className="rounded-md border bg-background/60 px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Warm
              </div>
              <div className="text-sm font-semibold text-foreground">
                {startableWarmCheckoutCount}/{checkouts.length}
              </div>
            </div>
          </div>
          <Button
            size="xs"
            variant={fixtureMode ? "secondary" : "outline"}
            disabled={pendingTestJob}
            onClick={() => onSendTestJob(worker)}
          >
            {pendingTestJob ? <Spinner className="size-3" /> : <SendIcon className="size-3" />}
            {fixtureMode ? "Simulate test job" : "Send test job"}
          </Button>
          {fixtureMode ? (
            <p className="max-w-72 text-right text-[11px] text-muted-foreground">
              Fixture mode simulates this dispatch; no live worker is contacted.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <ServerIcon className="size-3" />
            Identity & Access
          </div>
          <div className="grid gap-1.5">
            <InfoRow label="Git identity" value={identity.gitIdentity} />
            <InfoRow label="Repo access summary" value={identity.repoAccess} />
            <InfoRow label="Worktree inventory" value={identity.worktreeInventory} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <CpuIcon className="size-3" />
            Engines
          </div>
          <div className="flex flex-wrap gap-1.5">
            {engines.length > 0 ? (
              engines.map((engine) => (
                <Badge
                  key={engine.engine}
                  variant={engine.status === "available" ? "success" : "warning"}
                  size="sm"
                >
                  {engine.display_name}
                  {engine.default ? " default" : ""}
                  {engine.status !== "available" ? ` ${engine.status}` : ""}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No engines reported</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <CheckCircle2Icon className="size-3" />
          Readiness
        </div>
        <WorkerReadinessRows worker={worker} />
      </div>

      <div className="mt-3">
        <WarmCheckouts worker={worker} />
      </div>

      {worker.capabilities.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {worker.capabilities.map((capability) => (
            <Badge key={capability} variant="secondary" size="sm">
              {capability}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <TriangleAlertIcon className="size-3" />
            Last Failure
          </div>
          {failure ? (
            <div className="rounded-md border bg-background/50 px-2 py-1.5 text-xs">
              <div className="truncate font-medium text-foreground">{failure.title}</div>
              <div
                className="text-[11px] text-muted-foreground"
                title={absoluteTime(failure.updated_at)}
              >
                Failed {formatRelativeTimeLabel(failure.updated_at)}
                {failure.repo ? ` / ${failure.repo}` : ""}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No failed dispatch reported.</span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <ServerIcon className="size-3" />
            Dispatch Progress
          </div>
          {sessions.length > 0 ? (
            <div className="space-y-1.5">
              {sessions.map((session) => (
                <div
                  key={session.session_ref}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border bg-background/50 px-2 py-1.5"
                >
                  <Badge variant={sessionVariant(session)} size="sm">
                    {sessionProgressLabel(session)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {session.title}
                  </span>
                  {session.repo ? (
                    <span className="max-w-48 truncate text-[11px] text-muted-foreground">
                      {session.repo}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              No active or terminal dispatches reported for this worker.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-background/50 px-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-xs font-medium",
          value === NOT_REPORTED ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function JarvisWorkersPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
  const fixtureMode = useAtomValue(primaryServerConfigAtom)?.jarvisBrain?.fixtureMode === true;
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const [pendingTestWorkerId, setPendingTestWorkerId] = useState<string | null>(null);
  const snapshotQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisSnapshot({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const result = snapshotQuery.data;
  const workers = result?.snapshot?.workers ?? [];
  useEffect(() => {
    if (!primaryEnvironment) return;
    const id = window.setInterval(() => {
      snapshotQuery.refresh();
    }, WORKER_SNAPSHOT_POLL_MS);
    return () => window.clearInterval(id);
  }, [primaryEnvironment, snapshotQuery]);
  const sortedWorkers = useMemo(
    () => [...workers].sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [workers],
  );
  const sessionsByWorker = useMemo(() => {
    const byWorker = new Map<string, JarvisWorkerSession[]>();
    for (const session of result?.snapshot?.sessions ?? []) {
      const sessions = byWorker.get(session.worker_id) ?? [];
      sessions.push(session);
      byWorker.set(session.worker_id, sessions);
    }
    for (const sessions of byWorker.values()) {
      sessions.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    }
    return byWorker;
  }, [result?.snapshot?.sessions]);
  const totalActiveSessions = workers.reduce(
    (total, worker) => total + worker.capacity.active_sessions,
    0,
  );
  const totalWarmCheckouts = workers.reduce(
    (total, worker) => total + workerWarmCheckouts(worker).length,
    0,
  );

  const sendTestJob = useCallback(
    (worker: JarvisWorkerProfile) => {
      if (!primaryEnvironment || pendingTestWorkerId !== null) return;
      setPendingTestWorkerId(worker.worker_id);
      void (async () => {
        const result = await startThreadTurn({
          environmentId: primaryEnvironment.environmentId,
          input: buildWorkerTestJobStartTurnInput({
            worker,
            threadId: newThreadId(),
            messageId: newMessageId(),
          }),
        });
        setPendingTestWorkerId(null);
        if (result._tag === "Success") {
          toastManager.add({
            type: "success",
            title: fixtureMode ? "Fixture test job simulated" : "Worker test job sent",
            description: worker.display_name,
          });
          snapshotQuery.refresh();
          return;
        }
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: "Worker test job failed",
            description:
              error instanceof Error ? error.message : "Jarvis did not accept the test job.",
          });
        }
      })();
    },
    [fixtureMode, pendingTestWorkerId, primaryEnvironment, snapshotQuery, startThreadTurn],
  );

  return (
    <SettingsPageContainer className="max-w-5xl">
      <SettingsSection
        title="Jarvis Workers"
        icon={<ServerIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={snapshotQuery.refresh}>
            <RefreshCwIcon className={cn("size-3", snapshotQuery.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        {fixtureMode ? (
          <div className="border-b border-border/60 px-4 py-4 sm:px-5">
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Fixture mode: no live workers</AlertTitle>
              <AlertDescription>
                Worker rows and test jobs are simulated fixture data. Use this screen for UI testing
                only; live dispatch requires a real Jarvis brain connection.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="grid grid-cols-3 border-b border-border/60 text-center">
          <div className="px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{workers.length}</div>
            <div className="text-[11px] text-muted-foreground">Workers</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{totalActiveSessions}</div>
            <div className="text-[11px] text-muted-foreground">Active Sessions</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{totalWarmCheckouts}</div>
            <div className="text-[11px] text-muted-foreground">Warm Checkouts</div>
          </div>
        </div>

        {snapshotQuery.isPending && !result ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading Jarvis workers
          </div>
        ) : null}

        {result?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Worker snapshot failed</AlertTitle>
              <AlertDescription>
                {result.error?.message ?? "Jarvis did not return a cockpit snapshot."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {result?.ok && sortedWorkers.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <BoxesIcon className="size-4" />
            The Jarvis brain returned no workers.
          </div>
        ) : null}

        {sortedWorkers.map((worker) => (
          <WorkerRow
            key={worker.worker_id}
            worker={worker}
            sessions={sessionsByWorker.get(worker.worker_id) ?? []}
            fixtureMode={fixtureMode}
            pendingTestJob={pendingTestWorkerId === worker.worker_id}
            onSendTestJob={sendTestJob}
          />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
