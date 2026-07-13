import type {
  AgentConversation,
  ConversationActivity,
  ConversationOperationalState,
} from "@t3tools/client-runtime/conversation";
import { MessageId } from "@t3tools/contracts";

import type { TimelineEntry, WorkLogEntry } from "./session-logic";

/** Project a provider-neutral conversation in its canonical adapter order. */
export function agentConversationTimelineEntries(conversation: AgentConversation): TimelineEntry[] {
  const messages = new Map(conversation.messages.map((message) => [message.id, message]));
  const activities = new Map(conversation.activities.map((activity) => [activity.id, activity]));
  const seenReferences = new Set<string>();
  const entries: TimelineEntry[] = [];

  for (const reference of conversation.timeline) {
    const referenceKey = `${reference.kind}:${reference.id}`;
    if (seenReferences.has(referenceKey)) continue;
    seenReferences.add(referenceKey);

    if (reference.kind === "message") {
      const message = messages.get(reference.id);
      if (!message) continue;
      if (message.role === "user" || message.role === "assistant") {
        const messageId = MessageId.make(message.id);
        entries.push({
          id: `message:${message.id}`,
          kind: "message",
          createdAt: message.observedAt,
          message: {
            id: messageId,
            role: message.role,
            text: message.presentation?.summary ?? message.content,
            turnId: null,
            streaming: false,
            createdAt: message.observedAt,
            updatedAt: message.observedAt,
            ...(message.presentation?.disclosure
              ? { disclosure: message.presentation.disclosure }
              : {}),
          },
        });
      } else {
        entries.push(
          infoMessageEntry(message.id, message.role, message.content, message.observedAt),
        );
      }
      continue;
    }

    const activity = activities.get(reference.id);
    if (!activity) continue;
    entries.push(activityEntry(activity));
  }

  return entries;
}

export function agentConversationOperationalFlags(state: ConversationOperationalState): {
  readonly isWorking: boolean;
  readonly activeTurnInProgress: boolean;
} {
  const isWorking = state === "starting" || state === "working" || state === "joining";
  const activeTurnInProgress =
    isWorking ||
    state === "waiting_for_input" ||
    state === "waiting_for_approval" ||
    state === "waiting_for_children" ||
    state === "waiting_for_event";
  return { isWorking, activeTurnInProgress };
}

function infoMessageEntry(
  id: string,
  role: "system" | "unknown",
  content: string,
  createdAt: string,
): TimelineEntry {
  const entry: WorkLogEntry = {
    id: `info:${id}`,
    createdAt,
    label: role === "system" ? "System message" : "Unknown message",
    detail: content,
    tone: "info",
  };
  return { id: entry.id, kind: "work", createdAt, entry };
}

function activityEntry(activity: ConversationActivity): TimelineEntry {
  const tone: WorkLogEntry["tone"] =
    activity.status === "failed"
      ? "error"
      : activity.toolName !== null || activity.kind.startsWith("tool.")
        ? "tool"
        : "info";
  const detail = activity.error ?? activity.summary;
  const entry: WorkLogEntry = {
    id: `activity:${activity.id}`,
    createdAt: activity.startedAt,
    label: activity.title,
    ...(detail ? { detail } : {}),
    tone,
    ...(tone === "tool" ? { toolTitle: activity.toolName ?? activity.title } : {}),
    toolLifecycleStatus: activityLifecycleStatus(activity.status),
    semanticActivityStatus: activity.status,
  };
  return { id: entry.id, kind: "work", createdAt: activity.startedAt, entry };
}

function activityLifecycleStatus(
  status: ConversationActivity["status"],
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
