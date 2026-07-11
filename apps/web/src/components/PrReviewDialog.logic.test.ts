import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { defaultReviewerKeys, deriveReviewerOptions } from "./PrReviewDialog.logic";

function provider(input: {
  readonly instanceId: string;
  readonly driver: string;
  readonly displayName: string;
  readonly models: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driver),
    displayName: input.displayName,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-11T10:00:00.000Z",
    models: input.models.map((model) => ({
      ...model,
      isCustom: false,
      capabilities: null,
    })),
    slashCommands: [],
    skills: [],
  };
}

describe("deriveReviewerOptions", () => {
  it("preserves provider instance, engine, and model identity", () => {
    const options = deriveReviewerOptions([
      provider({
        instanceId: "claude_work",
        driver: "claudeAgent",
        displayName: "Claude Work",
        models: [{ slug: "claude-opus-4-7", name: "Claude Opus 4.7" }],
      }),
      provider({
        instanceId: "codex_personal",
        driver: "codex",
        displayName: "Codex Personal",
        models: [{ slug: "gpt-5.5", name: "GPT-5.5" }],
      }),
    ]);

    expect(options).toEqual([
      {
        key: "claude_work::claude-opus-4-7",
        providerInstanceId: "claude_work",
        engine: "claude",
        model: "claude-opus-4-7",
        label: "Claude Work · Claude Opus 4.7",
      },
      {
        key: "codex_personal::gpt-5.5",
        providerInstanceId: "codex_personal",
        engine: "codex",
        model: "gpt-5.5",
        label: "Codex Personal · GPT-5.5",
      },
    ]);
  });

  it("defaults to Claude Opus 4.7 and GPT-5.5 when both are available", () => {
    const options = deriveReviewerOptions([
      provider({
        instanceId: "claudeAgent",
        driver: "claudeAgent",
        displayName: "Claude",
        models: [
          { slug: "claude-sonnet-5", name: "Claude Sonnet 5" },
          { slug: "claude-opus-4-7", name: "Claude Opus 4.7" },
        ],
      }),
      provider({
        instanceId: "codex",
        driver: "codex",
        displayName: "Codex",
        models: [
          { slug: "gpt-5.4", name: "GPT-5.4" },
          { slug: "gpt-5.5", name: "GPT-5.5" },
        ],
      }),
    ]);

    expect([...defaultReviewerKeys(options)]).toEqual([
      "claudeAgent::claude-opus-4-7",
      "codex::gpt-5.5",
    ]);
  });
});
