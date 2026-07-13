import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { describe, expect, it } from "vite-plus/test";

import {
  mergeAgentConversationTimelineOverlay,
  type AgentConversationOverlayTurn,
} from "./agentConversationTimelineOverlay.logic";

describe("mergeAgentConversationTimelineOverlay", () => {
  it("preserves canonical durable order before appending unmatched local rows", () => {
    const result = mergeAgentConversationTimelineOverlay(conversation(), [
      turn({ id: "local-1", prompt: "Local prompt", response: "Local answer" }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "activity:durable-activity",
      "message:durable-assistant",
      "message:durable-user",
      "overlay:local-1:user",
      "overlay:local-1:assistant",
    ]);
  });

  it("inserts unmatched overlay rows chronologically without reordering durable ties", () => {
    const base = conversation({
      messages: [
        message("early", "assistant", "Early durable", "2026-07-13T00:00:00.000Z"),
        message("late", "assistant", "Late durable", "2026-07-13T00:00:20.000Z"),
      ],
      activities: [],
      timeline: [
        { kind: "message", id: "early", observedAt: "2026-07-13T00:00:00.000Z" },
        { kind: "message", id: "late", observedAt: "2026-07-13T00:00:20.000Z" },
      ],
    });
    const result = mergeAgentConversationTimelineOverlay(base, [
      turn({
        id: "middle",
        prompt: "Middle local",
        response: "",
        status: "pending",
        createdAt: "2026-07-13T00:00:10.000Z",
      }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "message:early",
      "overlay:middle:user",
      "message:late",
    ]);
  });

  it("marks pending and streaming overlays working and preserves streaming assistant state", () => {
    const pending = mergeAgentConversationTimelineOverlay(conversation(), [
      turn({ id: "pending", status: "pending", prompt: "Pending prompt", response: "" }),
    ]);
    const streaming = mergeAgentConversationTimelineOverlay(conversation(), [
      turn({ id: "streaming", status: "streaming", response: "Partial answer" }),
    ]);

    expect(pending.isWorking).toBe(true);
    expect(streaming.isWorking).toBe(true);
    expect(
      streaming.timelineEntries.find((entry) => entry.id === "overlay:streaming:assistant"),
    ).toMatchObject({ kind: "message", message: { text: "Partial answer", streaming: true } });
  });

  it("keeps durable working state when no optimistic turn is active", () => {
    expect(
      mergeAgentConversationTimelineOverlay(conversation({ operationalState: "working" }), [])
        .isWorking,
    ).toBe(true);
  });

  it("adds a generic recoverable error activity for failed turns", () => {
    const result = mergeAgentConversationTimelineOverlay(conversation(), [
      turn({ id: "failed-1", status: "failed", error: "Network unavailable", response: "" }),
    ]);
    const failure = result.timelineEntries.find((entry) => entry.id === "overlay:failed-1:failure");

    expect(failure).toMatchObject({
      kind: "work",
      entry: {
        label: "Turn failed",
        detail: "Network unavailable",
        tone: "error",
        toolLifecycleStatus: "failed",
        semanticActivityStatus: "failed",
        recoveryAction: { id: "failed-1", label: "Retry" },
      },
    });
    expect(result.isWorking).toBe(false);
  });

  it("echo-dedupes normalized user and completed assistant content inside the replay window", () => {
    const base = conversation({
      messages: [
        message("echo-user", "user", "  Same   prompt  ", "2026-07-13T00:00:00.000Z"),
        message("echo-assistant", "assistant", "Same answer", "2026-07-13T00:00:10.000Z"),
      ],
      timeline: [
        { kind: "message", id: "echo-user", observedAt: "2026-07-13T00:00:00.000Z" },
        {
          kind: "message",
          id: "echo-assistant",
          observedAt: "2026-07-13T00:00:10.000Z",
        },
      ],
    });
    const result = mergeAgentConversationTimelineOverlay(base, [
      turn({
        id: "echoed",
        prompt: "Same prompt",
        response: " Same   answer ",
        createdAt: "2026-07-13T00:00:05.000Z",
      }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "message:echo-user",
      "message:echo-assistant",
    ]);
  });

  it("does not echo-dedupe matching content outside the replay window", () => {
    const base = conversation({
      messages: [message("old-user", "user", "Same prompt", "2026-07-13T00:20:00.000Z")],
      timeline: [{ kind: "message", id: "old-user", observedAt: "2026-07-13T00:20:00.000Z" }],
    });
    const result = mergeAgentConversationTimelineOverlay(base, [
      turn({ id: "late", prompt: "Same prompt", response: "", status: "pending" }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "overlay:late:user",
      "message:old-user",
    ]);
  });

  it("maps semantic overlay activities and dedupes durable activity echoes", () => {
    const result = mergeAgentConversationTimelineOverlay(conversation(), [
      turn({
        id: "with-activities",
        activities: [
          {
            id: "echoed-activity",
            title: " Searched   repository ",
            detail: "duplicate",
            status: "completed",
            toolName: "search",
          },
          {
            id: "waiting-activity",
            title: "Waiting for children",
            detail: null,
            status: "waiting",
          },
        ],
      }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).not.toContain(
      "overlay:with-activities:activity:echoed-activity",
    );
    expect(
      result.timelineEntries.find(
        (entry) => entry.id === "overlay:with-activities:activity:waiting-activity",
      ),
    ).toMatchObject({
      kind: "work",
      entry: {
        label: "Waiting for children",
        tone: "info",
        toolLifecycleStatus: "inProgress",
        semanticActivityStatus: "waiting",
      },
    });
  });

  it("dedupes adapter-style tool lifecycle titles by tool identity", () => {
    const base = conversation({
      activities: [
        {
          ...conversation().activities[0]!,
          title: "Completed search",
          toolName: "search",
          status: "completed",
        },
      ],
      timeline: [{ kind: "activity", id: "durable-activity", observedAt: AT }],
    });
    const result = mergeAgentConversationTimelineOverlay(base, [
      turn({
        id: "tool-echo",
        activities: [
          {
            id: "local-tool",
            title: "search",
            detail: "2 matches",
            toolName: "search",
            status: "completed",
          },
        ],
      }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "activity:durable-activity",
      "overlay:tool-echo:user",
      "overlay:tool-echo:assistant",
    ]);
  });

  it.each([
    ["requested", "completed"],
    ["completed", "running"],
  ] as const)(
    "dedupes the same tool while durable %s and optimistic %s lifecycle frames lag",
    (durableStatus, overlayStatus) => {
      const base = conversation({
        activities: [
          {
            ...conversation().activities[0]!,
            title: durableStatus === "completed" ? "Completed search" : "Requested search",
            toolName: "search",
            status: durableStatus,
          },
        ],
        timeline: [{ kind: "activity", id: "durable-activity", observedAt: AT }],
      });
      const result = mergeAgentConversationTimelineOverlay(base, [
        turn({
          id: "lagged-tool",
          activities: [
            {
              id: "local-tool",
              title: "search",
              detail: null,
              toolName: "search",
              status: overlayStatus,
            },
          ],
        }),
      ]);

      expect(result.timelineEntries.map((entry) => entry.id)).not.toContain(
        "overlay:lagged-tool:activity:local-tool",
      );
    },
  );

  it("claims each durable echo once when identical local turns repeat", () => {
    const base = conversation({
      messages: [message("one-user", "user", "Repeat", AT)],
      timeline: [{ kind: "message", id: "one-user", observedAt: AT }],
    });
    const result = mergeAgentConversationTimelineOverlay(base, [
      turn({ id: "first", prompt: "Repeat", response: "", status: "pending" }),
      turn({ id: "second", prompt: "Repeat", response: "", status: "pending" }),
    ]);

    expect(result.timelineEntries.map((entry) => entry.id)).toEqual([
      "message:one-user",
      "overlay:second:user",
    ]);
  });
});

const AT = "2026-07-13T00:00:00.000Z";

function turn(overrides: Partial<AgentConversationOverlayTurn> = {}): AgentConversationOverlayTurn {
  return {
    id: "turn-1",
    prompt: "Question",
    response: "Answer",
    status: "completed",
    error: null,
    createdAt: AT,
    activities: [],
    ...overrides,
  };
}

function conversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: "conversation-1",
    title: "Conversation",
    lifecycle: "open",
    operationalState: "idle",
    createdAt: AT,
    updatedAt: AT,
    lastTurnAt: null,
    messages: [
      message("durable-user", "user", "Durable question", AT),
      message("durable-assistant", "assistant", "Durable answer", AT),
    ],
    activities: [
      {
        id: "durable-activity",
        conversationId: "conversation-1",
        kind: "tool.completed",
        status: "completed",
        title: "Searched repository",
        summary: "Found files",
        toolName: "search",
        correlationId: "search-1",
        relatedConversationIds: [],
        startedAt: AT,
        completedAt: AT,
        error: null,
      },
    ],
    timeline: [
      { kind: "activity", id: "durable-activity", observedAt: AT },
      { kind: "message", id: "durable-assistant", observedAt: AT },
      { kind: "message", id: "durable-user", observedAt: AT },
    ],
    routing: { aliases: [] },
    ownership: { scopeId: null, parentConversationId: null },
    diagnostics: { reason: null, execution: null },
    context: {
      workspace: null,
      project: null,
      memory: null,
      artifacts: [],
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    },
    ...overrides,
  };
}

function message(id: string, role: "user" | "assistant", content: string, observedAt: string) {
  return { id, conversationId: "conversation-1", role, content, authorId: null, observedAt };
}
