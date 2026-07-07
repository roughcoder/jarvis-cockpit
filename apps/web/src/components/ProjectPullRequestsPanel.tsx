import type { EnvironmentId, ProjectPullRequest } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useEffect, useRef, useState } from "react";
import {
  GitPullRequestIcon,
  LoaderIcon,
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
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Open pull requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pullRequests.length === 0
              ? "No open pull requests across the linked repositories."
              : `${pullRequests.length} open across the linked repositories.`}
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
      </div>

      {requestError ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
          <TriangleAlertIcon className="size-4 shrink-0" />
          {requestError}
        </p>
      ) : null}

      {repoErrors.length > 0 ? (
        <div className="mt-3 space-y-1">
          {repoErrors.map((error) => (
            <p key={error.repo} className="flex items-center gap-2 text-xs text-muted-foreground">
              <TriangleAlertIcon className="size-3 shrink-0 text-amber-500" />
              {error.repo}: {error.message}
            </p>
          ))}
        </div>
      ) : null}

      {pullRequests.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {pullRequests.map((pullRequest) => {
            const updatedLabel = pullRequestUpdatedLabel(pullRequest);
            const key = pullRequestKey(pullRequest);
            return (
              <li
                key={key}
                className="rounded-md border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/20"
              >
                <div className="flex items-start gap-3">
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
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {pullRequest.repo} #{pullRequest.number}
                        {pullRequest.author ? ` · ${pullRequest.author}` : ""}
                        {updatedLabel ? ` · ${updatedLabel}` : ""}
                      </span>
                    </span>
                  </button>
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
    </div>
  );
}
