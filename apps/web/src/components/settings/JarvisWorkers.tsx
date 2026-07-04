import { useMemo } from "react";
import {
  BoxesIcon,
  CpuIcon,
  DatabaseIcon,
  RefreshCwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { JarvisWorkerProfile } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

function healthVariant(worker: JarvisWorkerProfile): "success" | "warning" | "error" | "outline" {
  if (worker.status === "online" && worker.health === "healthy") return "success";
  if (worker.status === "unknown" || worker.health === "unknown") return "outline";
  if (worker.status === "offline" || worker.health === "unhealthy") return "error";
  return "warning";
}

function formatWorkerStatus(worker: JarvisWorkerProfile): string {
  return `${worker.status} / ${worker.health}`;
}

function startableRepositoryCount(worker: JarvisWorkerProfile): number {
  return workerRepositories(worker).filter((repository) => repository.can_start_work).length;
}

function workerRepositories(worker: JarvisWorkerProfile): NonNullable<JarvisWorkerProfile["repositories"]> {
  return worker.repositories ?? [];
}

function WorkerRow({ worker }: { worker: JarvisWorkerProfile }) {
  const repositories = workerRepositories(worker);
  const defaultRepository = repositories.find((repository) => repository.is_default);
  const engines = worker.engines.length > 0 ? worker.engines : [];
  const capacityLabel = `${worker.capacity.active_sessions}/${worker.capacity.max_sessions}`;

  return (
    <div className="border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-[13px] font-semibold text-foreground">
              {worker.display_name}
            </h3>
            <Badge variant={healthVariant(worker)}>{formatWorkerStatus(worker)}</Badge>
          </div>
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {worker.worker_id}
          </p>
          {defaultRepository ? (
            <p className="text-xs text-muted-foreground/80">
              Default repository:{" "}
              <span className="font-medium text-foreground">{defaultRepository.repo}</span>
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2 text-right sm:min-w-64">
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
              Repos
            </div>
            <div className="text-sm font-semibold text-foreground">
              {startableRepositoryCount(worker)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
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
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No engines reported</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <DatabaseIcon className="size-3" />
            Startable Repositories
          </div>
          <div className="flex flex-wrap gap-1.5">
            {repositories.length > 0 ? (
              repositories.map((repository) => (
                <Badge
                  key={repository.repo}
                  variant={repository.can_start_work ? "outline" : "warning"}
                  size="sm"
                >
                  {repository.repo}
                  {repository.is_default ? " default" : ""}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No repositories reported</span>
            )}
          </div>
        </div>
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
    </div>
  );
}

export function JarvisWorkersPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
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
  const sortedWorkers = useMemo(
    () =>
      [...workers].sort((left, right) => left.display_name.localeCompare(right.display_name)),
    [workers],
  );
  const totalActiveSessions = workers.reduce(
    (total, worker) => total + worker.capacity.active_sessions,
    0,
  );
  const totalStartableRepos = workers.reduce(
    (total, worker) => total + startableRepositoryCount(worker),
    0,
  );

  return (
    <SettingsPageContainer className="max-w-4xl">
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
            <div className="text-lg font-semibold text-foreground">{totalStartableRepos}</div>
            <div className="text-[11px] text-muted-foreground">Startable Repos</div>
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
          <WorkerRow key={worker.worker_id} worker={worker} />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
