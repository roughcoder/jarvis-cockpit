import type {
  EnvironmentId,
  JarvisProject,
  ProjectPullRequest,
  ProjectPullRequestRepoError,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

export interface PullRequestProjectSource {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly project: Pick<JarvisProject, "id" | "name">;
}

export interface ProjectPullRequestEntry extends PullRequestProjectSource {
  readonly pullRequest: ProjectPullRequest;
}

export interface PullRequestSourceError {
  readonly key: string;
  readonly label: string;
  readonly message: string;
}

export interface PullRequestProjectState {
  readonly entries: ReadonlyArray<ProjectPullRequestEntry>;
  readonly errors: ReadonlyArray<PullRequestSourceError>;
  readonly isPending: boolean;
}

export interface PullRequestsAggregate {
  readonly entries: ReadonlyArray<ProjectPullRequestEntry>;
  readonly errors: ReadonlyArray<PullRequestSourceError>;
  readonly isPending: boolean;
}

export function pullRequestProjectSourceKey(source: PullRequestProjectSource): string {
  return `${source.environmentId}:${source.project.id}`;
}

export function aggregatePullRequestProjectState(input: {
  readonly source: PullRequestProjectSource;
  readonly pullRequests: ReadonlyArray<ProjectPullRequest>;
  readonly repoErrors: ReadonlyArray<ProjectPullRequestRepoError>;
  readonly requestError: string | null;
  readonly isPending: boolean;
}): PullRequestProjectState {
  const sourceKey = pullRequestProjectSourceKey(input.source);
  return {
    entries: input.pullRequests.map((pullRequest) => ({ ...input.source, pullRequest })),
    errors: [
      ...(input.requestError
        ? [
            {
              key: `${sourceKey}:request`,
              label: input.source.project.name,
              message: input.requestError,
            },
          ]
        : []),
      ...input.repoErrors.map((error) => ({
        key: `${sourceKey}:${error.repo}`,
        label: `${input.source.project.name} · ${error.repo}`,
        message: error.message,
      })),
    ],
    isPending: input.isPending,
  };
}

function updatedAtEpoch(entry: ProjectPullRequestEntry): number {
  return Option.match(entry.pullRequest.updatedAt, {
    onNone: () => 0,
    onSome: DateTime.toEpochMillis,
  });
}

export function aggregatePullRequestStates(
  expectedSourceKeys: ReadonlySet<string>,
  states: ReadonlyMap<string, PullRequestProjectState>,
): PullRequestsAggregate {
  const relevantStates = [...expectedSourceKeys]
    .map((key) => states.get(key))
    .filter((state): state is PullRequestProjectState => state !== undefined);
  const entries = relevantStates
    .flatMap((state) => state.entries)
    .sort((left, right) => {
      const updatedDifference = updatedAtEpoch(right) - updatedAtEpoch(left);
      if (updatedDifference !== 0) return updatedDifference;
      const projectDifference = left.project.name.localeCompare(right.project.name);
      if (projectDifference !== 0) return projectDifference;
      const repoDifference = left.pullRequest.repo.localeCompare(right.pullRequest.repo);
      return repoDifference !== 0
        ? repoDifference
        : right.pullRequest.number - left.pullRequest.number;
    });

  return {
    entries,
    errors: relevantStates.flatMap((state) => state.errors),
    isPending:
      relevantStates.length < expectedSourceKeys.size ||
      relevantStates.some((state) => state.isPending),
  };
}
