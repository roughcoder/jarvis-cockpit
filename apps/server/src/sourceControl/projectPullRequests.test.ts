import { assert, it, afterEach, describe, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";
import { VcsProcessExitError } from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "./GitHubCli.ts";
import { parseGitHubRepoRemote, ProjectPullRequests } from "./projectPullRequests.ts";

const processOutput = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

const mockRun = vi.fn<VcsProcess.VcsProcess["Service"]["run"]>();

const layer = ProjectPullRequests.layer.pipe(
  Layer.provide(GitHubCli.layer),
  Layer.provide(
    Layer.mock(VcsProcess.VcsProcess)({
      run: mockRun,
    }),
  ),
);

afterEach(() => {
  mockRun.mockReset();
});

const openPullRequestJson = (number: number, overrides: Record<string, unknown> = {}) =>
  JSON.stringify([
    {
      number,
      title: `PR ${number}`,
      url: `https://github.com/acme/widgets/pull/${number}`,
      baseRefName: "main",
      headRefName: `feature-${number}`,
      state: "OPEN",
      mergedAt: null,
      updatedAt: "2026-07-01T10:00:00Z",
      createdAt: "2026-06-30T09:00:00Z",
      isDraft: false,
      author: { login: "octocat" },
      ...overrides,
    },
  ]);

describe("parseGitHubRepoRemote", () => {
  it("accepts owner/name slugs", () => {
    assert.deepEqual(parseGitHubRepoRemote("acme/widgets"), { owner: "acme", name: "widgets" });
  });

  it("accepts https remotes with and without .git", () => {
    assert.deepEqual(parseGitHubRepoRemote("https://github.com/acme/widgets"), {
      owner: "acme",
      name: "widgets",
    });
    assert.deepEqual(parseGitHubRepoRemote("https://github.com/acme/widgets.git"), {
      owner: "acme",
      name: "widgets",
    });
  });

  it("accepts ssh remotes", () => {
    assert.deepEqual(parseGitHubRepoRemote("git@github.com:acme/widgets.git"), {
      owner: "acme",
      name: "widgets",
    });
    assert.deepEqual(parseGitHubRepoRemote("ssh://git@github.com/acme/widgets.git"), {
      owner: "acme",
      name: "widgets",
    });
  });

  it("rejects non-GitHub hosts and malformed remotes", () => {
    assert.isNull(parseGitHubRepoRemote("https://gitlab.com/acme/widgets"));
    assert.isNull(parseGitHubRepoRemote("git@gitlab.com:acme/widgets.git"));
    assert.isNull(parseGitHubRepoRemote("acme"));
    assert.isNull(parseGitHubRepoRemote("acme/widgets/extra"));
    assert.isNull(parseGitHubRepoRemote(""));
  });

  it("rejects path-traversal and argument-injection segments", () => {
    assert.isNull(parseGitHubRepoRemote("../x"));
    assert.isNull(parseGitHubRepoRemote("a/.."));
    assert.isNull(parseGitHubRepoRemote("./x"));
    assert.isNull(parseGitHubRepoRemote("a/b c"));
    assert.isNull(parseGitHubRepoRemote("a/b;rm -rf"));
  });
});

describe("ProjectPullRequests.layer", () => {
  it.effect("lists pull requests across repos and maps records", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(Effect.succeed(processOutput(openPullRequestJson(7))));

      const service = yield* ProjectPullRequests;
      const result = yield* service.list({
        cwd: "/tmp",
        repos: [{ name: "widgets", remote: "acme/widgets", default: true }],
      });

      assert.lengthOf(result.errors, 0);
      assert.lengthOf(result.pullRequests, 1);
      const pullRequest = result.pullRequests[0];
      assert.ok(pullRequest);
      assert.strictEqual(pullRequest.repo, "acme/widgets");
      assert.strictEqual(pullRequest.number, 7);
      assert.strictEqual(pullRequest.author, "octocat");
      assert.strictEqual(pullRequest.isDraft, false);
      assert.isTrue(Option.isSome(pullRequest.updatedAt));

      const call = mockRun.mock.calls[0]?.[0];
      assert.ok(call);
      assert.include(call.args, "--repo");
      assert.include(call.args, "acme/widgets");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("isolates per-repo failures and reports unparseable remotes", () =>
    Effect.gen(function* () {
      mockRun.mockImplementation((input) =>
        input.args.includes("acme/widgets")
          ? Effect.succeed(processOutput(openPullRequestJson(3)))
          : Effect.fail(
              new VcsProcessExitError({
                operation: "GitHubCli.execute",
                command: "gh",
                cwd: "/tmp",
                exitCode: 1,
                detail: "Process exited with a non-zero status.",
                failureKind: "command-failed",
              }),
            ),
      );

      const service = yield* ProjectPullRequests;
      const result = yield* service.list({
        cwd: "/tmp",
        repos: [
          { name: "widgets", remote: "acme/widgets", default: true },
          { name: "broken", remote: "acme/broken", default: false },
          { name: "elsewhere", remote: "https://gitlab.com/acme/elsewhere", default: false },
        ],
      });

      assert.lengthOf(result.pullRequests, 1);
      assert.lengthOf(result.errors, 2);
      const errorRepos = result.errors.map((error) => error.repo);
      assert.include(errorRepos, "acme/broken");
      assert.include(errorRepos, "https://gitlab.com/acme/elsewhere");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("serves cached results within the TTL without re-running gh", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValue(Effect.succeed(processOutput(openPullRequestJson(9))));

      const service = yield* ProjectPullRequests;
      const repos = [{ name: "widgets", remote: "acme/widgets", default: true }];
      yield* service.list({ cwd: "/tmp", repos });
      yield* service.list({ cwd: "/tmp", repos });

      assert.strictEqual(mockRun.mock.calls.length, 1);
    }).pipe(Effect.provide(layer)),
  );
});
