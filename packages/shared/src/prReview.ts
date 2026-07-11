import type { PrReviewDimensionId } from "@t3tools/contracts";

/**
 * Formulaic PR review prompt shared between the cockpit UI (prompt preview) and
 * anywhere else that needs to compose the review request. Pure string logic —
 * no I/O.
 *
 * The cockpit does not run reviews itself: the project "Review" action seeds
 * this prompt into a project conversation, and that orchestrator agent performs
 * the review (optionally consulting several models) and posts the findings back
 * to the pull request with its own tools. This module only shapes the prompt.
 */

export interface PrReviewDimensionDescriptor {
  readonly id: PrReviewDimensionId;
  readonly label: string;
  readonly promptFragment: string;
}

export const PR_REVIEW_DIMENSIONS: ReadonlyArray<PrReviewDimensionDescriptor> = [
  {
    id: "correctness",
    label: "Correctness",
    promptFragment:
      "Correctness: logic errors, broken edge cases, race conditions, faulty error handling, and regressions the diff introduces.",
  },
  {
    id: "security",
    label: "Security",
    promptFragment:
      "Security: injection, authn/authz gaps, secret exposure, unsafe deserialization, SSRF, and dependency risks introduced or touched by the diff.",
  },
  {
    id: "performance",
    label: "Performance",
    promptFragment:
      "Performance: unnecessary allocations, N+1 patterns, blocking calls on hot paths, unbounded growth, and missed caching opportunities.",
  },
  {
    id: "tests",
    label: "Test coverage",
    promptFragment:
      "Test coverage: changed behavior without corresponding tests, weak assertions, and untested failure paths.",
  },
  {
    id: "maintainability",
    label: "Maintainability",
    promptFragment:
      "Maintainability: duplicated logic, missing abstractions, confusing naming, and architectural drift from surrounding code.",
  },
  {
    id: "style",
    label: "Style",
    promptFragment:
      "Style: deviations from the repository's established conventions and idioms. Only report clear violations, not preferences.",
  },
];

const SEVERITY_RUBRIC = `Severity rubric (assign exactly one per finding):
- P1: must fix before merge — bugs, security issues, data loss, broken behavior.
- P2: should fix — real problems that can land as a fast follow-up.
- P3: nit — polish, style, minor suggestions.`;

export interface BuildPrReviewOrchestratorPromptInput {
  readonly repo: string;
  readonly prNumber: number;
  readonly dimensions: ReadonlyArray<PrReviewDimensionId>;
  /** Exact provider routes for the two independent child reviews. */
  readonly reviewers: ReadonlyArray<PrReviewerSelection>;
  readonly extraInstructions?: string;
  /** When true, the orchestrator posts findings to the PR; otherwise it reports them here. */
  readonly post: boolean;
}

export interface PrReviewerSelection {
  readonly providerInstanceId: string;
  readonly engine: string;
  readonly model: string;
  readonly label: string;
}

export const PR_REVIEW_ORCHESTRATOR_TOOLS = {
  spawnChild: "spawn_child_work_session",
  watchChildren: "watch_child_work_sessions",
  readChildResult: "read_child_work_result",
  publishReview: "publish_github_pr_review",
} as const;

/**
 * Builds the orchestrator prompt seeded into a project conversation. The prompt
 * is the entire specification of the review: the cockpit UI only shortcuts
 * composing it. Ticking dimensions and adding models expand the instructions.
 */
export function buildPrReviewOrchestratorPrompt(
  input: BuildPrReviewOrchestratorPromptInput,
): string {
  const catalog = new Map(PR_REVIEW_DIMENSIONS.map((dimension) => [dimension.id, dimension]));
  const selected =
    input.dimensions.length > 0
      ? input.dimensions
          .map((id) => catalog.get(id))
          .filter((dimension): dimension is PrReviewDimensionDescriptor => dimension !== undefined)
      : PR_REVIEW_DIMENSIONS.filter((dimension) => dimension.id === "correctness");

  const reviewers = input.reviewers.filter(
    (reviewer) =>
      reviewer.providerInstanceId.trim().length > 0 &&
      reviewer.engine.trim().length > 0 &&
      reviewer.model.trim().length > 0,
  );

  const reviewerAssignments = reviewers
    .map(
      (reviewer, index) =>
        `${index + 1}. ${reviewer.label}: call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.spawnChild}\` with \`provider_instance_id=${JSON.stringify(
          reviewer.providerInstanceId,
        )}\`, \`engine=${JSON.stringify(reviewer.engine)}\`, \`model=${JSON.stringify(
          reviewer.model,
        )}\`, \`repo=${JSON.stringify(input.repo)}\`, and a task that independently reviews only this PR diff against the dimensions below. Give the child a clear review title and require findings to include severity, title, explanation, changed path/line/side when inline-addressable, and an exact replacement suggestion when one is safe.`,
    )
    .join("\n");

  const reviewInstruction = [
    `This is a parent/child orchestration workflow. Do not substitute your own single-model review for the child reviews.`,
    reviewers.length === 2
      ? `Spawn exactly these two independent child review chats:`
      : `The request is malformed unless it contains exactly two reviewers; report that problem and do not publish.`,
    reviewerAssignments || "No valid reviewers were supplied.",
    `Record both returned \`child_chat_id\` values. Before ending this initial turn, call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.watchChildren}\` exactly once with \`child_chat_ids\` containing both IDs. It returns immediately; do not poll or continue the review in this initial turn. The runtime will automatically continue this parent once after both children are terminal.`,
    `In that resumed parent turn, call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.readChildResult}\` once for each \`child_chat_id\`. Read both complete results, then reconcile and deduplicate them into one evidence-backed finding set. Keep the highest defensible severity when findings overlap; discard findings that are unsupported by the changed code; mention material reviewer disagreement in the final conversation summary.`,
  ].join("\n");

  const postInstruction = input.post
    ? [
        `Publish the reconciled result with one \`${PR_REVIEW_ORCHESTRATOR_TOOLS.publishReview}\` call for \`${input.repo}#${input.prNumber}\`.`,
        `- Supply one structured comment per inline finding with \`path\`, changed \`line\`, \`side\`, \`severity\` (P1/P2/P3), \`title\`, and \`body\`.`,
        `- The published comment title must render as \`[P1] <title>\`, \`[P2] <title>\`, or \`[P3] <title>\`. The publishing tool formats that prefix from severity and title; do not duplicate it in the body.`,
        `- When a precise safe replacement is available, set the comment's \`suggestion\` to replacement code only; the publishing tool will emit a GitHub-applicable \`suggestion\` block. Do not place speculative fixes in suggestions.`,
        `- Findings that do not map to a changed diff line belong in the review \`summary\`, not as unanchored inline comments.`,
        `- Cap inline comments at ~30; summarise the rest.`,
        `- After publishing, report the posted comment count and any summary-only findings in this parent conversation.`,
      ].join("\n")
    : `Do NOT post anything to the pull request. Present the findings here in this conversation, grouped by severity.`;

  return [
    `You are the PR review orchestrator. Review pull request #${input.prNumber} in ${input.repo}.`,
    reviewInstruction,
    `The child reviewers may fetch the diff and read surrounding code as needed, but every finding must be caused by or materially exposed by this pull request.`,
    `Review dimensions (restrict findings to these):\n${selected
      .map((dimension) => `- ${dimension.promptFragment}`)
      .join("\n")}`,
    SEVERITY_RUBRIC,
    ...(input.extraInstructions?.trim()
      ? [`Additional instructions:\n${input.extraInstructions.trim()}`]
      : []),
    postInstruction,
  ].join("\n\n");
}
