import type {
  AgentConversation,
  ConversationActivityStatus,
  ConversationMessageRole,
} from "@t3tools/client-runtime/conversation";
import { MessageId, TurnId } from "@t3tools/contracts";

import {
  agentConversationOperationalFlags,
  agentConversationTimelineEntries,
} from "./agentConversationTimeline.logic";
import type { TimelineEntry, WorkLogEntry } from "./session-logic";

export type AgentConversationOverlayTurnStatus = "pending" | "streaming" | "completed" | "failed";

export interface AgentConversationOverlayActivity {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly status: ConversationActivityStatus;
  readonly toolName?: string;
}

export interface AgentConversationOverlayTurn {
  readonly id: string;
  readonly prompt: string;
  readonly response: string;
  readonly status: AgentConversationOverlayTurnStatus;
  readonly error: string | null;
  readonly createdAt: string;
  readonly activities: ReadonlyArray<AgentConversationOverlayActivity>;
}

export interface AgentConversationRecoveryAction {
  readonly id: string;
  readonly label: "Retry";
}

export type AgentConversationOverlayWorkLogEntry = WorkLogEntry & {
  readonly recoveryAction?: AgentConversationRecoveryAction;
};

export type AgentConversationOverlayTimelineEntry = TimelineEntry;

export interface AgentConversationTimelineOverlayResult {
  readonly timelineEntries: AgentConversationOverlayTimelineEntry[];
  readonly isWorking: boolean;
}

interface DurableMessageCandidate {
  readonly id: string;
  readonly role: ConversationMessageRole;
  readonly content: string;
  readonly observedAt: string;
}

interface DurableActivityCandidate {
  readonly id: string;
  readonly title: string;
  readonly status: ConversationActivityStatus;
  readonly toolName: string | null;
  readonly startedAt: string;
}

const ECHO_EARLY_TOLERANCE_MS = 30_000;
const ECHO_LATE_TOLERANCE_MS = 10 * 60_000;

/** Merge durable canonical entries with a replay-safe optimistic presentation overlay. */
export function mergeAgentConversationTimelineOverlay(
  conversation: AgentConversation,
  overlayTurns: ReadonlyArray<AgentConversationOverlayTurn>,
): AgentConversationTimelineOverlayResult {
  const durableEntries = agentConversationTimelineEntries(conversation);
  const overlayEntries: AgentConversationOverlayTimelineEntry[] = [];
  const durableMessageIds = new Set(
    conversation.timeline.flatMap((reference) =>
      reference.kind === "message" ? [reference.id] : [],
    ),
  );
  const durableActivityIds = new Set(
    conversation.timeline.flatMap((reference) =>
      reference.kind === "activity" ? [reference.id] : [],
    ),
  );
  const durableMessages: DurableMessageCandidate[] = conversation.messages.filter((message) =>
    durableMessageIds.has(message.id),
  );
  const durableActivities: DurableActivityCandidate[] = conversation.activities
    .filter((activity) => durableActivityIds.has(activity.id))
    .map((activity) => ({
      id: activity.id,
      title: activity.title,
      status: activity.status,
      toolName: activity.toolName,
      startedAt: activity.startedAt,
    }));
  const claimedMessageIds = new Set<string>();
  const claimedActivityIds = new Set<string>();

  for (const turn of overlayTurns) {
    appendOverlayMessage({
      entries: overlayEntries,
      durableMessages,
      claimedMessageIds,
      turn,
      role: "user",
      content: turn.prompt,
      streaming: false,
    });

    for (const activity of turn.activities) {
      if (
        claimDurableActivityEcho(durableActivities, claimedActivityIds, activity, turn.createdAt)
      ) {
        continue;
      }
      overlayEntries.push(overlayActivityEntry(turn, activity));
    }

    if (turn.status === "streaming" || turn.status === "completed") {
      appendOverlayMessage({
        entries: overlayEntries,
        durableMessages,
        claimedMessageIds,
        turn,
        role: "assistant",
        content: turn.response,
        streaming: turn.status === "streaming",
      });
    }

    if (turn.status === "failed") {
      overlayEntries.push(failedTurnEntry(turn));
    }
  }

  return {
    timelineEntries: mergeChronologicalTimelineEntries(durableEntries, overlayEntries),
    isWorking:
      agentConversationOperationalFlags(conversation.operationalState).isWorking ||
      overlayTurns.some((turn) => turn.status === "pending" || turn.status === "streaming"),
  };
}

function appendOverlayMessage(input: {
  readonly entries: AgentConversationOverlayTimelineEntry[];
  readonly durableMessages: ReadonlyArray<DurableMessageCandidate>;
  readonly claimedMessageIds: Set<string>;
  readonly turn: AgentConversationOverlayTurn;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly streaming: boolean;
}): void {
  if (input.content.trim().length === 0) return;
  if (
    claimDurableMessageEcho(
      input.durableMessages,
      input.claimedMessageIds,
      input.role,
      input.content,
      input.turn.createdAt,
    )
  ) {
    return;
  }

  const id = `overlay:${input.turn.id}:${input.role}`;
  input.entries.push({
    id,
    kind: "message",
    createdAt: input.turn.createdAt,
    message: {
      id: MessageId.make(id),
      role: input.role,
      text: input.content,
      turnId: TurnId.make(input.turn.id),
      streaming: input.streaming,
      createdAt: input.turn.createdAt,
      updatedAt: input.turn.createdAt,
    },
  });
}

