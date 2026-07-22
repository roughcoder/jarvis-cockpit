import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { describe, expect, it } from "vite-plus/test";

import { mergeAgentConversationTimelineOverlay } from "./agentConversationTimelineOverlay.logic";
import type { ProjectConversationLocalTurnView } from "./jarvisProjectConversations.logic";
import { projectConversationTimelineOverlayTurns } from "./projectConversationTimelineOverlay.logic";

describe("project conversation timeline overlay", () => {
  it("projects local turn state without exposing Jarvis transport fields", () => {
    const turns = projectConversationTimelineOverlayTurns([
      localTurn({
        status: "streaming",
        response: "Partial reply",
        workspaceInput: { engine: "codex", repos: [{ name: "jarvis" }] },
        attachments: [{ kind: "image", name: "image.png", mime_type: "image/png", data_url: "x" }],
      }),
    ]);

    expect(turns).toEqual([
      expect.objectContaining({
        id: "turn-1",
        prompt: "Question",
        response: "Partial reply",
        status: "streaming",
        activities: [],
      }),
    ]);
    expect(JSON.stringify(turns)).not.toContain("workspaceInput");
    expect(JSON.stringify(turns)).not.toContain("data_url");
  });

  it("maps returned tool items into provider-neutral semantic activities", () => {
    const turns = projectConversationTimelineOverlayTurns([
      localTurn({
        toolItems: [
          { kind: "reply", id: "reply:0", text: "Done" },
          {
            kind: "tool",
            id: "tool:call-1",
            toolCall: {
              id: "call-1",
              callId: "private-call-id",
              messageId: null,
              eventId: null,
              sequence: null,
              occurredAt: "2026-07-13T00:00:01.000Z",
              name: "search",
              input: { query: "conversation" },
              inputSummary: "conversation",
              result: { matches: 2 },
              resultSummary: "2 matches",
              status: "completed",
            },
          },
        ],
      }),
    ]);

    expect(turns[0]?.activities).toEqual([
      {
        id: "tool:call-1",
        title: "search",
        detail: "2 matches",
        status: "completed",
        toolName: "search",
      },
    ]);
    expect(JSON.stringify(turns)).not.toContain("private-call-id");
  });

  it("maps streamed reasoning and actions into visible work entries", () => {
    const turns = projectConversationTimelineOverlayTurns([
      localTurn({
        status: "streaming",
        toolItems: [
          {
            kind: "activity",
            id: "activity:reasoning-1",
            activity: {
              title: "Thinking",
              detail: "Inspecting the event flow",
              status: "running",
            },
          },
        ],
      }),
    ]);

    expect(turns[0]?.activities).toEqual([
      {
        id: "activity:reasoning-1",
        title: "Thinking",
        detail: "Inspecting the event flow",
        status: "running",
      },
    ]);
  });

  it("dedupes the projected tool against its durable adapter lifecycle activity", () => {
    const overlayTurns = projectConversationTimelineOverlayTurns([
      localTurn({
        toolItems: [
          {
            kind: "tool",
            id: "tool:call-1",
            toolCall: {
              id: "call-1",
              callId: "call-1",
              messageId: null,
              eventId: null,
              sequence: null,
              occurredAt: "2026-07-13T00:00:00.000Z",
              name: "search",
              input: null,
              inputSummary: "conversation",
              result: null,
              resultSummary: "2 matches",
              status: "completed",
            },
          },
        ],
      }),
    ]);
    const timeline = mergeAgentConversationTimelineOverlay(durableToolConversation(), overlayTurns);

    expect(timeline.timelineEntries.map((entry) => entry.id)).not.toContain(
      "overlay:turn-1:activity:tool:call-1",
    );
  });

  it("normalizes the unused idle state to pending", () => {
    expect(
      projectConversationTimelineOverlayTurns([localTurn({ status: "idle" })])[0]?.status,
    ).toBe("pending");
  });
});

function localTurn(
  overrides: Partial<ProjectConversationLocalTurnView> = {},
): ProjectConversationLocalTurnView {
  return {
    id: "turn-1",
    prompt: "Question",
    response: "Answer",
    status: "completed",
    error: null,
    createdAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function durableToolConversation(): AgentConversation {
  const at = "2026-07-13T00:00:00.000Z";
  return {
    runtime: {
      available: true,
      status: "idle",
      activeTurn: null,
      pendingRequests: [],
      supportedControls: ["turn"],
      supportsSteer: false,
      supportsQueue: false,
      diagnostic: null,
    },
    id: "conversation-1",
    title: "Conversation",
    lifecycle: "open",
    operationalState: "idle",
    createdAt: at,
    updatedAt: at,
    lastTurnAt: at,
    messages: [],
    activities: [
      {
        id: "durable-tool",
        conversationId: "conversation-1",
        kind: "tool.completed",
        status: "completed",
        title: "Completed search",
        summary: "2 matches",
        toolName: "search",
        correlationId: "private-call-id",
        relatedConversationIds: [],
        startedAt: at,
        completedAt: at,
        error: null,
      },
    ],
    timeline: [{ kind: "activity", id: "durable-tool", observedAt: at }],
    routing: { aliases: [] },
    ownership: { scopeId: null, parentConversationId: null },
    diagnostics: { reason: null, execution: null },
    context: { workspace: null, archivedAt: null, archivedBy: null, archiveReason: null },
  };
}
