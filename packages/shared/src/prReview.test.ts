import { describe, expect, it } from "vite-plus/test";

import { buildPrReviewOrchestratorPrompt } from "./prReview.ts";

describe("buildPrReviewOrchestratorPrompt", () => {
  it("includes repo, PR number, selected dimensions, rubric, and post instructions", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 42,
      dimensions: ["correctness", "security"],
      reviewers: [
        {
          providerInstanceId: "claudeAgent",
          engine: "claude",
          model: "claude-opus-4-7",
          label: "Claude · Claude Opus 4.7",
        },
        {
          providerInstanceId: "codex",
          engine: "codex",
          model: "gpt-5.5",
          label: "Codex · GPT-5.5",
        },
      ],
      post: true,
    });
    expect(prompt).toContain("pull request #42 in acme/widgets");
    expect(prompt).toContain("Spawn exactly these two independent child review chats");
    expect(prompt).toContain("spawn_child_work_session");
    expect(prompt).toContain('provider_instance_id="claudeAgent"');
    expect(prompt).toContain('engine="claude"');
    expect(prompt).toContain('model="claude-opus-4-7"');
    expect(prompt).toContain('provider_instance_id="codex"');
    expect(prompt).toContain('model="gpt-5.5"');
    expect(prompt).toContain("watch_child_work_sessions");
    expect(prompt).toContain("child_chat_ids");
    expect(prompt).toContain("expected_count=2");
    expect(prompt).toContain("do not register a partial watch");
    expect(prompt).toContain("automatically continue this parent once");
    expect(prompt).toContain("read_child_work_result");
    expect(prompt).toContain("gh pr view 42 --repo acme/widgets --json headRefOid");
    expect(prompt).toContain("gh pr diff 42 --repo acme/widgets");
    expect(prompt).toContain("not the checkout's current branch");
    expect(prompt).toContain("both report the same non-empty `headRefOid`");
    expect(prompt).toContain("Correctness:");
    expect(prompt).toContain("Security:");
    expect(prompt).not.toContain("Performance:");
    expect(prompt).toContain("P1: must fix before merge");
    expect(prompt).toContain("publish_github_pr_review");
    expect(prompt).toContain("Set `commit_id`");
    expect(prompt).toContain("[P1] <title>");
    expect(prompt).toContain("suggestion");
  });

  it("asks the orchestrator to reconcile multiple models", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: ["correctness"],
      reviewers: [
        {
          providerInstanceId: "claudeAgent",
          engine: "claude",
          model: "claude-opus-4-7",
          label: "Claude · Claude Opus 4.7",
        },
        {
          providerInstanceId: "codex",
          engine: "codex",
          model: "gpt-5.5",
          label: "Codex · GPT-5.5",
        },
      ],
      post: false,
    });
    expect(prompt).toContain("Spawn exactly these two independent child review chats");
    expect(prompt).toContain("Claude · Claude Opus 4.7");
    expect(prompt).toContain("Codex · GPT-5.5");
    expect(prompt).toContain("reconcile and deduplicate");
  });

  it("falls back to correctness when no dimensions are selected", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: [],
      reviewers: [],
      post: false,
    });
    expect(prompt).toContain("Correctness:");
    expect(prompt).toContain("malformed unless it contains exactly two reviewers");
  });

  it("instructs not to post when post is false and appends extra instructions", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: ["correctness"],
      reviewers: [
        {
          providerInstanceId: "claudeAgent",
          engine: "claude",
          model: "claude-opus-4-7",
          label: "Claude · Claude Opus 4.7",
        },
        {
          providerInstanceId: "codex",
          engine: "codex",
          model: "gpt-5.5",
          label: "Codex · GPT-5.5",
        },
      ],
      extraInstructions: "Measure against the RFC-104 error-handling rules.",
      post: false,
    });
    expect(prompt).toContain("Do NOT post");
    expect(prompt).toContain("RFC-104 error-handling rules");
  });
});
