import { describe, expect, it } from "vite-plus/test";

import {
  findLatestProjectConversation,
  resolveNoActiveThreadState,
  type NoActiveThreadConversationLike,
  type NoActiveThreadProjectRefLike,
} from "./NoActiveThreadState.logic";

const PROJECTS: NoActiveThreadProjectRefLike[] = [{ environmentId: "env-1", id: "project-1" }];
const LATEST_CONVERSATION = { environmentId: "env-1", threadId: "thread-1" };

describe("resolveNoActiveThreadState", () => {
  it("keeps disconnected brain state focused on reconnecting", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: true,
      registryPending: false,
      fixtureMode: false,
      visibleProjectCount: 1,
      latestProjectConversation: LATEST_CONVERSATION,
    });

    expect(state.title).toBe("Reconnect Jarvis Brain");
    expect(state.description).toContain("project registry is reachable");
    expect(state.actions).toEqual([
      { kind: "reconnect-brain", label: "Reconnect brain", variant: "default" },
    ]);
    expect(state.fixtureBanner).toBeNull();
  });

  it("keeps pending registry state non-actionable", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: false,
      registryPending: true,
      fixtureMode: false,
      visibleProjectCount: 0,
      latestProjectConversation: null,
    });

    expect(state.title).toBe("Checking Jarvis Brain");
    expect(state.statusLabel).toBe("Checking project registry");
    expect(state.actions).toEqual([]);
  });

  it("preserves fixture mode labelling and simulation action copy", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: false,
      registryPending: false,
      fixtureMode: true,
      visibleProjectCount: 1,
      latestProjectConversation: null,
    });

    expect(state.title).toBe("Simulate project work");
    expect(state.description).toContain("No live workers");
    expect(state.fixtureBanner).toContain("Fixture mode");
    expect(state.actions).toEqual([
      { kind: "start-project-work", label: "Simulate work", variant: "default" },
    ]);
  });

  it("prompts to create the first project when no projects exist", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: false,
      registryPending: false,
      fixtureMode: false,
      visibleProjectCount: 0,
      latestProjectConversation: null,
    });

    expect(state.title).toBe("Create your first Jarvis project");
    expect(state.description).toContain("needs a project");
    expect(state.actions).toEqual([
      { kind: "create-first-project", label: "Create first project", variant: "default" },
    ]);
  });

  it("prompts to open a project conversation when projects have no conversations", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: false,
      registryPending: false,
      fixtureMode: false,
      visibleProjectCount: 1,
      latestProjectConversation: null,
    });

    expect(state.title).toBe("Open a project conversation");
    expect(state.description).toContain("Create a Jarvis project conversation");
    expect(state.actions).toEqual([
      {
        kind: "open-project-conversation",
        label: "Open project conversation",
        variant: "default",
      },
      { kind: "start-project-work", label: "Start project work", variant: "outline" },
    ]);
  });

  it("prompts to open a project conversation when one exists", () => {
    const state = resolveNoActiveThreadState({
      isJarvisCockpitMode: true,
      registryFailed: false,
      registryPending: false,
      fixtureMode: false,
      visibleProjectCount: 1,
      latestProjectConversation: LATEST_CONVERSATION,
    });

    expect(state.title).toBe("Open a project conversation");
    expect(state.description).toContain("latest Jarvis project conversation");
    expect(state.actions).toEqual([
      {
        kind: "open-project-conversation",
        label: "Open project conversation",
        variant: "default",
      },
      { kind: "start-project-work", label: "Start project work", variant: "outline" },
    ]);
  });
});

describe("findLatestProjectConversation", () => {
  it("returns the latest unarchived conversation under visible projects", () => {
    const conversations: NoActiveThreadConversationLike[] = [
      {
        environmentId: "env-1",
        id: "older-thread",
        projectId: "project-1",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z",
        archivedAt: null,
      },
      {
        environmentId: "env-1",
        id: "archived-newer-thread",
        projectId: "project-1",
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z",
        archivedAt: "2026-07-04T10:00:00.000Z",
      },
      {
        environmentId: "env-1",
        id: "newer-thread",
        projectId: "project-1",
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
        latestUserMessageAt: "2026-07-05T10:00:00.000Z",
        archivedAt: null,
      },
      {
        environmentId: "env-1",
        id: "other-project-thread",
        projectId: "project-2",
        createdAt: "2026-07-06T10:00:00.000Z",
        updatedAt: "2026-07-06T10:00:00.000Z",
        archivedAt: null,
      },
    ];

    expect(findLatestProjectConversation({ projects: PROJECTS, conversations })).toEqual({
      environmentId: "env-1",
      threadId: "newer-thread",
    });
  });
});
