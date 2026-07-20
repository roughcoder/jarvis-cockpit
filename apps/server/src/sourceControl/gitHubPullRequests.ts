import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedGitHubPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
  readonly createdAt?: Option.Option<DateTime.Utc>;
  readonly isDraft?: boolean;
  readonly authorLogin?: string | null;
  readonly commentCount?: number;
  readonly reviewCount?: number;
  readonly reviewDecision?: "approved" | "changes_requested" | "review_required" | "not_reported";
  readonly checksStatus?: "passing" | "failing" | "pending" | "not_reported";
  readonly checksCount?: number;
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

const GitHubStatusCheckSchema = Schema.Struct({
  status: Schema.optional(Schema.NullOr(Schema.String)),
  conclusion: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.NullOr(Schema.String)),
});

const GitHubPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  baseRefName: TrimmedNonEmptyString,
  headRefName: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  createdAt: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  isDraft: Schema.optional(Schema.Boolean),
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        login: Schema.String,
      }),
    ),
  ),
  comments: Schema.optional(Schema.Array(Schema.Unknown)),
  reviews: Schema.optional(Schema.Array(Schema.Unknown)),
  reviewDecision: Schema.optional(Schema.NullOr(Schema.String)),
  statusCheckRollup: Schema.optional(Schema.NullOr(Schema.Array(GitHubStatusCheckSchema))),
  isCrossRepository: Schema.optional(Schema.Boolean),
  headRepository: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nameWithOwner: Schema.String,
      }),
    ),
  ),
  headRepositoryOwner: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        login: Schema.String,
      }),
    ),
  ),
});

const GitHubRepositoryPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  baseRefName: TrimmedNonEmptyString,
  headRefName: TrimmedNonEmptyString,
  state: Schema.String,
  updatedAt: Schema.OptionFromNullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.OptionFromNullOr(Schema.DateTimeUtcFromString),
  isDraft: Schema.Boolean,
  author: Schema.NullOr(
    Schema.Struct({
      login: Schema.String,
    }),
  ),
  comments: Schema.Struct({ totalCount: NonNegativeInt }),
  reviews: Schema.Struct({ totalCount: NonNegativeInt }),
  reviewDecision: Schema.NullOr(Schema.String),
  commits: Schema.Struct({
    nodes: Schema.Array(
      Schema.NullOr(
        Schema.Struct({
          commit: Schema.Struct({
            statusCheckRollup: Schema.NullOr(
              Schema.Struct({
                state: Schema.String,
                contexts: Schema.Struct({
                  totalCount: NonNegativeInt,
                }),
              }),
            ),
          }),
        }),
      ),
    ),
  }),
});

const GitHubRepositoryPullRequestListSchema = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      pullRequests: Schema.Struct({
        nodes: Schema.Array(Schema.NullOr(GitHubRepositoryPullRequestSchema)),
      }),
    }),
  }),
});

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGitHubPullRequestState(input: {
  state?: string | null | undefined;
  mergedAt?: string | null | undefined;
}): "open" | "closed" | "merged" {
  const normalizedState = input.state?.trim().toUpperCase();
  if (
    (typeof input.mergedAt === "string" && input.mergedAt.trim().length > 0) ||
    normalizedState === "MERGED"
  ) {
    return "merged";
  }
  if (normalizedState === "CLOSED") {
    return "closed";
  }
  return "open";
}

function normalizeReviewDecision(value: string | null | undefined) {
  if (value === "APPROVED") return "approved" as const;
  if (value === "CHANGES_REQUESTED") return "changes_requested" as const;
  if (value === "REVIEW_REQUIRED") return "review_required" as const;
  return "not_reported" as const;
}

function normalizeChecksStatus(
  checks:
    | ReadonlyArray<{
        readonly status?: string | null | undefined;
        readonly conclusion?: string | null | undefined;
        readonly state?: string | null | undefined;
      }>
    | null
    | undefined,
) {
  if (!checks || checks.length === 0) return "not_reported" as const;
  const values = checks.map((check) =>
    (check.conclusion ?? check.state ?? check.status ?? "").toUpperCase(),
  );
  if (
    values.some((value) =>
      [
        "FAILURE",
        "ERROR",
        "CANCELLED",
        "TIMED_OUT",
        "ACTION_REQUIRED",
        "STARTUP_FAILURE",
        "STALE",
      ].includes(value),
    )
  ) {
    return "failing" as const;
  }
  if (
    values.some((value) =>
      ["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING"].includes(value),
    )
  ) {
    return "pending" as const;
  }
  return values.every((value) => ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(value))
    ? ("passing" as const)
    : ("pending" as const);
}

