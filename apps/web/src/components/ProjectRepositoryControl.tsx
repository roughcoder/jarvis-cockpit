import type { EnvironmentId, JarvisProjectRepository } from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  LoaderIcon,
  PlusIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "../lib/utils";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface ProjectRepositoryControlProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly repos: ReadonlyArray<JarvisProjectRepository>;
  readonly onAddRepository: () => void;
  readonly onEditRepositories: () => void;
}

function normalizeRepositoryReference(value: string): string {
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/\.git$/u, "");
  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/^\/+|\/+$/gu, "");
  } catch {
    return trimmed.replace(/^github\.com[:/]/u, "").replace(/^\/+|\/+$/gu, "");
  }
}

function repoMatches(repo: JarvisProjectRepository, value: string): boolean {
  const remote = normalizeRepositoryReference(repo.remote);
  const candidate = normalizeRepositoryReference(value);
  return (
    candidate === remote ||
    candidate === repo.name.trim().toLowerCase() ||
    candidate.split("/").at(-1) === remote.split("/").at(-1)
  );
}

export function ProjectRepositoryControl({
  environmentId,
  projectId,
  repos,
  onAddRepository,
  onEditRepositories,
}: ProjectRepositoryControlProps) {
  const pullRequestsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectPullRequests({ environmentId, input: { projectId } }),
  );
  const result = pullRequestsQuery.data;
  const pullRequests = result?.ok === true ? (result.pullRequests ?? []) : [];
  const repoErrors = result?.ok === true ? (result.errors ?? []) : [];
  const requestError =
    pullRequestsQuery.error ??
    (result?.ok === false ? (result.error?.message ?? "Repository status is unavailable.") : null);
  const loading = pullRequestsQuery.isPending && !pullRequestsQuery.data;

  return (
    <section className="project-control-deck-enter overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Repositories
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Source-control connections
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={pullRequestsQuery.refresh}
            disabled={pullRequestsQuery.isPending}
          >
            <RefreshCwIcon
              className={cn("size-3.5", pullRequestsQuery.isPending && "animate-spin")}
            />
            Refresh status
          </Button>
          <Button size="xs" variant="outline" onClick={onEditRepositories}>
            Edit repos
          </Button>
          <Button size="xs" onClick={onAddRepository}>
            <PlusIcon className="size-3.5" />
            Add repo
          </Button>
        </div>
      </header>

      <div className="divide-y divide-border/60">
        {repos.map((repo) => {
          const error = repoErrors.find((candidate) => repoMatches(repo, candidate.repo));
          const reachable = result?.ok === true && !error;
          const openCount = reachable
            ? pullRequests.filter((pullRequest) => repoMatches(repo, pullRequest.repo)).length
            : null;
          return (
            <article
              key={`${repo.remote}:${repo.name}`}
              className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/15 sm:px-6 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,0.55fr)_minmax(10rem,0.45fr)] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {repo.name}
                  </span>
                  {repo.default ? <Badge variant="success">Default</Badge> : null}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {repo.remote}
                </p>
              </div>

              <div className="flex items-start gap-2 border-l border-border/60 pl-4">
                {loading ? (
                  <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : error || requestError ? (
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : reachable ? (
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                ) : (
                  <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {loading
                      ? "Checking GitHub"
                      : error
                        ? "Connection needs attention"
                        : requestError
                          ? "Status unavailable"
                          : reachable
                            ? "GitHub reachable"
                            : "Status not reported"}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {error?.message ??
                      requestError ??
                      (loading
                        ? "Fetching repository and pull request status."
                        : reachable
                          ? "Repository status is reporting normally."
                          : "No repository health result is available yet.")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-l border-border/60 pl-4">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GitPullRequestIcon className="size-3.5" /> Open PRs
                </span>
                <span className="font-mono text-sm tabular-nums text-foreground">
                  {openCount ?? "—"}
                </span>
              </div>
            </article>
          );
        })}

        {repos.length === 0 ? (
          <button
            type="button"
            onClick={onAddRepository}
            className="flex w-full items-center justify-center gap-2 px-6 py-10 text-sm text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
          >
            <PlusIcon className="size-4" />
            Connect the first repository
          </button>
        ) : null}
      </div>
    </section>
  );
}
