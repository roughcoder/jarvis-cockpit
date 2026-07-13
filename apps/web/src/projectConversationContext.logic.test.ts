import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { describe, expect, it } from "vite-plus/test";

import {
  projectConversationContextContributions,
  projectConversationContextPanelInitialization,
} from "./projectConversationContext.logic";

const conversation: AgentConversation = {
  id: "conversation-1",
  title: "Review",
  lifecycle: "open",
  operationalState: "idle",
  createdAt: "2026-07-12T12:00:00Z",
  updatedAt: "2026-07-12T12:05:00Z",
  lastTurnAt: "2026-07-12T12:05:00Z",
  messages: [],
  activities: [
    {
      id: "activity-watch",
      conversationId: "conversation-1",
      kind: "children.joined",
      status: "completed",
      title: "Joined 1 child conversation",
      summary: null,
      toolName: null,
      correlationId: "private-watch-id",
      relatedConversationIds: ["private-child-id"],
      startedAt: "2026-07-12T12:01:00Z",
      completedAt: "2026-07-12T12:04:00Z",
      error: null,
    },
    {
      id: "activity-child",
      conversationId: "conversation-1",
      kind: "child.completed",
      status: "completed",
      title: "Independent review",
      summary: null,
      toolName: null,
      correlationId: "private-child-id",
      relatedConversationIds: ["private-child-id"],
      startedAt: "2026-07-12T12:01:00Z",
      completedAt: "2026-07-12T12:04:00Z",
      error: null,
    },
  ],
  timeline: [],
  routing: { aliases: [] },
  ownership: { scopeId: "project-1", parentConversationId: null },
  context: {
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    workspace: {
      workspaceId: "workspace-1",
      rootLabel: "Review workspace",
      cwdLabel: null,
      status: "ready",
      provisionPhase: "completed",
      worktrees: [
        {
          name: "jarvis",
          repository: "roughcoder/jarvis",
          pathLabel: null,
          branch: "codex/review",
          baseRef: "origin/main",
          status: "ready",
          provisionPhase: "attached",
        },
      ],
    },
    project: {
      id: "project-1",
      name: "Jarvis",
      aliases: [],
      owner: null,
      members: [],
      visibility: null,
      status: "active",
      repositories: [
        {
          name: "jarvis",
          remote: "roughcoder/jarvis",
          isDefault: true,
        },
      ],
      links: { issueTracker: null, urls: [] },
    },
    memory: {
      representation: "Durable agent conversations",
      conclusions: [
        {
          id: "finding-1",
          artifactType: "finding",
          content: "Use the native timeline.",
          recordedBy: null,
          observedAt: null,
        },
      ],
    },
    artifacts: [
      {
        id: "spec-1",
        title: "Conversation spec",
        contentHash: null,
        artifactType: "spec",
        uploadedBy: null,
        observedAt: null,
        retracted: false,
      },
    ],
  },
  diagnostics: {
    reason: null,
    execution: {
      provider: "codex",
      workerId: "worker-1",
      sessionId: "private-session-id",
      status: "ready",
      provisionPhase: "running",
      worktrees: [],
    },
  },
};

describe("project conversation context contributions", () => {
  it("projects provider-specific data into ordered provider-neutral sections", () => {
    const contributions = projectConversationContextContributions({
      conversation,
      memoryLoading: false,
    });

    expect(contributions.map((section) => section.kind)).toEqual([
      "orchestration",
      "project",
      "workspace",
      "memory",
      "evidence",
    ]);
    expect(contributions.find((section) => section.kind === "orchestration")?.progress).toEqual({
      completed: 1,
      total: 1,
      failed: 0,
    });
    expect(contributions.find((section) => section.kind === "workspace")?.items).toContainEqual(
      expect.objectContaining({
        label: "jarvis",
        value: "codex/review",
      }),
    );
    expect(JSON.stringify(contributions)).not.toContain("private-session-id");
    expect(JSON.stringify(contributions)).not.toContain("worker-1");
    expect(JSON.stringify(contributions)).not.toContain("private-watch-id");
  });

  it("keeps stable instructional empty states while data loads or is absent", () => {
    const contributions = projectConversationContextContributions({
      conversation: null,
      memoryLoading: true,
    });

    expect(contributions.map((section) => section.kind)).toEqual(["project", "memory", "evidence"]);
    expect(contributions.find((section) => section.kind === "memory")?.loading).toBe(true);
    expect(contributions.find((section) => section.kind === "evidence")?.emptyMessage).toBe(
      "No project files recorded.",
    );
  });
});

describe("project conversation context panel preference migration", () => {
  it("preserves an existing standard right-panel state", () => {
    expect(
      projectConversationContextPanelInitialization({
        hasPersistedState: true,
        legacyCollapsedRaw: "true",
      }),
    ).toBe("preserve");
  });

  it("migrates a legacy dismissal to a closed standard panel", () => {
    expect(
      projectConversationContextPanelInitialization({
        hasPersistedState: false,
        legacyCollapsedRaw: "true",
      }),
    ).toBe("closed");
  });

  it("keeps the legacy global dismissal as the default for every untouched thread", () => {
    const input = { hasPersistedState: false, legacyCollapsedRaw: "true" } as const;
    expect(projectConversationContextPanelInitialization(input)).toBe("closed");
    expect(projectConversationContextPanelInitialization(input)).toBe("closed");
  });

  it.each([null, "false", "not-json"])(
    "defaults an absent or non-dismissed legacy value (%s) to open",
    (legacyCollapsedRaw) => {
      expect(
        projectConversationContextPanelInitialization({
          hasPersistedState: false,
          legacyCollapsedRaw,
        }),
      ).toBe("open");
    },
  );
});
