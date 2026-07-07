import { describe, expect, it } from "vite-plus/test";

import {
  commitProjectConversationLocalRename,
  resolveProjectContextPanelToggleState,
  resolveProjectConversationTitle,
} from "./projectConversationHeader.logic";

describe("project conversation header rename state", () => {
  it("uses the Jarvis title when there is no local-only rename", () => {
    expect(
      resolveProjectConversationTitle({
        threadId: "thread-a",
        serverTitle: "Conversation for Jarvis",
        localTitleByThreadId: {},
      }),
    ).toEqual({
      title: "Conversation for Jarvis",
      isLocalOnly: false,
    });
  });

  it("uses a local-only title without marking it persisted", () => {
    expect(
      resolveProjectConversationTitle({
        threadId: "thread-a",
        serverTitle: "Conversation for Jarvis",
        localTitleByThreadId: { "thread-a": "Release audit" },
      }),
    ).toEqual({
      title: "Release audit",
      isLocalOnly: true,
    });
  });

  it("commits a trimmed local-only rename", () => {
    expect(
      commitProjectConversationLocalRename({
        threadId: "thread-a",
        serverTitle: "Conversation for Jarvis",
        draftTitle: "  Release audit  ",
        localTitleByThreadId: {},
      }),
    ).toEqual({
      title: "Release audit",
      status: "local-only",
      localTitleByThreadId: { "thread-a": "Release audit" },
    });
  });

  it("does not replace the current title with an empty rename", () => {
    expect(
      commitProjectConversationLocalRename({
        threadId: "thread-a",
        serverTitle: "Conversation for Jarvis",
        draftTitle: "   ",
        localTitleByThreadId: { "thread-a": "Release audit" },
      }),
    ).toEqual({
      title: "Release audit",
      status: "empty",
      localTitleByThreadId: { "thread-a": "Release audit" },
    });
  });
});

describe("project context panel toggle state", () => {
  it("describes expanding a collapsed panel", () => {
    expect(resolveProjectContextPanelToggleState(true)).toEqual({
      ariaLabel: "Show project context panel",
      tooltip: "Show context",
      nextCollapsed: false,
    });
  });

  it("describes collapsing a visible panel", () => {
    expect(resolveProjectContextPanelToggleState(false)).toEqual({
      ariaLabel: "Hide project context panel",
      tooltip: "Hide context",
      nextCollapsed: true,
    });
  });
});
