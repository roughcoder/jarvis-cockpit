import type { EnvironmentId, ProjectPullRequest } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  ExternalLinkIcon,
  FolderGit2Icon,
  GitPullRequestIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  ScanEyeIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  aggregatePullRequestProjectState,
  aggregatePullRequestStates,
  pullRequestProjectSourceKey,
  type PullRequestProjectSource,
  type PullRequestProjectState,
  type PullRequestSourceError,
} from "./PullRequestsPage.logic";
import { PrReviewDialog } from "./PrReviewDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { isJarvisCockpitEnvironment } from "../jarvisCockpit";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { serverEnvironment } from "../state/server";
import { useEnvironments } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { formatRelativeTimeLabel } from "../timestampFormat";

const REFRESH_INTERVAL_MS = 60_000;

interface EnvironmentDiscoveryState {
  readonly error: PullRequestSourceError | null;
  readonly isPending: boolean;
  readonly sourceKeys: ReadonlySet<string>;
}

interface ReviewTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly repo: string;
  readonly prNumber: number;
}

function pullRequestUpdatedLabel(pullRequest: ProjectPullRequest): string | null {
  const updatedAt = Option.getOrNull(pullRequest.updatedAt);
  return updatedAt === null ? null : formatRelativeTimeLabel(DateTime.formatIso(updatedAt));
}

function reviewDecisionLabel(pullRequest: ProjectPullRequest): string {
  if (pullRequest.reviewDecision === "approved") return "Approved";
  if (pullRequest.reviewDecision === "changes_requested") return "Changes requested";
  if (pullRequest.reviewDecision === "review_required") return "Review required";
  return "Review not reported";
}

function CheckStatusIcon({ status }: { readonly status: ProjectPullRequest["checksStatus"] }) {
  if (status === "passing") return <CircleCheckIcon className="size-3.5 text-emerald-500" />;
  if (status === "failing") return <CircleXIcon className="size-3.5 text-destructive" />;
  return <CircleDashedIcon className="size-3.5 text-muted-foreground" />;
}

