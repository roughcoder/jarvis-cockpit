import type { ProjectPullRequest } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { diffNewPullRequests, pullRequestKey } from "./ProjectPullRequestsPanel.logic";

function makePullRequest(repo: string, number: number): ProjectPullRequest {
  return {
    repo,
    number,
    title: `PR ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    baseRefName: "main",
    headRefName: `feature-${number}`,
    isDraft: false,
    updatedAt: Option.none(),
    createdAt: Option.none(),
  };
}

describe("pullRequestKey", () => {
  it("combines repo and number", () => {
    expect(pullRequestKey(makePullRequest("owner/repo", 12))).toBe("owner/repo#12");
  });
});

describe("diffNewPullRequests", () => {
  it("seeds without reporting additions on first load", () => {
    const result = diffNewPullRequests(null, [makePullRequest("owner/repo", 1)]);
    expect(result.added).toEqual([]);
    expect([...result.seen]).toEqual(["owner/repo#1"]);
  });

  it("reports pull requests that were not previously seen", () => {
    const first = diffNewPullRequests(null, [makePullRequest("owner/repo", 1)]);
    const next = diffNewPullRequests(first.seen, [
      makePullRequest("owner/repo", 1),
      makePullRequest("owner/repo", 2),
      makePullRequest("other/repo", 1),
    ]);
    expect(next.added.map(pullRequestKey)).toEqual(["owner/repo#2", "other/repo#1"]);
  });

  it("retains keys for PRs that transiently disappear so recovery does not re-notify", () => {
    const first = diffNewPullRequests(null, [
      makePullRequest("owner/repo", 1),
      makePullRequest("owner/repo", 2),
    ]);
    // A transient per-repo listing error drops PR #2 from one poll.
    const afterError = diffNewPullRequests(first.seen, [makePullRequest("owner/repo", 1)]);
    expect(afterError.added).toEqual([]);
    expect(afterError.seen.has("owner/repo#2")).toBe(true);

    // When the repo recovers, #2 is not reported as new again.
    const afterRecovery = diffNewPullRequests(afterError.seen, [
      makePullRequest("owner/repo", 1),
      makePullRequest("owner/repo", 2),
    ]);
    expect(afterRecovery.added).toEqual([]);
  });
});