function normalizeGitHubPullRequestRecord(
  raw: Schema.Schema.Type<typeof GitHubPullRequestSchema>,
): NormalizedGitHubPullRequestRecord {
  const headRepositoryNameWithOwner = trimOptionalString(raw.headRepository?.nameWithOwner);
  const headRepositoryOwnerLogin =
    trimOptionalString(raw.headRepositoryOwner?.login) ??
    (typeof headRepositoryNameWithOwner === "string" && headRepositoryNameWithOwner.includes("/")
      ? (headRepositoryNameWithOwner.split("/")[0] ?? null)
      : null);

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    state: normalizeGitHubPullRequestState(raw),
    updatedAt: raw.updatedAt ?? Option.none(),
    ...(raw.createdAt !== undefined ? { createdAt: raw.createdAt } : {}),
    ...(typeof raw.isDraft === "boolean" ? { isDraft: raw.isDraft } : {}),
    ...(raw.author !== undefined ? { authorLogin: trimOptionalString(raw.author?.login) } : {}),
    ...(raw.comments !== undefined ? { commentCount: raw.comments.length } : {}),
    ...(raw.reviews !== undefined ? { reviewCount: raw.reviews.length } : {}),
    ...(raw.reviewDecision !== undefined
      ? { reviewDecision: normalizeReviewDecision(raw.reviewDecision) }
      : {}),
    ...(raw.statusCheckRollup !== undefined
      ? {
          checksStatus: normalizeChecksStatus(raw.statusCheckRollup),
          checksCount: raw.statusCheckRollup?.length ?? 0,
        }
      : {}),
    ...(typeof raw.isCrossRepository === "boolean"
      ? { isCrossRepository: raw.isCrossRepository }
      : {}),
    ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
    ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {}),
  };
}

const decodeGitHubPullRequestList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeGitHubPullRequest = decodeJsonResult(GitHubPullRequestSchema);
const decodeGitHubPullRequestEntry = Schema.decodeUnknownExit(GitHubPullRequestSchema);
const decodeGitHubRepositoryPullRequestList = decodeJsonResult(
  GitHubRepositoryPullRequestListSchema,
);

export const formatGitHubJsonDecodeError = formatSchemaError;

export function decodeGitHubPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedGitHubPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeGitHubPullRequestList(raw);
  if (Result.isSuccess(result)) {
    const pullRequests: NormalizedGitHubPullRequestRecord[] = [];
    for (const entry of result.success) {
      const decodedEntry = decodeGitHubPullRequestEntry(entry);
      if (Exit.isFailure(decodedEntry)) {
        continue;
      }
      pullRequests.push(normalizeGitHubPullRequestRecord(decodedEntry.value));
    }
    return Result.succeed(pullRequests);
  }
  return Result.fail(result.failure);
}

export function decodeGitHubPullRequestJson(
  raw: string,
): Result.Result<NormalizedGitHubPullRequestRecord, Cause.Cause<Schema.SchemaError>> {
  const result = decodeGitHubPullRequest(raw);
  if (Result.isSuccess(result)) {
    return Result.succeed(normalizeGitHubPullRequestRecord(result.success));
  }
  return Result.fail(result.failure);
}

export function decodeGitHubRepositoryPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedGitHubPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeGitHubRepositoryPullRequestList(raw);
  if (Result.isFailure(result)) {
    return Result.fail(result.failure);
  }

  return Result.succeed(
    result.success.data.repository.pullRequests.nodes.flatMap((pullRequest) => {
      if (pullRequest === null) {
        return [];
      }
      const checkRollup = pullRequest.commits.nodes.find((commit) => commit !== null)?.commit
        .statusCheckRollup;
      const checksCount = checkRollup?.contexts.totalCount ?? 0;
      const authorLogin = trimOptionalString(pullRequest.author?.login);
      return [
        {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url,
          baseRefName: pullRequest.baseRefName,
          headRefName: pullRequest.headRefName,
          state: normalizeGitHubPullRequestState({ state: pullRequest.state }),
          updatedAt: pullRequest.updatedAt,
          createdAt: pullRequest.createdAt,
          isDraft: pullRequest.isDraft,
          ...(authorLogin ? { authorLogin } : {}),
          commentCount: pullRequest.comments.totalCount,
          reviewCount: pullRequest.reviews.totalCount,
          reviewDecision: normalizeReviewDecision(pullRequest.reviewDecision),
          checksStatus:
            checkRollup !== null && checkRollup !== undefined
              ? normalizeChecksStatus([{ state: checkRollup?.state }])
              : "not_reported",
          checksCount,
        },
      ];
    }),
  );
}
