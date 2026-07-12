import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectConversationTitleGenerationContext,
  buildProjectConversationRenameInput,
  isActiveProjectConversationStatus,
  PROJECT_CONVERSATION_TITLE_MAX_LENGTH,
  resolveProjectContextPanelToggleState,
  resolveProjectConversationHeaderStatus,
  resolveProjectConversationTitle,
} from "./projectConversationHeader.logic";

describe("buildProjectConversationTitleGenerationContext", () => {
  it("uses recent conversation context and excludes older messages", () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `message ${index + 1}`,
    }));

    const context = buildProjectConversationTitleGenerationContext({
      currentTitle: "  Existing   title ",
      messages,
    });

    expect(context).toContain("Current title: Existing title");
    expect(context).not.toContain("message 1\n");
    expect(context).not.toContain("message 2\n");
    expect(context).toContain("user: message 13");
    expect(context).toContain("assistant: message 14");
  });
});

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
  it("identifies statuses that need live refresh", () => {
    expect(isActiveProjectConversationStatus("created")).toBe(true);
    expect(isActiveProjectConversationStatus("running")).toBe(true);
    expect(isActiveProjectConversationStatus("starting")).toBe(true);
    expect(isActiveProjectConversationStatus("working")).toBe(true);
    expect(isActiveProjectConversationStatus("joining")).toBe(true);
    expect(isActiveProjectConversationStatus("waiting_for_children")).toBe(true);
    expect(isActiveProjectConversationStatus("idle")).toBe(false);
    expect(isActiveProjectConversationStatus("completed")).toBe(false);
    expect(isActiveProjectConversationStatus("failed")).toBe(false);
    expect(isActiveProjectConversationStatus(null)).toBe(false);
  });

  it("renders durable conversation states without implying the conversation ended", () => {
    expect(resolveProjectConversationHeaderStatus({ status: "idle", endedReason: null })).toEqual({
      label: "Idle",
      variant: "outline",
      endedNote: null,
    });
    expect(
      resolveProjectConversationHeaderStatus({ status: "working", endedReason: null }),
    ).toEqual({
      label: "Working",
      variant: "warning",
      endedNote: null,
    });
    expect(
      resolveProjectConversationHeaderStatus({ status: "waiting_for_children", endedReason: null }),
    ).toEqual({
      label: "Waiting for children",
      variant: "warning",
      endedNote: null,
    });
    expect(
      resolveProjectConversationHeaderStatus({ status: "degraded", endedReason: null }),
    ).toEqual({
      label: "Needs attention",
      variant: "error",
      endedNote: null,
    });
  });

  it("maps legacy terminal turn statuses without terminating the conversation", () => {
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
      label: "Idle",
      variant: "outline",
      endedNote: null,
    });

    expect(
      resolveProjectConversationHeaderStatus({
        status: "failed",
        endedReason: "engine_error",
      }),
    ).toEqual({
      label: "Needs attention",
      variant: "error",
      endedNote: "ended: engine error",
    });
  });

  it("omits status when Jarvis did not provide one", () => {
    expect(resolveProjectConversationHeaderStatus({ status: null, endedReason: null })).toBeNull();
  });

  it("omits the badge for an unknown (future) status rather than mislabelling it", () => {
    expect(
      resolveProjectConversationHeaderStatus({ status: "cancelled", endedReason: null }),
    ).toBeNull();
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
