import type {
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisWorkerSession,
} from "@t3tools/contracts";

import { jarvisCheckpointRefForCheckpoint } from "./JarvisIds.ts";

export type CockpitTimelineMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly turnId: string | null;
  readonly streaming: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CockpitTimelineActivityTone = "error" | "tool" | "approval" | "info";

export type CockpitTimelineActivity = {
  readonly id: string;
  readonly tone: CockpitTimelineActivityTone;
  readonly kind: string;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly turnId: string | null;
  readonly sequence: number;
  readonly createdAt: string;
};

export type CockpitLatestTurn = {
  readonly turnId: string;
  readonly state: "running" | "completed" | "error" | "interrupted";
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly assistantMessageId: string | null;
};

export type CockpitCheckpoint = {
  readonly turnId: string;
  readonly checkpointTurnCount: number;
  readonly checkpointRef: string;
  readonly status: "ready";
  readonly assistantMessageId: string | null;
  readonly completedAt: string;
};

export type CockpitSessionProjection = {
  readonly messages: ReadonlyArray<CockpitTimelineMessage>;
  readonly activities: ReadonlyArray<CockpitTimelineActivity>;
  readonly checkpoints: ReadonlyArray<CockpitCheckpoint>;
  readonly latestTurn: CockpitLatestTurn | null;
  readonly latestEventTime: string | null;
};

export function projectJarvisSessionForCockpit(input: {
  readonly session: JarvisWorkerSession;
  readonly events: ReadonlyArray<JarvisSessionEvent>;
  readonly checkpoints: ReadonlyArray<JarvisSessionCheckpoint>;
}): CockpitSessionProjection {
  const sortedEvents = [...input.events].sort(compareJarvisEvents);
  const messages = eventsToMessages(sortedEvents);
  return {
    messages,
    activities: sortedEvents.map((event, index) => eventToActivity(event, index)),
    checkpoints: checkpointsForSession({
      session: input.session,
      checkpoints: input.checkpoints,
      events: sortedEvents,
      messages,
    }),
    latestTurn: latestTurnForEvents(sortedEvents, messages),
    latestEventTime: latestEventTime(sortedEvents),
  };
}

function compareJarvisEvents(a: JarvisSessionEvent, b: JarvisSessionEvent): number {
  return (
    a.sequence - b.sequence ||
    a.occurred_at.localeCompare(b.occurred_at) ||
    a.event_id.localeCompare(b.event_id)
  );
}

function eventsToMessages(
  events: ReadonlyArray<JarvisSessionEvent>,
): ReadonlyArray<CockpitTimelineMessage> {
  const messages: CockpitTimelineMessage[] = [];
  const assistantMessageIndexByKey = new Map<string, number>();

  for (const event of events) {
    if (event.type === "turn.started") {
      const prompt = readText(event);
      if (prompt !== null) {
        messages.push({
          id: `jarvis-message:user:${event.event_id}`,
          role: "user",
          text: prompt,
          turnId: readTurnId(event),
          streaming: false,
          createdAt: event.occurred_at,
          updatedAt: event.occurred_at,
        });
      }
      continue;
    }

    if (event.type !== "assistant.message" && event.type !== "assistant.delta") {
      continue;
    }

    const turnId = readTurnId(event);
    const assistantKeys = assistantMessageKeys(event.message_id ?? null, turnId);
    const assistantKey = assistantKeys[0] ?? event.event_id;
    const text = readText(event) ?? "";
    const existingIndex = assistantKeys
      .map((key) => assistantMessageIndexByKey.get(key))
      .find((index) => index !== undefined);
    if (existingIndex === undefined) {
      for (const key of assistantKeys) {
        assistantMessageIndexByKey.set(key, messages.length);
      }
      messages.push({
        id: `jarvis-message:${assistantKey}`,
        role: "assistant",
        text,
        turnId,
        streaming: event.type === "assistant.delta",
        createdAt: event.occurred_at,
        updatedAt: event.occurred_at,
      });
      continue;
    }

    const existing = messages[existingIndex];
    if (existing === undefined) {
      continue;
    }
    for (const key of assistantKeys) {
      assistantMessageIndexByKey.set(key, existingIndex);
    }
    messages[existingIndex] = {
      ...existing,
      text:
        event.type === "assistant.message" && text.length > 0 ? text : `${existing.text}${text}`,
      streaming: event.type === "assistant.delta",
      updatedAt: event.occurred_at,
    };
  }

  return messages;
}

