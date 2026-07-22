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

  it("gives child watches useful disclosure content", () => {
    const base = buildConversation();
    const entries = agentConversationTimelineEntries(
      buildConversation({
        activities: [
          {
            ...base.activities[0]!,
            kind: "children.waiting",
            status: "waiting",
            title: "Waiting for 2 child conversations",
            summary: null,
            toolName: null,
            relatedConversationIds: ["private-child-a", "private-child-b"],
            completedAt: null,
          },
        ],
        timeline: [{ kind: "activity", id: "activity-1", observedAt: AT }],
      }),
    );

    expect(entries[0]).toMatchObject({
      kind: "work",
      entry: {
        label: "Waiting for 2 child conversations",
        detail: "Child conversation 1\nChild conversation 2",
      },
    });
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

  it("projects structured activity presentation into shared work-log fields", () => {
    const baseActivity = buildConversation().activities[0]!;
    const conversation = buildConversation({
      activities: [
        {
          ...baseActivity,
          presentation: {
            command: "pnpm exec vp test",
            rawCommand: "bash -lc 'pnpm exec vp test'",
            changedFiles: ["src/first.ts", "src/second.ts"],
            toolTitle: "Terminal",
            toolData: { name: "exec_command", input: { command: "pnpm exec vp test" } },
            itemType: "command_execution",
          },
        },
      ],
      timeline: [{ kind: "activity", id: baseActivity.id, observedAt: AT }],
    });

    expect(agentConversationTimelineEntries(conversation)[0]).toMatchObject({
      kind: "work",
      entry: {
        command: "pnpm exec vp test",
        rawCommand: "bash -lc 'pnpm exec vp test'",
        changedFiles: ["src/first.ts", "src/second.ts"],
        toolTitle: "Terminal",
        toolData: { name: "exec_command", input: { command: "pnpm exec vp test" } },
        itemType: "command_execution",
      },
    });
  });

  it("retains future activity item types in the universal model without leaking them into strict rows", () => {
    const baseActivity = buildConversation().activities[0]!;
    const conversation = buildConversation({
      activities: [
        {
          ...baseActivity,
          presentation: {
            toolTitle: "Future tool",
            toolData: { value: 42 },
            itemType: "future_tool_type",
          },
        },
      ],
      timeline: [{ kind: "activity", id: baseActivity.id, observedAt: AT }],
    });

    expect(conversation.activities[0]?.presentation?.itemType).toBe("future_tool_type");
    expect(agentConversationTimelineEntries(conversation)[0]).toMatchObject({
      kind: "work",
      entry: { toolTitle: "Future tool", toolData: { value: 42 } },
    });
    expect(agentConversationTimelineEntries(conversation)[0]).not.toMatchObject({
      kind: "work",
      entry: { itemType: "future_tool_type" },
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

  it("projects messages, reasoning, tool lifecycle, waiting, queued, and failure rows in canonical order", () => {
    const base = buildConversation();
    const activities: AgentConversation["activities"] = [
      {
        ...base.activities[0]!,
        id: "reasoning-running",
        kind: "reasoning.running",
        status: "running",
        title: "Thinking",
        summary: "Inspecting the conversation state",
        toolName: null,
        completedAt: null,
      },
      {
        ...base.activities[0]!,
        id: "tool-requested",
        kind: "tool.requested",
        status: "requested",
        title: "Requested search",
        completedAt: null,
      },
      {
        ...base.activities[0]!,
        id: "tool-running",
        kind: "tool.running",
        status: "running",
        title: "Searching repository",
        completedAt: null,
      },
      {
        ...base.activities[0]!,
        id: "tool-completed",
        title: "Searched repository",
      },
      {
        ...base.activities[0]!,
        id: "children-waiting",
        kind: "children.waiting",
        status: "waiting",
        title: "Waiting for 2 child conversations",
        summary: null,
        toolName: null,
        relatedConversationIds: ["child-a", "child-b"],
        completedAt: null,
      },
      {
        ...base.activities[0]!,
        id: "turn-queued",
        kind: "turn.queued",
        status: "waiting",
        title: "Turn queued",
        summary: "Waiting for the active turn to finish.",
        toolName: null,
        completedAt: null,
      },
      {
        ...base.activities[0]!,
        id: "tool-failed",
        kind: "tool.failed",
        status: "failed",
        title: "Search failed",
        summary: null,
        error: "Permission denied",
      },
    ];
    const timeline = [
      { kind: "message" as const, id: "user-1", observedAt: AT },
      ...activities.map((activity) => ({
        kind: "activity" as const,
        id: activity.id,
        observedAt: activity.startedAt,
      })),
      { kind: "message" as const, id: "assistant-1", observedAt: AT },
    ];

    const entries = agentConversationTimelineEntries(buildConversation({ activities, timeline }));

    expect(entries.map((entry) => entry.id)).toEqual([
      "message:user-1",
      "activity:reasoning-running",
      "activity:tool-requested",
      "activity:tool-running",
      "activity:tool-completed",
      "activity:children-waiting",
      "activity:turn-queued",
      "activity:tool-failed",
      "message:assistant-1",
    ]);
    expect(entries).toMatchObject([
      { kind: "message", message: { role: "user", text: "Question" } },
      { kind: "work", entry: { tone: "thinking", semanticActivityStatus: "running" } },
      { kind: "work", entry: { tone: "tool", toolLifecycleStatus: "inProgress" } },
      { kind: "work", entry: { tone: "tool", toolLifecycleStatus: "inProgress" } },
      { kind: "work", entry: { tone: "tool", toolLifecycleStatus: "completed" } },
      {
        kind: "work",
        entry: {
          label: "Waiting for 2 child conversations",
          detail: "Child conversation 1\nChild conversation 2",
          semanticActivityStatus: "waiting",
        },
      },
      {
        kind: "work",
        entry: {
          label: "Turn queued",
          detail: "Waiting for the active turn to finish.",
          semanticActivityStatus: "waiting",
        },
      },
      {
        kind: "work",
        entry: {
          label: "Search failed",
          detail: "Permission denied",
          tone: "error",
          toolLifecycleStatus: "failed",
        },
      },
      { kind: "message", message: { role: "assistant", text: "Answer" } },
    ]);
  });

  it("keeps the existing canonical prefix when incremental activity and message references append", () => {
    const base = buildConversation();
    const reasoning = {
      ...base.activities[0]!,
      id: "reasoning-1",
      kind: "reasoning.running",
      status: "running" as const,
      title: "Thinking",
      toolName: null,
      completedAt: null,
    };
    const firstConversation = buildConversation({
      activities: [reasoning],
      timeline: [
        { kind: "message", id: "user-1", observedAt: AT },
        { kind: "activity", id: reasoning.id, observedAt: AT },
      ],
    });
    const firstIds = agentConversationTimelineEntries(firstConversation).map((entry) => entry.id);
    const runningTool = {
      ...base.activities[0]!,
      id: "tool-running",
      kind: "tool.running",
      status: "running" as const,
      title: "Searching repository",
      completedAt: null,
    };
    const appendedIds = agentConversationTimelineEntries(
      buildConversation({
        activities: [reasoning, runningTool],
        timeline: [
          ...firstConversation.timeline,
          { kind: "activity", id: runningTool.id, observedAt: AT },
          { kind: "message", id: "assistant-1", observedAt: AT },
        ],
      }),
    ).map((entry) => entry.id);

    expect(firstIds).toEqual(["message:user-1", "activity:reasoning-1"]);
    expect(appendedIds.slice(0, firstIds.length)).toEqual(firstIds);
    expect(appendedIds.slice(firstIds.length)).toEqual([
      "activity:tool-running",
      "message:assistant-1",
    ]);
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
    runtime: idleConversationRuntime(),
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

function idleConversationRuntime(): AgentConversation["runtime"] {
  return {
    available: true,
    status: "idle",
    activeTurn: null,
    pendingRequests: [],
    supportedControls: ["turn"],
    supportsSteer: false,
    supportsQueue: false,
    diagnostic: null,
  };
}

function message(id: string, role: "user" | "assistant" | "system" | "unknown", content: string) {
  return { id, conversationId: "conversation-1", role, content, authorId: null, observedAt: AT };
}
