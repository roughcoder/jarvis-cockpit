import { assert, describe, it } from "@effect/vitest";
import * as Result from "effect/Result";

import { decodeGitHubPullRequestJson } from "./gitHubPullRequests.ts";

function decodePullRequest(overrides: Record<string, unknown>) {
  const result = decodeGitHubPullRequestJson(
    JSON.stringify({
      number: 42,
      title: "Keep project reviews visible",
      url: "https://github.com/acme/widgets/pull/42",
      baseRefName: "main",
      headRefName: "project-reviews",
      state: "OPEN",
      mergedAt: null,
      ...overrides,
    }),
  );
  assert.isTrue(Result.isSuccess(result));
  if (Result.isFailure(result)) {
    throw new Error("Expected pull request JSON to decode.");
  }
  return result.success;
}

describe("GitHub pull request review status", () => {
  it("keeps comment and review counts separate", () => {
    const pullRequest = decodePullRequest({
      comments: [{ id: "comment-1" }, { id: "comment-2" }],
      reviews: [{ id: "review-1" }],
      reviewDecision: "CHANGES_REQUESTED",
    });

    assert.strictEqual(pullRequest.commentCount, 2);
    assert.strictEqual(pullRequest.reviewCount, 1);
    assert.strictEqual(pullRequest.reviewDecision, "changes_requested");
  });

  it("does not inject review fields when GitHub did not return them", () => {
    const pullRequest = decodePullRequest({});

    assert.notProperty(pullRequest, "commentCount");
    assert.notProperty(pullRequest, "reviewCount");
    assert.notProperty(pullRequest, "reviewDecision");
    assert.notProperty(pullRequest, "checksStatus");
  });

  it("treats startup failures and stale checks as failing", () => {
    const startupFailure = decodePullRequest({
      statusCheckRollup: [{ conclusion: "STARTUP_FAILURE" }],
    });
    const stale = decodePullRequest({ statusCheckRollup: [{ conclusion: "STALE" }] });

    assert.strictEqual(startupFailure.checksStatus, "failing");
    assert.strictEqual(stale.checksStatus, "failing");
  });

  it("only reports checks passing for successful terminal conclusions", () => {
    const passing = decodePullRequest({
      statusCheckRollup: [{ conclusion: "SUCCESS" }, { conclusion: "SKIPPED" }],
    });
    const unknown = decodePullRequest({
      statusCheckRollup: [{ status: "COMPLETED", conclusion: null }],
    });

    assert.strictEqual(passing.checksStatus, "passing");
    assert.strictEqual(passing.checksCount, 2);
    assert.strictEqual(unknown.checksStatus, "pending");
  });
});
