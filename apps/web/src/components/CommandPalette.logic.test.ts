import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { Thread } from "../types";
import {
  buildThreadActionItems,
  filterCommandPaletteGroups,
  resolveCommandPaletteActiveGroups,
  START_WORK_COMMAND_PALETTE_GROUP_VALUE,
  type CommandPaletteGroup,
} from "./CommandPalette.logic";
import { buildStartWorkSources } from "./startWork.logic";

const LOCAL_ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const PROJECT_ID = ProjectId.make("project-1");

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: LOCAL_ENVIRONMENT_ID,
    projectId: PROJECT_ID,
    jarvisRegistryProjectId: null,
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    updatedAt: "2026-03-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    checkpoints: [],
    activities: [],
    ...overrides,
  };
}

describe("buildThreadActionItems", () => {
  it("orders threads by most recent activity and formats timestamps from updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    try {
      const items = buildThreadActionItems({
        threads: [
          makeThread({
            id: ThreadId.make("thread-older"),
            title: "Older thread",
            updatedAt: "2026-03-24T12:00:00.000Z",
          }),
          makeThread({
            id: ThreadId.make("thread-newer"),
            title: "Newer thread",
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z",
          }),
        ],
        projectTitleById: new Map([[PROJECT_ID, "Project"]]),
        sortOrder: "updated_at",
        icon: null,
        runThread: async (_thread) => undefined,
      });

      expect(items.map((item) => item.value)).toEqual([
        "thread:thread-older",
        "thread:thread-newer",
      ]);
      expect(items[0]?.timestamp).toBe("1d ago");
      expect(items[1]?.timestamp).toBe("5d ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ranks thread title matches ahead of contextual project-name matches", () => {
    const threadItems = buildThreadActionItems({
      threads: [
        makeThread({
          id: ThreadId.make("thread-context-match"),
          title: "Fix navbar spacing",
          updatedAt: "2026-03-20T00:00:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("thread-title-match"),
          title: "Project kickoff notes",
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        }),
      ],
      projectTitleById: new Map([[PROJECT_ID, "Project"]]),
      sortOrder: "updated_at",
      icon: null,
      runThread: async (_thread) => undefined,
    });

    const groups = filterCommandPaletteGroups({
      activeGroups: [],
      query: "project",
      isInSubmenu: false,
      projectSearchItems: [],
      threadSearchItems: threadItems,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.value).toBe("threads-search");
    expect(groups[0]?.items.map((item) => item.value)).toEqual([
      "thread:thread-title-match",
      "thread:thread-context-match",
    ]);
  });

  it("preserves thread project-name matches when there is no stronger title match", () => {
    const group: CommandPaletteGroup = {
      value: "threads-search",
      label: "Threads",
      items: [
        {
          kind: "action",
          value: "thread:project-context-only",
          searchTerms: ["Fix navbar spacing", "Project"],
          title: "Fix navbar spacing",
          description: "Project",
          icon: null,
          run: async () => undefined,
        },
      ],
    };

    const groups = filterCommandPaletteGroups({
      activeGroups: [group],
      query: "project",
      isInSubmenu: false,
      projectSearchItems: [],
      threadSearchItems: [],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.value)).toEqual(["thread:project-context-only"]);
  });

  it("filters archived threads out of thread search items", () => {
    const items = buildThreadActionItems({
      threads: [
        makeThread({
          id: ThreadId.make("thread-active"),
          title: "Active thread",
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("thread-archived"),
          title: "Archived thread",
          archivedAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        }),
      ],
      projectTitleById: new Map([[PROJECT_ID, "Project"]]),
      sortOrder: "updated_at",
      icon: null,
      runThread: async (_thread) => undefined,
    });

    expect(items.map((item) => item.value)).toEqual(["thread:thread-active"]);
  });
});

describe("resolveCommandPaletteActiveGroups", () => {
  it("replaces an open start-work view with worker availability from the latest snapshot", () => {
    const staleStartWorkGroup: CommandPaletteGroup = {
      value: START_WORK_COMMAND_PALETTE_GROUP_VALUE,
      label: "Start work",
      items: [
        {
          kind: "action",
          value: "action:start-work:describe",
          searchTerms: ["describe"],
          title: "Describe work",
          description: "No workers reported",
          icon: null,
          run: async () => undefined,
        },
      ],
    };
    const liveStartWorkGroup: CommandPaletteGroup = {
      value: START_WORK_COMMAND_PALETTE_GROUP_VALUE,
      label: "Start work",
      items: buildStartWorkSources({
        hasAnchorProject: true,
        hasResumableThread: false,
        routing: {
          projects: [
            {
              id: "project_jarvis",
              name: "Jarvis",
              repos: [{ name: "jarvis", remote: "roughcoder/jarvis", default: true }],
            },
          ],
          workers: [
            {
              worker_id: "brain-mac-mini",
              display_name: "Brain Mac mini",
              status: "online",
              health: "healthy",
              engines: [{ engine: "codex", status: "available" }],
              repositories: [{ repo: "roughcoder/jarvis", can_start_work: true, is_default: true }],
            },
          ],
        },
      }).map((source) => ({
        kind: "action" as const,
        value: source.value,
        searchTerms: source.searchTerms,
        title: source.title,
        description: source.description,
        icon: null,
        run: async () => undefined,
      })),
    };

    const groups = resolveCommandPaletteActiveGroups({
      currentView: { addonIcon: null, groups: [staleStartWorkGroup] },
      rootGroups: [],
      sourceSelectionViewValue: null,
      refreshedSourceSelectionGroups: null,
      refreshedStartWorkGroups: [liveStartWorkGroup],
    });

    const describeWork = groups[0]?.items.find(
      (item) => item.value === "action:start-work:describe",
    );
    expect(describeWork?.description).toContain("Worker: Auto: Brain Mac mini");
    expect(describeWork?.description).toContain("Compatible");
    expect(describeWork?.description).not.toContain("No workers reported");
  });
});
