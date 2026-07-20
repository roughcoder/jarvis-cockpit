import { assert, describe, it } from "@effect/vitest";
import * as Result from "effect/Result";

import {
  decodeGitHubPullRequestJson,
  decodeGitHubRepositoryPullRequestListJson,
} from "./gitHubPullRequests.ts";

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

describe("GitHub repository pull request summaries", () => {
  it("decodes aggregate counts and latest-commit check state", () => {
    const result = decodeGitHubRepositoryPullRequestListJson(
      JSON.stringify({
        data: {
          repository: {
            pullRequests: {
              nodes: [
                {
                  number: 64,
                  title: "Keep PR summaries compact",
                  url: "https://github.com/acme/widgets/pull/64",
                  baseRefName: "main",
                  headRefName: "compact-prs",
                  state: "OPEN",
                  updatedAt: "2026-07-20T10:00:00Z",
                  createdAt: "2026-07-19T10:00:00Z",
                  isDraft: false,
                  author: { login: "octocat" },
                  comments: { totalCount: 3 },
                  reviews: { totalCount: 2 },
                  reviewDecision: "CHANGES_REQUESTED",
                  commits: {
                    nodes: [
                      {
                        commit: {
                          statusCheckRollup: {
                            state: "SUCCESS",
                            contexts: {
                              totalCount: 2,
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      }),
    );

    assert.isTrue(Result.isSuccess(result));
    if (Result.isFailure(result)) {
      throw new Error("Expected repository pull request JSON to decode.");
    }
    const pullRequest = result.success[0];
    assert.ok(pullRequest);
    assert.strictEqual(pullRequest.number, 64);
    assert.strictEqual(pullRequest.commentCount, 3);
    assert.strictEqual(pullRequest.reviewCount, 2);
    assert.strictEqual(pullRequest.reviewDecision, "changes_requested");
    assert.strictEqual(pullRequest.checksStatus, "passing");
    assert.strictEqual(pullRequest.checksCount, 2);
  });

  it("normalizes aggregate failing, pending, and missing check states", () => {
    const pullRequest = (number: number, statusCheckRollup: unknown) => ({
      number,
      title: `Pull request ${number}`,
      url: `https://github.com/acme/widgets/pull/${number}`,
      baseRefName: "main",
      headRefName: `branch-${number}`,
      state: "OPEN",
      updatedAt: "2026-07-20T10:00:00Z",
      createdAt: "2026-07-19T10:00:00Z",
      isDraft: false,
      author: { login: "octocat" },
      comments: { totalCount: 0 },
      reviews: { totalCount: 0 },
      reviewDecision: null,
      commits: { nodes: [{ commit: { statusCheckRollup } }] },
    });
    const result = decodeGitHubRepositoryPullRequestListJson(
      JSON.stringify({
        data: {
          repository: {
            pullRequests: {
              nodes: [
                pullRequest(1, { state: "FAILURE", contexts: { totalCount: 3 } }),
                pullRequest(2, { state: "PENDING", contexts: { totalCount: 2 } }),
                pullRequest(3, null),
              ],
            },
          },
        },
      }),
    );

    assert.isTrue(Result.isSuccess(result));
    if (Result.isFailure(result)) {
      throw new Error("Expected aggregate check states to decode.");
    }
    assert.deepEqual(
      result.success.map(({ checksStatus, checksCount }) => ({ checksStatus, checksCount })),
      [
        { checksStatus: "failing", checksCount: 3 },
        { checksStatus: "pending", checksCount: 2 },
        { checksStatus: "not_reported", checksCount: 0 },
      ],
    );
  });

  it("rejects a missing or inaccessible GitHub repository", () => {
    const result = decodeGitHubRepositoryPullRequestListJson(
      JSON.stringify({ data: { repository: null } }),
    );

    assert.isTrue(Result.isFailure(result));
  });
});
