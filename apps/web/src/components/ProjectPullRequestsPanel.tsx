import type { EnvironmentId, ProjectPullRequest } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useEffect, useRef, useState } from "react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  GitPullRequestIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  RefreshCwIcon,
  ScanEyeIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { diffNewPullRequests, pullRequestKey } from "./ProjectPullRequestsPanel.logic";
import { PrReviewDialog } from "./PrReviewDialog";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { toastManager } from "./ui/toast";

const REFRESH_INTERVAL_MS = 60_000;

interface ProjectPullRequestsPanelProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
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

export function ProjectPullRequestsPanel({
  environmentId,
  projectId,
}: ProjectPullRequestsPanelProps) {
  const pullRequestsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectPullRequests({
      environmentId,
      input: { projectId },
    }),
  );
  const openPrLink = useOpenPrLink();
  const refresh = pullRequestsQuery.refresh;
  const [reviewTarget, setReviewTarget] = useState<{ repo: string; prNumber: number } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        refresh();
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const result = pullRequestsQuery.data;
  const pullRequests = result?.ok === true ? (result.pullRequests ?? []) : [];
  const repoErrors = result?.ok === true ? (result.errors ?? []) : [];
  const requestError =
    pullRequestsQuery.error ?? (result?.ok === false ? (result.error?.message ?? null) : null);
  const commentCount = pullRequests.reduce(
    (total, pullRequest) => total + (pullRequest.commentCount ?? 0),
    0,
  );
  const reviewCount = pullRequests.reduce(
    (total, pullRequest) => total + (pullRequest.reviewCount ?? 0),
    0,
  );

  const seenKeysRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (result?.ok !== true) {
      return;
    }
    const { seen, added } = diffNewPullRequests(seenKeysRef.current, result.pullRequests ?? []);
    seenKeysRef.current = seen;
    for (const pullRequest of added) {
      toastManager.add({
        type: "info",
        title: `New PR in ${pullRequest.repo}`,
        description: `#${pullRequest.number} ${pullRequest.title}`,
      });
    }
  }, [result]);

  return (
    <section className="project-control-deck-enter overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Review surface
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Open pull requests
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {pullRequests.length === 0
              ? "No open pull requests across the linked repositories."
              : `${pullRequests.length} open · ${commentCount} comments · ${reviewCount} reviews`}
          </p>
        </div>
        <Button
          size="xs"
          variant="outline"
          onClick={refresh}
          disabled={pullRequestsQuery.isPending}
        >
          {pullRequestsQuery.isPending ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3" />
          )}
          Refresh
        </Button>
      </header>

      {requestError ? (
        <p className="flex items-center gap-2 border-b border-border/60 bg-destructive/5 px-5 py-3 text-sm text-destructive sm:px-6">
          <TriangleAlertIcon className="size-4 shrink-0" />
          {requestError}
        </p>
      ) : null}

      {repoErrors.length > 0 ? (
        <div className="space-y-1 border-b border-border/60 bg-amber-500/5 px-5 py-3 sm:px-6">
          {repoErrors.map((error) => (
            <p key={error.repo} className="flex items-center gap-2 text-xs text-muted-foreground">
              <TriangleAlertIcon className="size-3 shrink-0 text-amber-500" />
              {error.repo}: {error.message}
            </p>
          ))}
        </div>
      ) : null}

      {pullRequests.length > 0 ? (
        <ul className="divide-y divide-border/60">
          {pullRequests.map((pullRequest) => {
            const updatedLabel = pullRequestUpdatedLabel(pullRequest);
            const key = pullRequestKey(pullRequest);
            return (
              <li
                key={key}
                className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/15 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    type="button"
                    onClick={(event) => openPrLink(event, pullRequest.url)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <GitPullRequestIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {pullRequest.title}
                        </span>
                        {pullRequest.isDraft ? (
                          <Badge variant="outline" className="shrink-0">
                            Draft
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {pullRequest.repo} #{pullRequest.number}
                        {pullRequest.author ? ` · ${pullRequest.author}` : ""}
                        {updatedLabel ? ` · ${updatedLabel}` : ""}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
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
                      </span>
                    </span>
                  </button>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="xs"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      setReviewTarget({ repo: pullRequest.repo, prNumber: pullRequest.number })
                    }
                  >
                    <ScanEyeIcon className="size-3" />
                    Review
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : requestError === null ? (
        <div className="px-5 py-8 text-sm text-muted-foreground sm:px-6">
          Nothing is waiting for review.
        </div>
      ) : null}

      {reviewTarget ? (
        <PrReviewDialog
          open={reviewTarget !== null}
          onOpenChange={(next) => {
            if (!next) {
              setReviewTarget(null);
            }
          }}
          environmentId={environmentId}
          projectId={projectId}
          repo={reviewTarget.repo}
          prNumber={reviewTarget.prNumber}
        />
      ) : null}
    </section>
  );
}
