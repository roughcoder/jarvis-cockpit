import { describe, expect, it } from "vite-plus/test";

import { buildPrReviewOrchestratorPrompt } from "./prReview.ts";

describe("buildPrReviewOrchestratorPrompt", () => {
  it("includes repo, PR number, selected dimensions, rubric, and post instructions", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 42,
      dimensions: ["correctness", "security"],
      models: ["claude-opus"],
      post: true,
    });
    expect(prompt).toContain("pull request #42 in acme/widgets");
    expect(prompt).toContain("using claude-opus");
    expect(prompt).toContain("Correctness:");
    expect(prompt).toContain("Security:");
    expect(prompt).not.toContain("Performance:");
    expect(prompt).toContain("P1: must fix before merge");
    expect(prompt).toContain("repos/acme/widgets/pulls/42/reviews");
    expect(prompt).toContain("**P1** — <title>");
  });

  it("asks the orchestrator to reconcile multiple models", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: ["correctness"],
      models: ["claude-opus", "gpt-5-codex"],
      post: false,
    });
    expect(prompt).toContain("independently with each of these models");
    expect(prompt).toContain("claude-opus, gpt-5-codex");
  });

  it("falls back to correctness when no dimensions are selected", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: [],
      models: [],
      post: false,
    });
    expect(prompt).toContain("Correctness:");
    expect(prompt).toContain("your best judgement");
  });

  it("instructs not to post when post is false and appends extra instructions", () => {
    const prompt = buildPrReviewOrchestratorPrompt({
      repo: "acme/widgets",
      prNumber: 1,
      dimensions: ["correctness"],
      models: ["claude-opus"],
      extraInstructions: "Measure against the RFC-104 error-handling rules.",
      post: false,
    });
    expect(prompt).toContain("Do NOT post");
    expect(prompt).toContain("RFC-104 error-handling rules");
  });
});
