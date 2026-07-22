import {
  JarvisWorkerId,
  ProviderDriverKind,
  ProviderInstanceId,
  type JarvisWorkerProfile,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  defaultReviewerKeys,
  deriveOrchestratorOptions,
  deriveReviewerOptions,
  resolveOrchestratorKey,
  selectCommonReviewWorker,
  selectReviewOrchestratorWorker,
  isPrReviewAccessMode,
  PR_REVIEW_ACCESS_OPTIONS,
} from "./PrReviewDialog.logic";

describe("PR review access modes", () => {
  it("offers the three runtime policies and rejects unknown wire values", () => {
    expect(PR_REVIEW_ACCESS_OPTIONS.map((option) => option.id)).toEqual([
      "read_only",
      "interactive",
      "full_trust",
    ]);
    expect(isPrReviewAccessMode("full_trust")).toBe(true);
    expect(isPrReviewAccessMode("full-access")).toBe(false);
  });
});

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

function worker(input: {
  readonly id: string;
  readonly engines: ReadonlyArray<string>;
  readonly max: number;
  readonly active?: number;
  readonly authenticated?: boolean;
  readonly status?: JarvisWorkerProfile["status"];
  readonly health?: JarvisWorkerProfile["health"];
}): JarvisWorkerProfile {
  return {
    worker_id: JarvisWorkerId.make(input.id),
    display_name: input.id,
    status: input.status ?? "online",
    health: input.health ?? "healthy",
    capabilities: [],
    engines: input.engines.map((engine) => ({
      engine,
      display_name: engine,
      status: "available",
      default: false,
      supports: {
        streaming: true,
        resume: true,
        interrupt: true,
        approval_requests: true,
        input_requests: true,
        checkpoints: true,
      },
    })),
    capacity: {
      max_sessions: input.max,
      active_sessions: input.active ?? 0,
      queued_sessions: 0,
    },
    repositories: [
      { repo: "jarvis", can_start_work: true, default_branch: "main", is_default: true },
    ],
    git_identity: { authenticated: input.authenticated ?? false },
    system: {},
    public_metadata: {},
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

describe("orchestrator model selection", () => {
  const providers = [
    provider({
      instanceId: "claudeAgent",
      driver: "claudeAgent",
      displayName: "Claude",
      models: [{ slug: "claude-opus-4-7", name: "Claude Opus 4.7" }],
    }),
    provider({
      instanceId: "codex",
      driver: "codex",
      displayName: "Codex",
      models: [{ slug: "gpt-5.5", name: "GPT-5.5" }],
    }),
  ];

  it("offers only code-agent engines that can host an orchestrator", () => {
    expect(deriveOrchestratorOptions(providers).map((option) => option.engine)).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("resolves the persisted default and falls back to Codex GPT-5.5", () => {
    const options = deriveOrchestratorOptions(providers);
    expect(
      resolveOrchestratorKey({
        options,
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-opus-4-7",
      }),
    ).toBe("claudeAgent::claude-opus-4-7");
    expect(
      resolveOrchestratorKey({
        options,
        instanceId: ProviderInstanceId.make("missing"),
        model: "missing",
      }),
    ).toBe("codex::gpt-5.5");
  });
});

describe("selectCommonReviewWorker", () => {
  it("pins both reviewers to a healthy authenticated worker with both engines and two slots", () => {
    const selected = selectCommonReviewWorker({
      workers: [
        worker({ id: "brain", engines: ["codex"], max: 1 }),
        worker({
          id: "laptop",
          engines: ["codex", "claude"],
          max: 2,
          authenticated: true,
        }),
      ],
      reviewers: [{ engine: "claude" }, { engine: "codex" }],
      repo: "roughcoder/jarvis",
    });

    expect(selected).toBe("laptop");
  });

  it("does not pin when no single worker can host the complete review", () => {
    const selected = selectCommonReviewWorker({
      workers: [worker({ id: "laptop", engines: ["codex", "claude"], max: 1 })],
      reviewers: [{ engine: "claude" }, { engine: "codex" }],
      repo: "roughcoder/jarvis",
    });

    expect(selected).toBeUndefined();
  });

  it("does not route reviewers to a worker whose health has not been confirmed", () => {
    const selected = selectCommonReviewWorker({
      workers: [
        worker({
          id: "laptop",
          engines: ["codex", "claude"],
          max: 2,
          authenticated: true,
          status: "unknown",
          health: "unknown",
        }),
      ],
      reviewers: [{ engine: "claude" }, { engine: "codex" }],
      repo: "roughcoder/jarvis",
    });

    expect(selected).toBeUndefined();
  });
});

describe("selectReviewOrchestratorWorker", () => {
  it("keeps the Codex parent off the two-slot child worker when another worker is available", () => {
    const selected = selectReviewOrchestratorWorker({
      workers: [
        worker({ id: "brain", engines: ["codex"], max: 1 }),
        worker({ id: "laptop", engines: ["codex", "claude"], max: 2 }),
      ],
      childWorkerId: "laptop",
      engine: "codex",
    });

    expect(selected).toBe("brain");
  });

  it("returns no route when every Codex worker is full", () => {
    const selected = selectReviewOrchestratorWorker({
      workers: [worker({ id: "brain", engines: ["codex"], max: 1, active: 1 })],
      engine: "codex",
    });

    expect(selected).toBeUndefined();
  });

  it("does not route the orchestrator to a worker whose health has not been confirmed", () => {
    const selected = selectReviewOrchestratorWorker({
      workers: [
        worker({
          id: "brain",
          engines: ["codex"],
          max: 1,
          status: "unknown",
          health: "unknown",
        }),
      ],
      engine: "codex",
    });

    expect(selected).toBeUndefined();
  });

  it("does not consume one of the two child slots when no separate parent worker exists", () => {
    const selected = selectReviewOrchestratorWorker({
      workers: [worker({ id: "laptop", engines: ["codex", "claude"], max: 2 })],
      childWorkerId: "laptop",
      engine: "codex",
    });

    expect(selected).toBeUndefined();
  });

  it("routes a Claude parent only to a Claude-capable worker", () => {
    const selected = selectReviewOrchestratorWorker({
      workers: [
        worker({ id: "brain", engines: ["codex"], max: 1 }),
        worker({ id: "laptop", engines: ["codex", "claude"], max: 1 }),
      ],
      engine: "claude",
    });

    expect(selected).toBe("laptop");
  });
});
