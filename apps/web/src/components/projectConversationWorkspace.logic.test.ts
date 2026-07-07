import { describe, expect, it } from "vite-plus/test";

import {
  buildTurnWorkspaceInput,
  clearProjectConversationWorkspaceRepos,
  createProjectConversationWorkspaceStaging,
  deriveWorkspaceProvisionSteps,
  setProjectConversationWorkspaceEngine,
  setProjectConversationWorkspaceRepoBaseRef,
  shouldPollProjectConversationWorkspace,
  toggleProjectConversationWorkspaceRepo,
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

  it("toggles repos and clears only repo selections", () => {
    let staging = createProjectConversationWorkspaceStaging("claude");
    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    expect(staging.repos).toEqual([]);

    staging = toggleProjectConversationWorkspaceRepo(staging, "runtime");
    expect(clearProjectConversationWorkspaceRepos(staging)).toEqual({
      engine: "claude",
      repos: [],
    });
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