function claimDurableMessageEcho(
  candidates: ReadonlyArray<DurableMessageCandidate>,
  claimedIds: Set<string>,
  role: "user" | "assistant",
  content: string,
  createdAt: string,
): boolean {
  const normalizedContent = normalizeText(content);
  const match = candidates.find(
    (candidate) =>
      !claimedIds.has(candidate.id) &&
      candidate.role === role &&
      normalizeText(candidate.content) === normalizedContent &&
      isInsideEchoWindow(candidate.observedAt, createdAt),
  );
  if (!match) return false;
  claimedIds.add(match.id);
  return true;
}

function claimDurableActivityEcho(
  candidates: ReadonlyArray<DurableActivityCandidate>,
  claimedIds: Set<string>,
  activity: AgentConversationOverlayActivity,
  createdAt: string,
): boolean {
  const normalizedTitle = normalizeTitle(activity.title);
  const normalizedToolName = activity.toolName ? normalizeTitle(activity.toolName) : null;
  const match = candidates.find(
    (candidate) =>
      !claimedIds.has(candidate.id) &&
      ((normalizedToolName !== null &&
        candidate.toolName !== null &&
        normalizeTitle(candidate.toolName) === normalizedToolName &&
        compatibleActivityStatus(candidate.status, activity.status)) ||
        (normalizeTitle(candidate.title) === normalizedTitle &&
          candidate.status === activity.status)) &&
      isInsideEchoWindow(candidate.startedAt, createdAt),
  );
  if (!match) return false;
  claimedIds.add(match.id);
  return true;
}

function compatibleActivityStatus(
  durable: ConversationActivityStatus,
  overlay: ConversationActivityStatus,
): boolean {
  if (durable === overlay) return true;
  const durableTerminal =
    durable === "completed" || durable === "failed" || durable === "cancelled";
  const overlayTerminal =
    overlay === "completed" || overlay === "failed" || overlay === "cancelled";
  return !(durableTerminal && overlayTerminal);
}

function mergeChronologicalTimelineEntries(
  durableEntries: ReadonlyArray<AgentConversationOverlayTimelineEntry>,
  overlayEntries: ReadonlyArray<AgentConversationOverlayTimelineEntry>,
): AgentConversationOverlayTimelineEntry[] {
  const orderedOverlayEntries = overlayEntries
    .map((entry, index) => ({ entry, index }))
    .toSorted(
      (left, right) =>
        left.entry.createdAt.localeCompare(right.entry.createdAt) || left.index - right.index,
    );
  const result: AgentConversationOverlayTimelineEntry[] = [];
  let overlayIndex = 0;
  for (const durableEntry of durableEntries) {
    while (
      orderedOverlayEntries[overlayIndex] &&
      orderedOverlayEntries[overlayIndex]!.entry.createdAt.localeCompare(durableEntry.createdAt) < 0
    ) {
      result.push(orderedOverlayEntries[overlayIndex]!.entry);
      overlayIndex += 1;
    }
    result.push(durableEntry);
  }
  while (orderedOverlayEntries[overlayIndex]) {
    result.push(orderedOverlayEntries[overlayIndex]!.entry);
    overlayIndex += 1;
  }
  return result;
}

function isInsideEchoWindow(durableAt: string, overlayAt: string): boolean {
  const durableTime = Date.parse(durableAt);
  const overlayTime = Date.parse(overlayAt);
  if (!Number.isFinite(durableTime) || !Number.isFinite(overlayTime)) return false;
  const delta = durableTime - overlayTime;
  return delta >= -ECHO_EARLY_TOLERANCE_MS && delta <= ECHO_LATE_TOLERANCE_MS;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeTitle(value: string): string {
  return normalizeText(value).toLowerCase();
}

function overlayActivityEntry(
  turn: AgentConversationOverlayTurn,
  activity: AgentConversationOverlayActivity,
): AgentConversationOverlayTimelineEntry {
  const toolName = activity.toolName?.trim();
  const tone: WorkLogEntry["tone"] =
    activity.status === "failed" ? "error" : toolName ? "tool" : "info";
  const entry: AgentConversationOverlayWorkLogEntry = {
    id: `overlay:${turn.id}:activity:${activity.id}`,
    createdAt: turn.createdAt,
    turnId: TurnId.make(turn.id),
    label: activity.title,
    ...(activity.detail ? { detail: activity.detail } : {}),
    tone,
    ...(toolName ? { toolTitle: toolName } : {}),
    toolLifecycleStatus: activityLifecycleStatus(activity.status),
    semanticActivityStatus: activity.status,
  };
  return { id: entry.id, kind: "work", createdAt: turn.createdAt, entry };
}

function failedTurnEntry(
  turn: AgentConversationOverlayTurn,
): AgentConversationOverlayTimelineEntry {
  const entry: AgentConversationOverlayWorkLogEntry = {
    id: `overlay:${turn.id}:failure`,
    createdAt: turn.createdAt,
    turnId: TurnId.make(turn.id),
    label: "Turn failed",
    detail: turn.error?.trim() || "The turn could not be completed.",
    tone: "error",
    toolLifecycleStatus: "failed",
    semanticActivityStatus: "failed",
    recoveryAction: { id: turn.id, label: "Retry" },
  };
  return { id: entry.id, kind: "work", createdAt: turn.createdAt, entry };
}

function activityLifecycleStatus(
  status: ConversationActivityStatus,
): NonNullable<WorkLogEntry["toolLifecycleStatus"]> {
  switch (status) {
    case "requested":
    case "running":
    case "waiting":
      return "inProgress";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "stopped";
  }
}
