import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import type { JarvisProjectRepository, ProjectPullRequest } from "@t3tools/contracts";

import { GitHubCli } from "./GitHubCli.ts";
import type { NormalizedGitHubPullRequestRecord } from "./gitHubPullRequests.ts";
import { transportSafeSourceControlErrorValue } from "./SourceControlProvider.ts";

const PULL_REQUEST_LIST_LIMIT = 50;
const CACHE_TTL_MS = 25_000;
const REPO_CONCURRENCY = 4;

export interface ProjectPullRequestsListResult {
  readonly pullRequests: ReadonlyArray<ProjectPullRequest>;
  readonly errors: ReadonlyArray<{ readonly repo: string; readonly message: string }>;
}

/**
 * Parses a Jarvis project repository remote into a GitHub `owner/name` slug.
 * Accepts plain `owner/name`, https URLs, and ssh remotes. Returns null for
 * remotes that do not resolve to a GitHub repository slug.
 */
export function parseGitHubRepoRemote(remote: string): { owner: string; name: string } | null {
  const trimmed = remote.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const stripGitSuffix = (value: string) => value.replace(/\.git$/u, "");

  // GitHub owner and repository names use a restricted character set. Enforcing
  // it here keeps `.`/`..` and leading-dash segments (path traversal into the
  // `gh api` REST path, argument injection into `gh` positionals) out of every
  // consumer of a parsed slug.
  const isValidSegment = (segment: string): boolean =>
    segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/u.test(segment);

  const fromPath = (path: string): { owner: string; name: string } | null => {
    const segments = stripGitSuffix(path)
      .replace(/^\/+|\/+$/gu, "")
      .split("/")
      .filter((segment) => segment.length > 0);
    if (segments.length !== 2) {
      return null;
    }
    const owner = segments[0];
    const name = segments[1];
    if (!owner || !name || !isValidSegment(owner) || !isValidSegment(name)) {
      return null;
    }
    return { owner, name };
  };

  const sshMatch = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/u.exec(trimmed);
  if (sshMatch) {
    const host = sshMatch[1] ?? "";
    const path = sshMatch[2] ?? "";
    return host.toLowerCase() === "github.com" ? fromPath(path) : null;
  }

  if (/^[a-z]+:\/\//iu.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.hostname.toLowerCase() === "github.com" ? fromPath(url.pathname) : null;
    } catch {
      return null;
    }
  }

  return fromPath(trimmed);
}

function projectPullRequestFromRecord(
  repo: string,
  record: NormalizedGitHubPullRequestRecord,
): ProjectPullRequest {
  return {
    repo,
    number: record.number,
    title: record.title,
    url: record.url,
    ...(record.authorLogin ? { author: record.authorLogin } : {}),
    baseRefName: record.baseRefName,
    headRefName: record.headRefName,
    isDraft: record.isDraft ?? false,
    commentCount: record.commentCount ?? 0,
    reviewCount: record.reviewCount ?? 0,
    reviewDecision: record.reviewDecision ?? "not_reported",
    checksStatus: record.checksStatus ?? "not_reported",
    checksCount: record.checksCount ?? 0,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt ?? Option.none(),
  };
}

interface CacheEntry {
  readonly expiresAtMs: number;
  readonly pullRequests: ReadonlyArray<ProjectPullRequest>;
}

export class ProjectPullRequests extends Context.Service<
  ProjectPullRequests,
  {
    /**
     * Lists open pull requests across the given project repositories. Repos
     * that do not parse as GitHub remotes or whose listing fails are reported
     * in `errors` instead of failing the whole request.
     */
    readonly list: (input: {
      readonly cwd: string;
      readonly repos: ReadonlyArray<JarvisProjectRepository>;
    }) => Effect.Effect<ProjectPullRequestsListResult>;
  }
>()("t3/sourceControl/projectPullRequests") {
  static readonly layer = Layer.effect(
    ProjectPullRequests,
    Effect.gen(function* () {
      const gitHubCli = yield* GitHubCli;
      // Process-global TTL cache: the service layer is built once per server
      // process, so concurrent clients polling the same project share results.
      const cache = new Map<string, CacheEntry>();

      const listRepo = Effect.fn("ProjectPullRequests.listRepo")(function* (input: {
        readonly cwd: string;
        readonly slug: string;
      }) {
        const now = yield* Clock.currentTimeMillis;
        const cached = cache.get(input.slug);
        if (cached && cached.expiresAtMs > now) {
          return cached.pullRequests;
        }
        const records = yield* gitHubCli.listRepositoryPullRequests({
          cwd: input.cwd,
          repository: input.slug,
          limit: PULL_REQUEST_LIST_LIMIT,
        });
        const pullRequests = records
          .filter((record) => record.state === "open")
          .map((record) => projectPullRequestFromRecord(input.slug, record));
        cache.set(input.slug, { expiresAtMs: now + CACHE_TTL_MS, pullRequests });
        return pullRequests;
      });

      const list: ProjectPullRequests["Service"]["list"] = Effect.fn("ProjectPullRequests.list")(
        function* (input) {
          const slugs = new Set<string>();
          const errors: Array<{ repo: string; message: string }> = [];
          for (const repo of input.repos) {
            const parsed = parseGitHubRepoRemote(repo.remote);
            if (parsed === null) {
              errors.push({
                repo: transportSafeSourceControlErrorValue(repo.remote),
                message: "Repository remote is not a recognized GitHub repository.",
              });
              continue;
            }
            slugs.add(`${parsed.owner}/${parsed.name}`);
          }

          const results = yield* Effect.forEach(
            [...slugs],
            (slug) =>
              listRepo({ cwd: input.cwd, slug }).pipe(
                Effect.map((pullRequests) => ({ slug, pullRequests })),
                Effect.catch((error) =>
                  Effect.succeed({
                    slug,
                    failure:
                      error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : "Pull request listing failed.",
                  }),
                ),
              ),
            { concurrency: REPO_CONCURRENCY },
          );

          const pullRequests: Array<ProjectPullRequest> = [];
          for (const result of results) {
            if ("failure" in result) {
              errors.push({ repo: result.slug, message: result.failure });
              continue;
            }
            pullRequests.push(...result.pullRequests);
          }

          pullRequests.sort((left, right) => {
            const leftUpdated = Option.getOrNull(left.updatedAt)?.epochMilliseconds ?? 0;
            const rightUpdated = Option.getOrNull(right.updatedAt)?.epochMilliseconds ?? 0;
            return rightUpdated - leftUpdated;
          });

          return { pullRequests, errors };
        },
      );

      return ProjectPullRequests.of({ list });
    }),
  );
}
