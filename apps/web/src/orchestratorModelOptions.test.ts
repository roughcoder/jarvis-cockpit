import { ProviderInstanceId, ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildOrchestratorTarget, deriveOrchestratorOptions } from "./orchestratorModelOptions";

function provider(input: {
  readonly instanceId: string;
  readonly driver: string;
  readonly models: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driver),
    displayName: input.instanceId,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-11T10:00:00.000Z",
    models: input.models.map((model) => ({ ...model, isCustom: false, capabilities: null })),
    slashCommands: [],
    skills: [],
  };
}

describe("buildOrchestratorTarget", () => {
  const providers = [
    provider({
      instanceId: "codex",
      driver: "codex",
      models: [{ slug: "gpt-5.5", name: "GPT-5.5" }],
    }),
  ];

  it("still builds a target when the fleet snapshot names no worker", () => {
    const target = buildOrchestratorTarget({
      options: deriveOrchestratorOptions(providers),
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.5",
      // A degraded, slow, or empty global snapshot must not block opening a
      // conversation: it starts planning-only, and Jarvis binds a worker when
      // a turn actually needs one.
      workers: [],
    });

    expect(target).toEqual({ chat_type: "orchestrator", engine: "codex", model: "gpt-5.5" });
    expect(target?.worker_id).toBeUndefined();
  });

  it("returns no target only when no orchestrator model is configured", () => {
    expect(
      buildOrchestratorTarget({
        options: [],
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.5",
        workers: [],
      }),
    ).toBeNull();
  });
});
