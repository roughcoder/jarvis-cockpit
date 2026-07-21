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
      workerId: "review-worker",
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
    expect(prompt).toContain('worker_id="review-worker"');
    expect(prompt.match(/`allow_nested_agents=false`/g)).toHaveLength(2);
    expect(prompt).toContain("CHILD_TASK (pass this exact complete text to each spawn)");
    const childTask = prompt.match(/<child-task>\n([\s\S]*?)\n<\/child-task>/)?.[1];
    expect(childTask).toBeDefined();
    expect(childTask).toContain(
      "Do not call Agent, Task, SendMessage, or Monitor, and do not launch any subagent or background task",
    );
    expect(childTask).toContain(
      "Perform the review synchronously in this top-level session and do not end the turn until the complete final report is returned",
    );
    expect(prompt).toContain("headRefOid: <full 40-character SHA>");
    expect(prompt).toContain("watch_child_work_sessions");
    expect(prompt).toContain("child_chat_ids");
    expect(prompt).toContain("expected_count=2");
    expect(prompt).toContain("continuation_instruction=");
    expect(prompt).toContain("A textual summary without a successful publish call is incomplete");
    expect(prompt).toContain("do not register a partial watch");
    expect(prompt).toContain("automatically continue this parent once");
    expect(prompt).toContain("read_child_work_result");
    expect(prompt).toContain("gh pr view 42 --repo acme/widgets --json headRefOid");
    expect(prompt).toContain("gh pr diff 42 --repo acme/widgets");
    expect(prompt).toContain(
      "Run exactly `gh pr view 42 --repo acme/widgets --json headRefOid` directly",
    );
    expect(prompt).toContain("run exactly `gh pr diff 42 --repo acme/widgets` directly");
    expect(prompt).toContain(
      "do not use redirection, pipes, temporary files, or any filesystem writes",
    );
    expect(prompt).toContain("not the checkout's current branch");
    expect(prompt).toContain("1-based line number in the file at the PR head");
    expect(prompt).toContain("not the ordinal line number of `gh pr diff` output");
    expect(prompt).toContain("verify every proposed inline anchor");
    expect(prompt).toContain('`line_kind="FILE"`');
    expect(prompt).toContain(
      "Each child must report a full 40-character hexadecimal `headRefOid`, and both values must be identical",
    );
    expect(prompt).toContain("reported an abbreviated or malformed SHA");
    expect(prompt).not.toContain("7-39 character hexadecimal prefix");
    expect(prompt).not.toContain("accept it only when");
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
    expect(prompt).toContain(
      "Each child must report a full 40-character hexadecimal `headRefOid`, and both values must be identical",
    );
    expect(prompt).not.toContain("7-39 character hexadecimal prefix");
    expect(prompt).not.toContain("accept it only when");
  });

  it("publishes every finding at every severity instead of silently dropping them", () => {
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
      post: true,
    });

    // The orchestrator kept only the finding it could re-verify and dropped the
    // rest, so a joined review of six findings published one comment.
    expect(prompt).toContain("You are a reconciler, not a gatekeeper");
    expect(prompt).toContain("never silently omitted");
    expect(prompt).toContain("Publish every finding both reviewers reported, at every severity");
    expect(prompt).toContain("Severity sets a finding's priority, never whether it is published");
    expect(prompt).toContain("being unable to re-verify it yourself is not grounds to drop it");
    expect(prompt).toContain("Account for every finding both children reported");
    expect(prompt).not.toContain("discard findings that are unsupported by the changed code");
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