export function PullRequestsPage() {
  const { environments } = useEnvironments();
  const jarvisEnvironments = useMemo(
    () =>
      environments.filter((environment) =>
        isJarvisCockpitEnvironment(environment.serverConfig ?? undefined),
      ),
    [environments],
  );
  const [projectStates, setProjectStates] = useState<ReadonlyMap<string, PullRequestProjectState>>(
    () => new Map(),
  );
  const [discoveryStates, setDiscoveryStates] = useState<
    ReadonlyMap<EnvironmentId, EnvironmentDiscoveryState>
  >(() => new Map());
  const [refreshToken, setRefreshToken] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const openPrLink = useOpenPrLink();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) setRefreshToken((current) => current + 1);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const reportDiscovery = useCallback(
    (environmentId: EnvironmentId, state: EnvironmentDiscoveryState) => {
      setDiscoveryStates((current) => {
        const next = new Map(current);
        next.set(environmentId, state);
        return next;
      });
    },
    [],
  );
  const reportProjectState = useCallback((key: string, state: PullRequestProjectState) => {
    setProjectStates((current) => {
      const next = new Map(current);
      next.set(key, state);
      return next;
    });
  }, []);

  useEffect(() => {
    const environmentIds = new Set(jarvisEnvironments.map(({ environmentId }) => environmentId));
    setDiscoveryStates((current) => {
      const next = new Map(
        [...current].filter(([environmentId]) => environmentIds.has(environmentId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [jarvisEnvironments]);

  const expectedSourceKeys = useMemo(
    () => new Set([...discoveryStates.values()].flatMap((discovery) => [...discovery.sourceKeys])),
    [discoveryStates],
  );
  const aggregate = useMemo(
    () => aggregatePullRequestStates(expectedSourceKeys, projectStates),
    [expectedSourceKeys, projectStates],
  );
  const discoveryErrors = [...discoveryStates.values()]
    .map((state) => state.error)
    .filter((error): error is PullRequestSourceError => error !== null);
  const errors = [...discoveryErrors, ...aggregate.errors];
  const isPending =
    discoveryStates.size < jarvisEnvironments.length ||
    [...discoveryStates.values()].some((state) => state.isPending) ||
    aggregate.isPending;
  const commentCount = aggregate.entries.reduce(
    (total, entry) => total + (entry.pullRequest.commentCount ?? 0),
    0,
  );
  const reviewCount = aggregate.entries.reduce(
    (total, entry) => total + (entry.pullRequest.reviewCount ?? 0),
    0,
  );
  const projectCount = expectedSourceKeys.size;

  return (
    <>
      {jarvisEnvironments.map((environment) => (
        <PullRequestsEnvironmentSource
          key={environment.environmentId}
          environmentId={environment.environmentId}
          environmentLabel={environment.label}
          refreshToken={refreshToken}
          onDiscovery={reportDiscovery}
          onProjectState={reportProjectState}
        />
      ))}

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto w-full max-w-[94rem] px-4 pb-16 pt-8 sm:px-7 sm:pt-10 lg:px-10 lg:pb-24">
          <header className="flex flex-col gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Review queue
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
                Pull requests
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Open work across every repository linked to your Jarvis projects. Open the source,
                return to its project, or start the review routine in place.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRefreshToken((current) => current + 1)}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              Refresh all
            </Button>
          </header>

          <section className="grid border-b border-border/70 sm:grid-cols-3">
            {[
              ["Open", aggregate.entries.length],
              ["Projects", projectCount],
              ["Activity", commentCount + reviewCount],
            ].map(([label, value], index) => (
              <div
                key={String(label)}
                className={`py-5 ${index > 0 ? "border-t border-border/60 sm:border-l sm:border-t-0 sm:pl-6" : ""}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">
                  {value}
                </p>
              </div>
            ))}
          </section>

          {errors.length > 0 ? (
            <div className="mt-6 divide-y divide-amber-500/15 border-y border-amber-500/20 bg-amber-500/5">
              {errors.map((error) => (
                <p key={error.key} className="flex items-start gap-2 px-3 py-2.5 text-xs">
                  <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <span className="font-medium text-foreground">{error.label}</span>
                    <span className="text-muted-foreground"> · {error.message}</span>
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {aggregate.entries.length > 0 ? (
            <section aria-label="Open pull requests" className="mt-8">
              <div className="divide-y divide-border/65 border-y border-border/70">
                {aggregate.entries.map((entry) => {
                  const { pullRequest, project } = entry;
                  const updatedLabel = pullRequestUpdatedLabel(pullRequest);
                  return (
                    <article
                      key={`${entry.environmentId}:${project.id}:${pullRequest.repo}:${pullRequest.number}`}
                      className="grid gap-4 px-1 py-5 transition-colors hover:bg-muted/20 sm:px-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <GitPullRequestIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={(event) => openPrLink(event, pullRequest.url)}
                            className="group/title flex max-w-full items-center gap-1.5 text-left"
                          >
                            <span className="truncate text-sm font-medium text-foreground group-hover/title:underline">
                              {pullRequest.title}
                            </span>
                            <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground/60" />
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <Link
                              to="/jarvis-project/$environmentId/$projectId"
                              params={{
                                environmentId: entry.environmentId,
                                projectId: String(project.id),
                              }}
                              className="inline-flex items-center gap-1 font-medium text-foreground/80 hover:text-foreground hover:underline"
                            >
                              <FolderGit2Icon className="size-3" />
                              {project.name}
                            </Link>
                            <span aria-hidden="true">·</span>
                            <span>{pullRequest.repo}</span>
                            <span>#{pullRequest.number}</span>
                            {jarvisEnvironments.length > 1 ? (
                              <span>· {entry.environmentLabel}</span>
                            ) : null}
                            {pullRequest.author ? <span>· {pullRequest.author}</span> : null}
                            {updatedLabel ? <span>· {updatedLabel}</span> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {pullRequest.isDraft ? <Badge variant="outline">Draft</Badge> : null}
                            <Badge variant="outline" className="gap-1.5 font-normal">
                              <MessageSquareTextIcon className="size-3" />
                              {pullRequest.commentCount ?? 0} comments
                            </Badge>
                            <Badge variant="outline" className="font-normal">
                              {pullRequest.reviewCount ?? 0} reviews
                            </Badge>
                            <Badge
                              variant={
                                pullRequest.reviewDecision === "approved" ? "success" : "outline"
                              }
                              className="font-normal"
                            >
                              {reviewDecisionLabel(pullRequest)}
                            </Badge>
                            <Badge variant="outline" className="gap-1.5 font-normal">
                              <CheckStatusIcon status={pullRequest.checksStatus} />
                              {pullRequest.checksStatus === "passing"
                                ? `${pullRequest.checksCount ?? 0} checks passing`
                                : pullRequest.checksStatus === "failing"
                                  ? "Checks failing"
                                  : pullRequest.checksStatus === "pending"
                                    ? "Checks pending"
                                    : "Checks not reported"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="justify-self-start lg:justify-self-end"
                        onClick={() =>
                          setReviewTarget({
                            environmentId: entry.environmentId,
                            projectId: String(project.id),
                            repo: pullRequest.repo,
                            prNumber: pullRequest.number,
                          })
                        }
                      >
                        <ScanEyeIcon className="size-3.5" />
                        Run routine
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : isPending ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Reading project repositories
            </div>
          ) : jarvisEnvironments.length === 0 ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyTitle>No Jarvis environment connected</EmptyTitle>
                <EmptyDescription>
                  Connect a Jarvis Cockpit environment to load project pull requests.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : errors.length > 0 ? (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyTitle>Pull request queue unavailable</EmptyTitle>
                <EmptyDescription>
                  Cockpit could not read every linked repository. Review the errors above and try
                  refreshing the queue.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty className="min-h-80">
              <EmptyHeader>
                <EmptyTitle>No open pull requests</EmptyTitle>
                <EmptyDescription>
                  Linked repositories are clear. New pull requests will appear here automatically.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </main>

      {reviewTarget ? (
        <PrReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewTarget(null);
          }}
          environmentId={reviewTarget.environmentId}
          projectId={reviewTarget.projectId}
          repo={reviewTarget.repo}
          prNumber={reviewTarget.prNumber}
        />
      ) : null}
    </>
  );
}

function PullRequestsEnvironmentSource({
  environmentId,
  environmentLabel,
  refreshToken,
  onDiscovery,
  onProjectState,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly refreshToken: number;
  readonly onDiscovery: (environmentId: EnvironmentId, state: EnvironmentDiscoveryState) => void;
  readonly onProjectState: (key: string, state: PullRequestProjectState) => void;
}) {
  const projectsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjects({
      environmentId,
      input: { includeArchived: false },
    }),
  );
  const projects = useMemo(
    () => (projectsQuery.data?.ok === true ? (projectsQuery.data.projects ?? []) : []),
    [projectsQuery.data],
  );
  const sources = useMemo(
    () =>
      projects.map(
        (project): PullRequestProjectSource => ({
          environmentId,
          environmentLabel,
          project,
        }),
      ),
    [environmentId, environmentLabel, projects],
  );
  const sourceKeys = useMemo(() => new Set(sources.map(pullRequestProjectSourceKey)), [sources]);
  const requestError =
    projectsQuery.error ??
    (projectsQuery.data?.ok === false
      ? (projectsQuery.data.error?.message ?? "Could not list Jarvis projects.")
      : null);

  useEffect(() => {
    onDiscovery(environmentId, {
      sourceKeys,
      isPending: projectsQuery.isPending,
      error: requestError
        ? {
            key: `${environmentId}:projects`,
            label: environmentLabel,
            message: requestError,
          }
        : null,
    });
  }, [
    environmentId,
    environmentLabel,
    onDiscovery,
    projectsQuery.isPending,
    requestError,
    sourceKeys,
  ]);

  useEffect(() => {
    if (refreshToken > 0) projectsQuery.refresh();
  }, [projectsQuery.refresh, refreshToken]);

  return sources.map((source) => (
    <PullRequestProjectSourceLoader
      key={pullRequestProjectSourceKey(source)}
      source={source}
      refreshToken={refreshToken}
      onState={onProjectState}
    />
  ));
}

function PullRequestProjectSourceLoader({
  source,
  refreshToken,
  onState,
}: {
  readonly source: PullRequestProjectSource;
  readonly refreshToken: number;
  readonly onState: (key: string, state: PullRequestProjectState) => void;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.jarvisProjectPullRequests({
      environmentId: source.environmentId,
      input: { projectId: String(source.project.id) },
    }),
  );
  const state = useMemo(() => {
    const result = query.data;
    return aggregatePullRequestProjectState({
      source,
      pullRequests: result?.ok === true ? (result.pullRequests ?? []) : [],
      repoErrors: result?.ok === true ? (result.errors ?? []) : [],
      requestError:
        query.error ??
        (result?.ok === false
          ? (result.error?.message ?? "Could not list project pull requests.")
          : null),
      isPending: query.isPending,
    });
  }, [query.data, query.error, query.isPending, source]);
  const key = pullRequestProjectSourceKey(source);

  useEffect(() => onState(key, state), [key, onState, state]);
  useEffect(() => {
    if (refreshToken > 0) query.refresh();
  }, [query.refresh, refreshToken]);

  return null;
}
