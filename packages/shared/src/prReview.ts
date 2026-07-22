import type { PrReviewAccessMode, PrReviewDimensionId } from "@t3tools/contracts";

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
  /** Common fleet worker chosen by the cockpit when one can run both reviewers. */
  readonly workerId?: string;
  /** Tool access granted to both child reviewers. */
  readonly accessMode?: PrReviewAccessMode;
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
  const accessMode = input.accessMode ?? "full_trust";

  const reviewDimensions = selected.map((dimension) => `- ${dimension.promptFragment}`).join("\n");
  const childTask = [
    `Review PR #${input.prNumber} in ${input.repo} independently without modifying the repository or external systems.`,
    `Do not call Agent, Task, SendMessage, or Monitor, and do not launch any subagent or background task. Perform the review synchronously in this top-level session and do not end the turn until the complete final report is returned.`,
    `Run exactly \`gh pr view ${input.prNumber} --repo ${input.repo} --json headRefOid\` directly, record its full non-empty \`headRefOid\`, then run exactly \`gh pr diff ${input.prNumber} --repo ${input.repo}\` directly. Review only that fetched diff, not the checkout's current branch. You may inspect surrounding code at that PR head; every finding must be introduced or exposed by the diff.`,
    `Restrict findings to:\n${reviewDimensions}`,
    SEVERITY_RUBRIC,
    `For every finding, \`line\` means the 1-based line number in the file at the PR head: for RIGHT-side comments, track the new-file counter from the nearest \`@@ ... +start,count @@\` hunk header; for LEFT-side comments, track the old-file counter. It is not the ordinal line number of \`gh pr diff\` output, a patch position, or an editor/display offset. Before reporting a finding, verify its path, side, and line against the fetched diff hunk and, for RIGHT-side findings, against the file at \`headRefOid\`. If you cannot verify an inline anchor, label the finding unanchored and omit its line instead of guessing.`,
    `The final report MUST start \`headRefOid: <full 40-character SHA>\`; never abbreviate it. Each anchored finding MUST include severity, title, explanation, changed path, changed line, side (LEFT/RIGHT), and safe exact replacement code when available. Say explicitly if there are no findings. Do not edit, push, merge, release, or post to GitHub.`,
  ].join("\n\n");
  const workerRoute = input.workerId?.trim()
    ? `, \`worker_id=${JSON.stringify(input.workerId.trim())}\``
    : "";

  const reviewerAssignments = reviewers
    .map(
      (reviewer, index) =>
        `${index + 1}. ${reviewer.label}: call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.spawnChild}\` with \`provider_instance_id=${JSON.stringify(
          reviewer.providerInstanceId,
        )}\`, \`engine=${JSON.stringify(reviewer.engine)}\`, \`model=${JSON.stringify(
          reviewer.model,
        )}\`, \`repo=${JSON.stringify(input.repo)}\`${workerRoute}, \`access_mode=${JSON.stringify(accessMode)}\`, \`allow_nested_agents=false\`, and set \`task\` to the exact CHILD_TASK below. Do not summarize or rewrite it. Give the child the title ${JSON.stringify(
          `${reviewer.label} Review for PR #${input.prNumber}`,
        )}.`,
    )
    .join("\n");

  const continuationInstruction = input.post
    ? [
        `Read both watched child results exactly once. Each child must report a full 40-character hexadecimal headRefOid, and both values must be identical. If either child failed, omitted its SHA, reported an abbreviated or malformed SHA, or reported a different SHA, stop without publishing and report the failure.`,
        `Otherwise reconcile and deduplicate the findings, verify every proposed inline anchor uses a real file line from the fetched diff rather than a global diff-output position, then MUST call ${PR_REVIEW_ORCHESTRATOR_TOOLS.publishReview} exactly once for ${input.repo}#${input.prNumber} before producing any final textual answer. A textual summary without a successful publish call is incomplete.`,
        `Publish every finding both reviewers reported, at every severity — P1, P2 and P3 alike. Severity sets a finding's priority, never whether it is published. Do not drop a finding because it is low severity, because only one reviewer raised it, or because you could not re-verify it yourself; drop it only when the diff demonstrably contradicts it, and say so.`,
        `Use the agreed SHA as commit_id and a stable idempotency_key for this repo, PR, SHA, and joined review. Publish valid inline findings with path, changed line, \`line_kind="FILE"\`, side, severity, title, body, and safe replacement suggestion when available; put unanchored findings in the summary, grouped by severity, so they still reach the author. Set FILE only after verifying the number is the actual file line, not a global diff-output position.`,
        `After the tool succeeds, report the exact posted comment count and skipped comment count returned by the tool plus its URL. Do not describe skipped comments as inline findings.`,
      ].join(" ")
    : `Read both watched child results exactly once, verify their full headRefOid values match, reconcile and deduplicate the findings, do not publish externally, then report the combined result.`;

  const reviewInstruction = [
    `This is a parent/child orchestration workflow. Do not substitute your own single-model review for the child reviews.`,
    reviewers.length === 2
      ? `Spawn exactly these two independent child review chats:`
      : `The request is malformed unless it contains exactly two reviewers; report that problem and do not publish.`,
    `CHILD_TASK (pass this exact complete text to each spawn):\n<child-task>\n${childTask}\n</child-task>`,
    reviewerAssignments || "No valid reviewers were supplied.",
    `Record both returned \`child_chat_id\` values. If either spawn fails, report the failure and stop this initial turn: do not substitute legacy coding-job tools and do not register a partial watch. After both spawns succeed, call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.watchChildren}\` exactly once with \`child_chat_ids\` containing both IDs, \`expected_count=2\`, and \`continuation_instruction=${JSON.stringify(
      continuationInstruction,
    )}\`. It returns immediately; do not poll or continue the review in this initial turn. The runtime will automatically continue this parent once after both children are terminal.`,
    `In that resumed parent turn, call \`${PR_REVIEW_ORCHESTRATOR_TOOLS.readChildResult}\` once for each \`child_chat_id\`. Read both complete results. Each child must report a full 40-character hexadecimal \`headRefOid\`, and both values must be identical. If either result failed, omitted its SHA, reported an abbreviated or malformed SHA, or reported a different SHA, stop without publishing and report the problem. Otherwise reconcile and deduplicate them into one finding set.`,
    `You are a reconciler, not a gatekeeper. Every finding either reaches the published review or is explicitly dropped with a stated reason — never silently omitted. Merge duplicates and keep the highest defensible severity. Drop a finding only when the diff demonstrably contradicts it; being unable to re-verify it yourself is not grounds to drop it. When only one reviewer raised a finding, keep it and attribute it. Findings you are less sure of stay in, at a lower severity if warranted.`,
    `Account for every finding both children reported: published inline, published in the summary, or dropped with its reason. State the totals — how many each reviewer reported, how many merged, how many published, how many dropped — in the published summary and in this conversation. Report material reviewer disagreement in the published review, not only here.`,
  ].join("\n");

  const postInstruction = input.post
    ? [
        `Publish the reconciled result with one \`${PR_REVIEW_ORCHESTRATOR_TOOLS.publishReview}\` call for \`${input.repo}#${input.prNumber}\`.`,
        `- Set \`commit_id\` to the identical \`headRefOid\` reported by both child reviewers. The publishing tool will reject a stale PR head.`,
        `- Supply one structured comment per inline finding with \`path\`, changed \`line\`, \`line_kind="FILE"\`, \`side\`, \`severity\` (P1/P2/P3), \`title\`, and \`body\`. FILE asserts that the orchestrator verified the number is the 1-based line in the actual file.`,
        `- The published comment title must render as \`[P1] <title>\`, \`[P2] <title>\`, or \`[P3] <title>\`. The publishing tool formats that prefix from severity and title; do not duplicate it in the body.`,
        `- When a precise safe replacement is available, set the comment's \`suggestion\` to replacement code only; the publishing tool will emit a GitHub-applicable \`suggestion\` block. Do not place speculative fixes in suggestions.`,
        `- Publish findings of every severity. P3 findings are published exactly like P1 and P2 ones; severity is a priority signal for the author, not a filter for you.`,
        `- Findings that do not map to a changed diff line belong in the review \`summary\`, grouped by severity, not as unanchored inline comments. They must still be published — the summary is how they reach the author, not where they go to be forgotten.`,
        `- The summary must account for every finding both reviewers reported: how many each raised, how many merged as duplicates, how many were published inline, how many in the summary, and any that were dropped with the reason the diff contradicts them.`,
        `- Cap inline comments at ~30; put the remainder in the summary rather than discarding them, and say how many were moved.`,
        `- After publishing, report the posted comment count and any summary-only findings in this parent conversation.`,
      ].join("\n")
    : `Do NOT post anything to the pull request. Present the findings here in this conversation, grouped by severity.`;

  return [
    `You are the PR review orchestrator. Review pull request #${input.prNumber} in ${input.repo}.`,
    reviewInstruction,
    `The child reviewers must use the exact fetched PR diff as the review boundary. They may read surrounding code from the reviewed PR head as needed, but every finding must be caused by or materially exposed by this pull request.`,
    `Review dimensions (restrict findings to these):\n${reviewDimensions}`,
    SEVERITY_RUBRIC,
    ...(input.extraInstructions?.trim()
      ? [`Additional instructions:\n${input.extraInstructions.trim()}`]
      : []),
    postInstruction,
  ].join("\n\n");
}