function assistantMessageKeys(
  messageId: string | null,
  turnId: string | null,
): ReadonlyArray<string> {
  const keys: string[] = [];
  if (typeof messageId === "string" && messageId.trim().length > 0) {
    keys.push(messageId);
  }
  if (typeof turnId === "string" && turnId.trim().length > 0 && turnId !== messageId) {
    keys.push(turnId);
  }
  return keys;
}

function eventToActivity(event: JarvisSessionEvent, index: number): CockpitTimelineActivity {
  return {
    id: `jarvis-event:${event.event_id}`,
    tone: toneForEvent(event),
    kind: activityKindForEvent(event),
    summary: summaryForEvent(event),
    payload: activityPayloadForEvent(event),
    turnId: readTurnId(event),
    sequence: index,
    createdAt: event.occurred_at,
  };
}

function latestTurnForEvents(
  events: ReadonlyArray<JarvisSessionEvent>,
  messages: ReadonlyArray<CockpitTimelineMessage>,
): CockpitLatestTurn | null {
  const latestTurnEvent = events.toReversed().find((event) => readTurnId(event) !== null);
  const latestTurnId = latestTurnEvent ? readTurnId(latestTurnEvent) : null;
  if (latestTurnId === null || !latestTurnEvent) {
    return null;
  }
  const turnEvents = events.filter((event) => readTurnId(event) === latestTurnId);
  const startedEvent = turnEvents.find((event) => event.type === "turn.started");
  const turnStartSequence =
    startedEvent?.sequence ?? turnEvents[0]?.sequence ?? latestTurnEvent.sequence;
  const terminalEvent = events
    .toReversed()
    .find((event) => event.sequence >= turnStartSequence && isTerminalForTurn(event, latestTurnId));
  return {
    turnId: latestTurnId,
    state: latestTurnStateForEvent(terminalEvent ?? latestTurnEvent),
    requestedAt:
      startedEvent?.occurred_at ?? turnEvents[0]?.occurred_at ?? latestTurnEvent.occurred_at,
    startedAt: startedEvent?.occurred_at ?? null,
    completedAt: terminalEvent?.occurred_at ?? null,
    assistantMessageId:
      messages.find((message) => message.role === "assistant" && message.turnId === latestTurnId)
        ?.id ?? null,
  };
}

function checkpointsForSession(input: {
  readonly session: JarvisWorkerSession;
  readonly checkpoints: ReadonlyArray<JarvisSessionCheckpoint>;
  readonly events: ReadonlyArray<JarvisSessionEvent>;
  readonly messages: ReadonlyArray<CockpitTimelineMessage>;
}): ReadonlyArray<CockpitCheckpoint> {
  const turnIdByCheckpointId = checkpointTurnIdsFromEvents(input.events);
  return input.checkpoints.map((checkpoint, index) => {
    const event = checkpoint.event ?? {};
    const eventTurnId = readJsonString(event, "turn_id", "turnId");
    const turnId =
      eventTurnId ?? turnIdByCheckpointId.get(checkpoint.checkpoint_id) ?? checkpoint.checkpoint_id;
    return {
      turnId,
      checkpointTurnCount: index + 1,
      checkpointRef: jarvisCheckpointRefForCheckpoint(
        input.session.session_ref,
        checkpoint.checkpoint_id,
      ),
      status: "ready",
      assistantMessageId:
        input.messages.find((message) => message.role === "assistant" && message.turnId === turnId)
          ?.id ?? null,
      completedAt:
        readJsonString(event, "occurred_at", "time", "created_at", "createdAt") ??
        input.session.updated_at,
    };
  });
}

function isTerminalForTurn(event: JarvisSessionEvent, turnId: string): boolean {
  if (!isTerminalEvent(event)) {
    return false;
  }
  const eventTurnId = readTurnId(event);
  if (eventTurnId === turnId) {
    return true;
  }
  return (
    eventTurnId === null &&
    (event.type === "session.interrupted" || event.type === "session.stopped")
  );
}

function isTerminalEvent(event: JarvisSessionEvent): boolean {
  return (
    event.type === "turn.completed" ||
    event.type === "turn.failed" ||
    event.type === "session.interrupted" ||
    event.type === "session.stopped"
  );
}

function checkpointTurnIdsFromEvents(
  events: ReadonlyArray<JarvisSessionEvent>,
): ReadonlyMap<string, string> {
  const turnIdByCheckpointId = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "checkpoint.created" && event.type !== "checkpoint.restored") {
      continue;
    }
    const checkpointId = readJsonString(
      event.data,
      "checkpoint_id",
      "checkpointId",
      "checkpoint_ref",
      "checkpointRef",
    );
    const turnId = readTurnId(event);
    if (checkpointId !== null && turnId !== null) {
      turnIdByCheckpointId.set(checkpointId, turnId);
    }
  }
  return turnIdByCheckpointId;
}

