import { describe, expect, it } from "vite-plus/test";
import { JarvisWorkerId } from "@t3tools/contracts";

import {
  buildTurnEffortInput,
  buildTurnModelInput,
  buildTurnSpeedInput,
  buildTurnWorkspaceInput,
  clearProjectConversationWorkspaceRepos,
  createProjectConversationWorkspaceStaging,
  deriveWorkspaceProvisionSteps,
  projectConversationWorkspaceMatchesSubmission,
  setProjectConversationWorkspaceModel,
  setProjectConversationWorkspaceEffort,
  setProjectConversationWorkspaceEngine,
  setProjectConversationWorkspaceRepoBaseRef,
  setProjectConversationWorkspaceSpeed,
  shouldPollProjectConversationWorkspace,
  toggleProjectConversationWorkspaceRepo,
  workspaceEngineOptionsFromWorkers,
  workspaceRepoNames,
} from "./projectConversationWorkspace.logic";

describe("project conversation workspace staging", () => {
  it("builds a turn workspace input from selected repos and engine", () => {
    let staging = createProjectConversationWorkspaceStaging("codex");
    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    staging = setProjectConversationWorkspaceRepoBaseRef(staging, "runtime", " origin/main ");
    staging = setProjectConversationWorkspaceEngine(staging, "claude");

    expect(buildTurnWorkspaceInput(staging)).toEqual({
      repos: [{ name: "runtime", base_ref: "origin/main" }],
      engine: "claude",
    });
  });

  it("omits empty base refs and returns undefined without repos", () => {
    let staging = createProjectConversationWorkspaceStaging();
    expect(buildTurnWorkspaceInput(staging)).toBeUndefined();

    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    expect(buildTurnWorkspaceInput(staging)).toEqual({
      repos: [{ name: "runtime" }],
      engine: "codex",
    });
  });

  it("sends an engine-only workspace when the picker differs from the live engine", () => {
    let staging = createProjectConversationWorkspaceStaging("codex");
    staging = setProjectConversationWorkspaceEngine(staging, "claude");

    // No live engine (or a brain thread) never produces an engine-only escalation.
    expect(buildTurnWorkspaceInput(staging)).toBeUndefined();
    expect(buildTurnWorkspaceInput(staging, "jarvis")).toBeUndefined();
    expect(buildTurnWorkspaceInput(staging, null)).toBeUndefined();

    expect(buildTurnWorkspaceInput(staging, "codex")).toEqual({ engine: "claude" });
    expect(buildTurnWorkspaceInput(staging, "claude")).toBeUndefined();
  });

  it("toggles repos and clears only repo selections", () => {
    let staging = createProjectConversationWorkspaceStaging("claude");
    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    expect(staging.repos).toEqual([]);

    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    expect(clearProjectConversationWorkspaceRepos(staging)).toEqual({
      engine: "claude",
      model: null,
      effort: null,
      speed: null,
      repos: [],
    });
  });

  it("resets stale model state on engine switches and sends the new engine default", () => {
    const engineOptions = [
      {
        value: "codex" as const,
        label: "Codex",
        description: "Codex",
        models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
        defaultModel: "gpt-5.5",
        efforts: [
          { id: "low", label: "Light" },
          { id: "high", label: "High" },
        ],
        defaultEffort: "high",
        speeds: [
          { id: "standard", label: "Standard", description: "Default speed" },
          { id: "priority", label: "Fast", description: "1.5x speed, more usage" },
        ],
        defaultSpeed: "standard",
      },
      {
        value: "claude" as const,
        label: "Claude",
        description: "Claude",
        models: [
          { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
          { id: "claude-sonnet-4-7", label: "Claude Sonnet 4.7" },
        ],
        defaultModel: "claude-opus-4-7",
        efforts: [
          { id: "medium", label: "Medium" },
          { id: "xhigh", label: "Extra High" },
        ],
        defaultEffort: "xhigh",
        speeds: [],
        defaultSpeed: null,
      },
    ];
    let staging = createProjectConversationWorkspaceStaging("codex", "gpt-5.5", "high", "priority");
    staging = setProjectConversationWorkspaceEngine(staging, "claude", engineOptions);

    expect(staging).toMatchObject({
      engine: "claude",
      model: "claude-opus-4-7",
      effort: "xhigh",
      speed: null,
    });
    expect(buildTurnModelInput(staging, "codex", "gpt-5.5", engineOptions)).toBe("claude-opus-4-7");
    expect(buildTurnEffortInput(staging, "codex", "high", engineOptions)).toBe("xhigh");
    expect(buildTurnSpeedInput(staging, "codex", "priority", engineOptions)).toBeUndefined();

    staging = setProjectConversationWorkspaceModel(staging, "claude-sonnet-4-7");
    staging = setProjectConversationWorkspaceEffort(staging, "medium");
    staging = setProjectConversationWorkspaceSpeed(staging, "priority");
    expect(buildTurnModelInput(staging, "claude", "claude-opus-4-7", engineOptions)).toBe(
      "claude-sonnet-4-7",
    );
    expect(buildTurnEffortInput(staging, "claude", "xhigh", engineOptions)).toBe("medium");
    expect(buildTurnSpeedInput(staging, "claude", null, engineOptions)).toBeUndefined();
  });

  it("builds engine model options from worker catalogs", () => {
    const options = workspaceEngineOptionsFromWorkers([
      {
        worker_id: JarvisWorkerId.make("worker"),
        display_name: "Worker",
        status: "online",
        health: "healthy",
        capabilities: [],
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
            models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
            default_model: "gpt-5.5",
            efforts: [
              { id: "high", label: "High" },
              {
                id: "xhigh",
                label: "Extra High",
                description: "Consumes usage limits faster",
              },
            ],
            default_effort: "high",
            speeds: [{ id: "standard", label: "Standard", description: "Default speed" }],
            default_speed: "standard",
          },
        ],
        capacity: { max_sessions: 1, active_sessions: 0, queued_sessions: 0 },
        repositories: [],
        system: {},
        public_metadata: {},
      },
    ]);

    expect(options.find((option) => option.value === "codex")?.models).toEqual([
      { id: "gpt-5.5", label: "GPT-5.5" },
    ]);
    expect(options.find((option) => option.value === "codex")?.efforts).toEqual([
      { id: "high", label: "High" },
      {
        id: "xhigh",
        label: "Extra High",
        description: "Consumes usage limits faster",
      },
    ]);
    expect(options.find((option) => option.value === "codex")?.defaultEffort).toBe("high");
    expect(options.find((option) => option.value === "codex")?.speeds).toEqual([
      { id: "standard", label: "Standard", description: "Default speed" },
    ]);
    expect(options.find((option) => option.value === "codex")?.defaultSpeed).toBe("standard");
  });

  it("clears staged workspace only when it still matches the submitted snapshot", () => {
    const submitted = {
      engine: "codex" as const,
      repos: [{ name: "runtime", base_ref: "origin/main" }],
    };
    expect(projectConversationWorkspaceMatchesSubmission(submitted, submitted)).toBe(true);
    expect(projectConversationWorkspaceMatchesSubmission(undefined, null)).toBe(true);
    expect(projectConversationWorkspaceMatchesSubmission(submitted, null)).toBe(false);
    expect(
      projectConversationWorkspaceMatchesSubmission(
        { ...submitted, repos: [{ name: "cockpit", base_ref: "origin/main" }] },
        submitted,
      ),
    ).toBe(false);
    expect(
      projectConversationWorkspaceMatchesSubmission({ ...submitted, engine: "claude" }, submitted),
    ).toBe(false);
  });
});

