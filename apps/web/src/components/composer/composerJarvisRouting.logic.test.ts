import {
  JarvisWorkerId,
  ProviderDriverKind,
  ProviderInstanceId,
  type JarvisWorkerProfile,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  jarvisEngineForComposerSelection,
  workerCanStartRepo,
  workerIsHealthyEnough,
  workerSupportsEngine,
} from "./composerJarvisRouting.logic";

function worker(overrides: Partial<JarvisWorkerProfile> = {}): JarvisWorkerProfile {
  return {
    worker_id: JarvisWorkerId.make("mac-mini-worker"),
    display_name: "Mac mini",
    status: "online",
    health: "healthy",
    last_seen_at: "2026-07-06T12:00:00.000Z",
    capabilities: ["code.edit"],
    engines: [
      {
        engine: "codex",
        display_name: "Codex",
        status: "available",
        default: true,
        supports: {
          streaming: true,
          resume: true,
          interrupt: true,
          approval_requests: true,
          input_requests: true,
          checkpoints: true,
        },
      },
    ],
    capacity: {
      max_sessions: 4,
      active_sessions: 0,
      queued_sessions: 0,
    },
    repositories: [
      {
        repo: "roughcoder/jarvis-cockpit",
        status: "ready",
        default_branch: "main",
        is_default: true,
        can_start_work: true,
      },
    ],
    system: {},
    public_metadata: {},
    ...overrides,
  };
}

describe("composer Jarvis routing", () => {
  it("accepts available and degraded engines case-insensitively", () => {
    expect(workerSupportsEngine(worker(), "codex")).toBe(true);
    expect(
      workerSupportsEngine(
        worker({
          engines: [
            {
              engine: "Claude",
              display_name: "Claude",
              status: "degraded",
              default: false,
              supports: {
                streaming: true,
                resume: true,
                interrupt: true,
                approval_requests: true,
                input_requests: true,
                checkpoints: true,
              },
            },
          ],
        }),
        "claude",
      ),
    ).toBe(true);
    expect(
      workerSupportsEngine(
        worker({
          engines: [
            {
              engine: "codex",
              display_name: "Codex",
              status: "unavailable",
              default: true,
              supports: {
                streaming: true,
                resume: true,
                interrupt: true,
                approval_requests: true,
                input_requests: true,
                checkpoints: true,
              },
            },
          ],
        }),
        "codex",
      ),
    ).toBe(false);
  });

  it("matches startable repositories by remote or last path segment", () => {
    expect(workerCanStartRepo(worker(), "roughcoder/jarvis-cockpit")).toBe(true);
    expect(
      workerCanStartRepo(
        worker({
          repositories: [
            {
              repo: "jarvis-cockpit",
              status: "ready",
              default_branch: "main",
              is_default: true,
              can_start_work: true,
            },
          ],
        }),
        "/Users/neil/Development/jarvis-cockpit",
      ),
    ).toBe(true);
    expect(workerCanStartRepo(worker(), "roughcoder/other")).toBe(false);
    expect(
      workerCanStartRepo(
        worker({
          repositories: [
            {
              repo: "roughcoder/jarvis-cockpit",
              status: "ready",
              default_branch: "main",
              is_default: true,
              can_start_work: false,
            },
          ],
        }),
        "roughcoder/jarvis-cockpit",
      ),
    ).toBe(false);
  });

  it("allows any selected repository when the worker reports no repository list", () => {
    expect(workerCanStartRepo(worker({ repositories: [] }), "roughcoder/anything")).toBe(true);
    expect(workerCanStartRepo(worker({ repositories: [] }), null)).toBe(true);
  });

  it("rejects offline or unhealthy workers", () => {
    expect(workerIsHealthyEnough(worker())).toBe(true);
    expect(workerIsHealthyEnough(worker({ status: "offline" }))).toBe(false);
    expect(workerIsHealthyEnough(worker({ health: "unhealthy" }))).toBe(false);
  });

  it("derives the Jarvis engine from model, provider, and instance selection", () => {
    expect(
      jarvisEngineForComposerSelection({
        selectedProvider: ProviderDriverKind.make("codex"),
        selectedInstanceId: ProviderInstanceId.make("primary"),
        selectedModel: "claude",
      }),
    ).toBe("claude");
    expect(
      jarvisEngineForComposerSelection({
        selectedProvider: ProviderDriverKind.make("claudeAgent"),
        selectedInstanceId: ProviderInstanceId.make("primary"),
        selectedModel: "sonnet",
      }),
    ).toBe("claude");
    expect(
      jarvisEngineForComposerSelection({
        selectedProvider: ProviderDriverKind.make("codex"),
        selectedInstanceId: ProviderInstanceId.make("claude-remote"),
        selectedModel: "gpt-5",
      }),
    ).toBe("claude");
    expect(
      jarvisEngineForComposerSelection({
        selectedProvider: ProviderDriverKind.make("codex"),
        selectedInstanceId: ProviderInstanceId.make("primary"),
        selectedModel: "gpt-5",
      }),
    ).toBe("codex");
  });
});
