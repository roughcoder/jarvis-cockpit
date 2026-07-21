import type { EnvironmentId, JarvisProjectId, ProjectPullRequest } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import {
  aggregatePullRequestProjectState,
  aggregatePullRequestStates,
  pullRequestProjectSourceKey,
  type PullRequestProjectSource,
} from "./PullRequestsPage.logic";

function source(projectId: string, projectName: string): PullRequestProjectSource {
  return {
    environmentId: "environment-1" as EnvironmentId,
    environmentLabel: "Local",
    project: { id: projectId as JarvisProjectId, name: projectName },
  };
}

function pullRequest(input: {
  repo: string;
  number: number;
  updatedAt?: string;
}): ProjectPullRequest {
  return {
    repo: input.repo,
    number: input.number,
    title: `PR ${input.number}`,
    url: `https://github.com/${input.repo}/pull/${input.number}`,
    baseRefName: "main",
    headRefName: `feature-${input.number}`,
    isDraft: false,
    updatedAt: input.updatedAt ? Option.some(DateTime.makeUnsafe(input.updatedAt)) : Option.none(),
    createdAt: Option.none(),
  };
}

describe("aggregatePullRequestProjectState", () => {
  it("keeps project ownership on entries and scopes repo errors to that project", () => {
    const project = source("alpha", "Alpha");
    const state = aggregatePullRequestProjectState({
      source: project,
      pullRequests: [pullRequest({ repo: "acme/alpha", number: 7 })],
      repoErrors: [{ repo: "acme/secondary", message: "GitHub is unavailable" }],
      requestError: null,
      isPending: false,
    });

    expect(state.entries[0]).toMatchObject({
      environmentId: "environment-1",
      project: { id: "alpha", name: "Alpha" },
      pullRequest: { repo: "acme/alpha", number: 7 },
    });
    expect(state.errors).toEqual([
      {
        key: "environment-1:alpha:acme/secondary",
        label: "Alpha · acme/secondary",
        message: "GitHub is unavailable",
      },
    ]);
  });
});

describe("aggregatePullRequestStates", () => {
  it("combines every expected project and orders pull requests by recent activity", () => {
    const alpha = source("alpha", "Alpha");
    const beta = source("beta", "Beta");
    const alphaKey = pullRequestProjectSourceKey(alpha);
    const betaKey = pullRequestProjectSourceKey(beta);
    const states = new Map([
      [
        alphaKey,
        aggregatePullRequestProjectState({
          source: alpha,
          pullRequests: [
            pullRequest({ repo: "acme/alpha", number: 1, updatedAt: "2026-07-18T08:00:00Z" }),
          ],
          repoErrors: [],
          requestError: null,
          isPending: false,
        }),
      ],
      [
        betaKey,
        aggregatePullRequestProjectState({
          source: beta,
          pullRequests: [
            pullRequest({ repo: "acme/beta", number: 2, updatedAt: "2026-07-20T08:00:00Z" }),
          ],
          repoErrors: [],
          requestError: null,
          isPending: false,
        }),
      ],
    ]);

    const aggregate = aggregatePullRequestStates(new Set([alphaKey, betaKey]), states);

    expect(aggregate.entries.map((entry) => entry.pullRequest.repo)).toEqual([
      "acme/beta",
      "acme/alpha",
    ]);
    expect(aggregate.isPending).toBe(false);
  });

  it("stays pending until every expected project has reported", () => {
    const alpha = source("alpha", "Alpha");
    const beta = source("beta", "Beta");
    const alphaKey = pullRequestProjectSourceKey(alpha);
    const betaKey = pullRequestProjectSourceKey(beta);

    const aggregate = aggregatePullRequestStates(
      new Set([alphaKey, betaKey]),
      new Map([
        [
          alphaKey,
          aggregatePullRequestProjectState({
            source: alpha,
            pullRequests: [],
            repoErrors: [],
            requestError: null,
            isPending: false,
          }),
        ],
      ]),
    );

    expect(aggregate.isPending).toBe(true);
  });
});