describe("project conversation workspace provisioning", () => {
  it("polls only while a turn is in flight and the workspace is not running", () => {
    expect(
      shouldPollProjectConversationWorkspace({
        turnInFlight: true,
        workspace: null,
      }),
    ).toBe(true);
    expect(
      shouldPollProjectConversationWorkspace({
        turnInFlight: true,
        workspace: { provision_phase: "creating-worktree" },
      }),
    ).toBe(true);
    expect(
      shouldPollProjectConversationWorkspace({
        turnInFlight: true,
        workspace: { provision_phase: "running" },
      }),
    ).toBe(false);
    expect(
      shouldPollProjectConversationWorkspace({
        turnInFlight: false,
        workspace: { provision_phase: "cloning" },
      }),
    ).toBe(false);
  });

  it("derives known phase progress and preserves unknown phases verbatim", () => {
    expect(deriveWorkspaceProvisionSteps("creating-worktree")).toMatchObject([
      { phase: "resolving-access", complete: true, active: false },
      { phase: "cloning", complete: true, active: false },
      { phase: "creating-worktree", complete: false, active: true },
      { phase: "running", complete: false, active: false },
    ]);

    const unknown = deriveWorkspaceProvisionSteps("hydrating-lfs");
    expect(unknown.at(-1)).toEqual({
      phase: "hydrating-lfs",
      label: "hydrating lfs",
      active: true,
      complete: false,
    });
  });

  it("collects worktree repo and name labels without paths", () => {
    expect(
      workspaceRepoNames({
        worktrees: [
          {
            repo: "runtime",
            name: "runtime-main",
            path_label: "redacted",
            branch: "main",
            base_ref: "origin/main",
            status: "running",
            provision_phase: "running",
          },
        ],
      }),
    ).toEqual(new Set(["runtime", "runtime-main"]));
  });
});

it("keeps polling when the in-flight turn staged repos on an already-running workspace", () => {
  expect(
    shouldPollProjectConversationWorkspace({
      turnInFlight: true,
      turnRequestedWorkspace: true,
      workspace: { provision_phase: "running" },
    }),
  ).toBe(true);
  // No workspace request on the turn keeps the existing behavior.
  expect(
    shouldPollProjectConversationWorkspace({
      turnInFlight: true,
      turnRequestedWorkspace: false,
      workspace: { provision_phase: "running" },
    }),
  ).toBe(false);
  // Never poll without a turn in flight, even if a workspace was requested.
  expect(
    shouldPollProjectConversationWorkspace({
      turnInFlight: false,
      turnRequestedWorkspace: true,
      workspace: { provision_phase: "running" },
    }),
  ).toBe(false);
});
