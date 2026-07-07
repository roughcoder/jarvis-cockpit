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
  /** Model names the orchestrator should review with (e.g. one per provider). */
  readonly models: ReadonlyArray<string>;
  readonly extraInstructions?: string;
  /** When true, the orchestrator posts findings to the PR; otherwise it reports them here. */
  readonly post: boolean;
}

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

  const models = input.models.filter((model) => model.trim().length > 0);

  const reviewInstruction =
    models.length > 1
      ? `Review the pull request independently with each of these models, then reconcile their findings into one set (keep the highest severity when they overlap, and note where the models disagreed): ${models.join(", ")}.`
      : models.length === 1
        ? `Review the pull request using ${models[0]}.`
        : `Review the pull request using your best judgement.`;

  const postInstruction = input.post
    ? [
        `When done, POST the findings to the pull request as an inline review with \`gh\`:`,
        `- Use \`gh api repos/${input.repo}/pulls/${input.prNumber}/reviews\` with \`event=COMMENT\`.`,
        `- One inline comment per finding, anchored to the changed line on the RIGHT side (\`path\`, \`line\`, \`side: "RIGHT"\`), body prefixed with the severity, e.g. \`**P1** — <title>\`.`,
        `- Findings that don't map to a changed diff line go in the review summary body instead.`,
        `- Cap inline comments at ~30; summarise the rest.`,
      ].join("\n")
    : `Do NOT post anything to the pull request. Present the findings here in this conversation, grouped by severity.`;

  return [
    `You are the PR review orchestrator. Review pull request #${input.prNumber} in ${input.repo}.`,
    reviewInstruction,
    `Fetch the diff with \`gh pr diff ${input.prNumber} --repo ${input.repo}\` (and read surrounding code as needed). Review ONLY what the pull request changes.`,
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
