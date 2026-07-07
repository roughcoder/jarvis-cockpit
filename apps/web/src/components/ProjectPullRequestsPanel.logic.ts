import type { ProjectPullRequest } from "@t3tools/contracts";

export function pullRequestKey(pullRequest: Pick<ProjectPullRequest, "repo" | "number">): string {
  return `${pullRequest.repo}#${pullRequest.number}`;
}

export interface PullRequestDiffResult {
  readonly seen: ReadonlySet<string>;
  readonly added: ReadonlyArray<ProjectPullRequest>;
}

/**
 * Diffs a freshly fetched pull request list against the previously seen keys.
 *
 * The first load (`previousKeys === null`) seeds the seen set without reporting
 * additions, so mounting the panel never fires a notification storm for pull
 * requests that were already open.
 *
 * The seen set is monotonic — previously-seen keys are retained even when a PR
 * momentarily disappears from the list. Repo listing fails per-repo, so a
 * transient `gh` error drops that repo's PRs from one poll; without retention
 * they would all be re-reported as "new" when the repo recovers.
 */
export function diffNewPullRequests(
  previousKeys: ReadonlySet<string> | null,
  pullRequests: ReadonlyArray<ProjectPullRequest>,
): PullRequestDiffResult {
  const currentKeys = pullRequests.map(pullRequestKey);
  if (previousKeys === null) {
    return { seen: new Set(currentKeys), added: [] };
  }
  const seen = new Set([...previousKeys, ...currentKeys]);
  const added = pullRequests.filter(
    (pullRequest) => !previousKeys.has(pullRequestKey(pullRequest)),
  );
  return { seen, added };
}