function latestTurnStateForEvent(event: JarvisSessionEvent) {
  switch (event.type) {
    case "session.interrupted":
    case "session.stopped":
      return "interrupted" as const;
    case "turn.completed":
      return "completed" as const;
    case "turn.failed":
      return "error" as const;
    default:
      return "running" as const;
  }
}

function toneForEvent(event: JarvisSessionEvent): CockpitTimelineActivityTone {
  if (event.type === "turn.failed") return "error";
  if (event.type.startsWith("tool.")) return "tool";
  if (event.type.startsWith("approval.")) return "approval";
  return "info";
}

function activityKindForEvent(event: JarvisSessionEvent): string {
  switch (event.type) {
    case "input.requested":
      return "user-input.requested";
    case "input.received":
      return "user-input.resolved";
    default:
      return event.type;
  }
}

function activityPayloadForEvent(event: JarvisSessionEvent): Record<string, unknown> {
  const requestId = readRequestId(event);
  if (event.type === "approval.requested") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
      requestKind: approvalRequestKindForEvent(event),
      requestType: readJsonString(event.data, "requestType", "request_type"),
      detail: readText(event) ?? summaryForEvent(event),
    };
  }
  if (event.type === "approval.resolved") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (event.type === "input.requested") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
      questions: readQuestions(event) ?? [defaultUserInputQuestion(event)],
    };
  }
  if (event.type === "input.received") {
    return {
      ...event.data,
      ...(requestId ? { requestId } : {}),
    };
  }
  return event.data;
}

function summaryForEvent(event: JarvisSessionEvent): string {
  const text = readText(event);
  if (text) return text;
  switch (event.type) {
    case "session.created":
      return "Session created";
    case "turn.started":
      return "Turn started";
    case "turn.waiting_provider":
      return "Waiting for provider adapter";
    case "assistant.delta":
    case "assistant.message":
      return "Assistant message";
    case "tool.call":
      return "Tool call";
    case "tool.result":
      return "Tool result";
    case "approval.requested":
      return "Approval requested";
    case "approval.resolved":
      return "Approval resolved";
    case "input.requested":
      return "Input requested";
    case "input.received":
      return "Input received";
    case "checkpoint.created":
      return "Checkpoint created";
    case "checkpoint.restored":
      return "Checkpoint restored";
    case "turn.completed":
      return "Turn completed";
    case "turn.failed":
      return "Turn failed";
    case "session.interrupted":
      return "Session interrupted";
    case "session.stopped":
      return "Session stopped";
    default:
      return `Jarvis event: ${event.type}`;
  }
}

function readTurnId(event: JarvisSessionEvent): string | null {
  if (typeof event.turn_id === "string" && event.turn_id.trim().length > 0) {
    return event.turn_id;
  }
  return typeof event.data.turn_id === "string" && event.data.turn_id.trim().length > 0
    ? event.data.turn_id
    : null;
}

function readRequestId(event: JarvisSessionEvent): string | null {
  return readJsonString(event.data, "request_id", "requestId");
}

function approvalRequestKindForEvent(
  event: JarvisSessionEvent,
): "command" | "file-read" | "file-change" {
  const requestKind = readJsonString(event.data, "requestKind", "request_kind");
  if (requestKind === "command" || requestKind === "file-read" || requestKind === "file-change") {
    return requestKind;
  }
  switch (readJsonString(event.data, "requestType", "request_type")) {
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return "command";
  }
}

function readJsonString(
  data: Record<string, unknown>,
  ...keys: ReadonlyArray<string>
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function readQuestions(event: JarvisSessionEvent): unknown[] | null {
  const questions = event.data.questions;
  return Array.isArray(questions) ? questions : null;
}

function defaultUserInputQuestion(event: JarvisSessionEvent) {
  return {
    id: "response",
    header: "Input",
    question: readText(event) ?? "Jarvis is waiting for input.",
    options: [
      {
        label: "Respond",
        description: "Provide a response in the composer.",
      },
    ],
    multiSelect: false,
  };
}

function readText(event: JarvisSessionEvent): string | null {
  for (const key of ["text", "message", "content", "summary", "prompt"]) {
    const value = event.data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function latestEventTime(events: ReadonlyArray<JarvisSessionEvent>): string | null {
  return [...events].sort(compareJarvisEvents).toReversed()[0]?.occurred_at ?? null;
}
