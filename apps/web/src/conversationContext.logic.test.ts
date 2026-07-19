import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { standardConversationContextContributions } from "./conversationContext.logic";
import type { Project, Thread } from "./types";

const project: Project = {
  id: ProjectId.make("project-1"),
  environmentId: EnvironmentId.make("environment-1"),
  title: "Cockpit",
  workspaceRoot: "/workspace/cockpit",
  repositoryIdentity: {
    canonicalKey: "github.com/roughcoder/jarvis-cockpit",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/roughcoder/jarvis-cockpit.git",
    },
    displayName: "roughcoder/jarvis-cockpit",
  },
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-07-13T00:00:00Z",
  updatedAt: "2026-07-13T00:00:00Z",
};

const thread = {
  id: ThreadId.make("thread-1"),
  environmentId: project.environmentId,
  projectId: project.id,
  jarvisRegistryProjectId: null,
  title: "Context integration",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.5",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "codex/context-panel",
  worktreePath: "/workspace/cockpit-context",
  latestTurn: null,
  createdAt: "2026-07-13T00:00:00Z",
  updatedAt: "2026-07-13T00:00:00Z",
  archivedAt: null,
  deletedAt: null,
  messages: [],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
} satisfies Thread;

describe("standard conversation context contributions", () => {
  it("renders standard project and workspace data without a provider-specific model", () => {
    expect(standardConversationContextContributions({ project, thread })).toEqual([
      expect.objectContaining({
        kind: "project",
        summary: "Cockpit",
        items: expect.arrayContaining([
          expect.objectContaining({ value: "roughcoder/jarvis-cockpit" }),
        ]),
      }),
      expect.objectContaining({
        kind: "workspace",
        summary: "/workspace/cockpit-context",
        items: [expect.objectContaining({ value: "codex/context-panel" })],
      }),
    ]);
  });

  it("keeps both sections renderable when project and workspace details are absent", () => {
    const contributions = standardConversationContextContributions({
      project: null,
      thread: { ...thread, branch: null, worktreePath: null },
    });

    expect(contributions.map((contribution) => contribution.kind)).toEqual([
      "project",
      "workspace",
    ]);
    expect(contributions.every((contribution) => contribution.emptyMessage)).toBe(true);
  });
});
