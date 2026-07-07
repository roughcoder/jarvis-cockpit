import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectConversationRenameInput,
  PROJECT_CONVERSATION_TITLE_MAX_LENGTH,
  resolveProjectContextPanelToggleState,
  resolveProjectConversationHeaderStatus,
  resolveProjectConversationTitle,
} from "./projectConversationHeader.logic";

describe("project conversation header rename state", () => {
  it("uses the Jarvis title directly", () => {
    expect(
      resolveProjectConversationTitle({
        serverTitle: "Conversation for Jarvis",
      }),
    ).toEqual({
      title: "Conversation for Jarvis",
    });
  });

  it("builds a normalized persisted rename input", () => {
    expect(
      buildProjectConversationRenameInput({
        currentTitle: "Conversation for Jarvis",
        draftTitle: "  Release \n\t audit  ",
        idempotencyKey: "rename-1",
      }),
    ).toEqual({
      status: "ready",
      title: "Release audit",
      input: {
        title: "Release audit",
        idempotency_key: "rename-1",
      },
    });
  });

  it("caps persisted rename titles at 200 characters", () => {
    const result = buildProjectConversationRenameInput({
      currentTitle: "Conversation for Jarvis",
      draftTitle: "x".repeat(PROJECT_CONVERSATION_TITLE_MAX_LENGTH + 10),
      idempotencyKey: "rename-1",
    });

    expect(result.status).toBe("ready");
    expect(result.title).toHaveLength(PROJECT_CONVERSATION_TITLE_MAX_LENGTH);
    if (result.status === "ready") {
      expect(result.input.title).toHaveLength(PROJECT_CONVERSATION_TITLE_MAX_LENGTH);
    }
  });

  it("does not build a rename input for empty or unchanged titles", () => {
    expect(
      buildProjectConversationRenameInput({
        currentTitle: "Conversation for Jarvis",
        draftTitle: "   ",
        idempotencyKey: "rename-1",
      }),
    ).toEqual({
      status: "empty",
      title: "Conversation for Jarvis",
    });

    expect(
      buildProjectConversationRenameInput({
        currentTitle: "Conversation for Jarvis",
        draftTitle: " Conversation   for Jarvis ",
        idempotencyKey: "rename-2",
      }),
    ).toEqual({
      status: "unchanged",
      title: "Conversation for Jarvis",
    });
  });
});

describe("project conversation header status", () => {
  it("resolves running, completed, and failed status indicators", () => {
    expect(
      resolveProjectConversationHeaderStatus({ status: "running", endedReason: null }),
    ).toEqual({
      label: "Running",
      variant: "warning",
      endedNote: null,
    });

    expect(
      resolveProjectConversationHeaderStatus({
        status: "completed",
        endedReason: "completed",
      }),
    ).toEqual({
      label: "Completed",
      variant: "success",
      endedNote: "ended: completed",
    });

    expect(
      resolveProjectConversationHeaderStatus({
        status: "failed",
        endedReason: "engine_error",
      }),
    ).toEqual({
      label: "Failed",
      variant: "error",
      endedNote: "ended: engine error",
    });
  });

  it("omits status when Jarvis did not provide one", () => {
    expect(resolveProjectConversationHeaderStatus({ status: null, endedReason: null })).toBeNull();
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
