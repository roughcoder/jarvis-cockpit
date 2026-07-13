import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { describe, expect, it } from "vite-plus/test";

import {
  agentConversationOperationalFlags,
  agentConversationTimelineEntries,
} from "./agentConversationTimeline.logic";
import { deriveMessagesTimelineRows } from "./components/chat/MessagesTimeline.logic";

describe("agentConversationTimelineEntries", () => {
  it("walks canonical equal-timestamp order without re-sorting", () => {
    const conversation = buildConversation();
    expect(agentConversationTimelineEntries(conversation).map((entry) => entry.id)).toEqual([
      "activity:activity-1",
      "message:assistant-1",
      "message:user-1",
    ]);
  });

  it("maps user and assistant roles to native messages", () => {
    const entries = agentConversationTimelineEntries(buildConversation());
    expect(entries.filter((entry) => entry.kind === "message")).toMatchObject([
      { message: { role: "assistant", text: "Answer" } },
      { message: { role: "user", text: "Question" } },
    ]);
  });

  it("uses compact presentation while retaining raw instructions for disclosure", () => {
    const raw = "You are the PR review orchestrator. Full generated instructions.";
    const base = buildConversation();
    const conversation = buildConversation({
      messages: [
        {
          ...base.messages[0]!,
          content: raw,
          presentation: {
            summary: "Review roughcoder/jarvis #126 with two independent code agents.",
            disclosure: { label: "Review instructions", text: raw },
          },
        },
      ],
      timeline: [{ kind: "message", id: "user-1", observedAt: AT }],
    });

    expect(agentConversationTimelineEntries(conversation)[0]).toMatchObject({
      kind: "message",
      message: {
        text: "Review roughcoder/jarvis #126 with two independent code agents.",
        disclosure: { label: "Review instructions", text: raw },
      },
    });
  });

  it("keeps system and unknown messages visible as info work entries", () => {
    const conversation = buildConversation({
      timeline: [
        { kind: "message", id: "system-1", observedAt: AT },
        { kind: "message", id: "unknown-1", observedAt: AT },
      ],
    });
    expect(agentConversationTimelineEntries(conversation)).toMatchObject([
      {
        kind: "work",
        entry: { label: "System message", detail: "System notice", tone: "info" },
      },
      {
        kind: "work",
        entry: { label: "Unknown message", detail: "Future notice", tone: "info" },
      },
    ]);
  });

  it.each([
    ["requested", "inProgress", "tool"],
    ["running", "inProgress", "tool"],
    ["waiting", "inProgress", "tool"],
    ["completed", "completed", "tool"],
    ["failed", "failed", "error"],
    ["cancelled", "stopped", "tool"],
  ] as const)("maps %s activity lifecycle", (status, lifecycle, tone) => {
    const conversation = buildConversation({
      activities: [{ ...buildConversation().activities[0]!, status }],
      timeline: [{ kind: "activity", id: "activity-1", observedAt: AT }],
    });
    expect(agentConversationTimelineEntries(conversation)[0]).toMatchObject({
      kind: "work",
      entry: { toolLifecycleStatus: lifecycle, semanticActivityStatus: status, tone },
    });
  });

  it("skips missing references and emits duplicate references once", () => {
    const conversation = buildConversation({
      timeline: [
        { kind: "message", id: "missing", observedAt: AT },
        { kind: "message", id: "user-1", observedAt: AT },
        { kind: "message", id: "user-1", observedAt: AT },
        { kind: "activity", id: "missing", observedAt: AT },
        { kind: "activity", id: "activity-1", observedAt: AT },
        { kind: "activity", id: "activity-1", observedAt: AT },
      ],
    });
    expect(agentConversationTimelineEntries(conversation).map((entry) => entry.id)).toEqual([
      "message:user-1",
      "activity:activity-1",
    ]);
  });

  it("preserves mapped requested, waiting, and cancelled activities through native row derivation", () => {
    const base = buildConversation();
    const statuses = ["requested", "waiting", "cancelled"] as const;
    const activities = statuses.map((status, index) => ({
      ...base.activities[0]!,
      id: `activity-${index}`,
      status,
      title: `${status} activity`,
    }));
    const timelineEntries = agentConversationTimelineEntries(
      buildConversation({
        activities,
        timeline: activities.map((activity) => ({
          kind: "activity" as const,
          id: activity.id,
          observedAt: AT,
        })),
      }),
    );
    const rows = deriveMessagesTimelineRows({
      timelineEntries,
      expandedWorkGroupIds: new Set(["work-group:activity:activity-0"]),
      isWorking: false,
      activeTurnStartedAt: null,
      turnDiffSummaryByAssistantMessageId: new Map(),
      revertTurnCountByUserMessageId: new Map(),
    });

    expect(
      rows.flatMap((row) =>
        row.kind === "work" ? row.groupedEntries.map((entry) => entry.semanticActivityStatus) : [],
      ),
    ).toEqual(["requested", "waiting", "cancelled"]);
  });
});

describe("agentConversationOperationalFlags", () => {
  it.each(["starting", "working", "joining"] as const)("marks %s as working", (state) => {
    expect(agentConversationOperationalFlags(state)).toEqual({
      isWorking: true,
      activeTurnInProgress: true,
    });
  });

  it.each([
    "waiting_for_input",
    "waiting_for_approval",
    "waiting_for_children",
    "waiting_for_event",
  ] as const)("marks %s active without the working spinner", (state) => {
    expect(agentConversationOperationalFlags(state)).toEqual({
      isWorking: false,
      activeTurnInProgress: true,
    });
  });

  it.each(["idle", "blocked", "degraded", "paused", "archived"] as const)(
    "marks %s settled",
    (state) => {
      expect(agentConversationOperationalFlags(state)).toEqual({
        isWorking: false,
        activeTurnInProgress: false,
      });
    },
  );
});

const AT = "2026-07-13T00:00:00.000Z";

function buildConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: "conversation-1",
    title: "Conversation",
    lifecycle: "open",
    operationalState: "idle",
    createdAt: AT,
    updatedAt: AT,
    lastTurnAt: null,
    messages: [
      message("user-1", "user", "Question"),
      message("assistant-1", "assistant", "Answer"),
      message("system-1", "system", "System notice"),
      message("unknown-1", "unknown", "Future notice"),
    ],
    activities: [
      {
        id: "activity-1",
        conversationId: "conversation-1",
        kind: "tool.completed",
        status: "completed",
        title: "Searched repository",
        summary: "Found two files",
        toolName: "search",
        correlationId: "call-1",
        relatedConversationIds: [],
        startedAt: AT,
        completedAt: AT,
        error: null,
      },
    ],
    timeline: [
      { kind: "activity", id: "activity-1", observedAt: AT },
      { kind: "message", id: "assistant-1", observedAt: AT },
      { kind: "message", id: "user-1", observedAt: AT },
    ],
    routing: { aliases: [] },
    ownership: { scopeId: null, parentConversationId: null },
    diagnostics: { reason: null, execution: null },
    context: { workspace: null, archivedAt: null, archivedBy: null, archiveReason: null },
    ...overrides,
  };
}

function message(id: string, role: "user" | "assistant" | "system" | "unknown", content: string) {
  return { id, conversationId: "conversation-1", role, content, authorId: null, observedAt: AT };
}
