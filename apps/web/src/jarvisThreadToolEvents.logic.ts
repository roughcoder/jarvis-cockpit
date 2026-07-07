import type { JarvisProjectThreadTurnResult, JsonObject } from "@t3tools/contracts";

export interface JarvisThreadToolCallView {
  readonly id: string;
  readonly callId: string;
  readonly messageId: string | null;
  readonly eventId: string | null;
  readonly sequence: number | null;
  readonly occurredAt: string | null;
  readonly name: string;
  readonly input: unknown;
  readonly inputSummary: string | null;
  readonly result: unknown;
  readonly resultSummary: string | null;
  readonly status: "pending" | "completed";
}

export type JarvisThreadTurnMergedItem =
  | { readonly kind: "reply"; readonly id: string; readonly text: string }
  | { readonly kind: "tool"; readonly id: string; readonly toolCall: JarvisThreadToolCallView };

interface ToolCallAccumulator {
  readonly order: number;
  readonly call: ParsedToolCall;
  result: ParsedToolResult | null;
}

interface ParsedToolCall {
  readonly callId: string;
  readonly messageId: string | null;
  readonly eventId: string | null;
  readonly sequence: number | null;
  readonly occurredAt: string | null;
  readonly name: string;
  readonly input: unknown;
}

interface ParsedToolResult {
  readonly result: unknown;
}

const TOOL_EVENT_TYPES = new Set(["tool.call", "tool.result"]);
const MAX_SUMMARY_LENGTH = 180;

export function parseJarvisThreadToolEvents(
  events: ReadonlyArray<JsonObject>,
): JarvisThreadToolCallView[] {
  const byKey = new Map<string, ToolCallAccumulator>();
  const orderedCalls: ToolCallAccumulator[] = [];
  const pendingResults = new Map<string, ParsedToolResult>();

  events.forEach((event, index) => {
    const kind = readEventKind(event);
    if (!TOOL_EVENT_TYPES.has(kind)) {
      return;
    }
    const projectedEvent = readProjectedEvent(event);
    if (kind === "tool.call") {
      const call = parseToolCall(projectedEvent, index);
      const accumulator: ToolCallAccumulator = {
        order: index,
        call,
        result: null,
      };
      orderedCalls.push(accumulator);
      for (const key of toolEventKeys(call.messageId, call.callId)) {
        byKey.set(key, accumulator);
        const pending = pendingResults.get(key);
        if (pending !== undefined) {
          accumulator.result = pending;
          pendingResults.delete(key);
        }
      }
      return;
    }

    const result = parseToolResult(projectedEvent);
    const keys = toolEventKeys(readMessageId(projectedEvent), readCallId(projectedEvent));
    const match = keys.map((key) => byKey.get(key)).find((candidate) => candidate !== undefined);
    if (match !== undefined) {
      match.result = result;
      return;
    }
    for (const key of keys) {
      pendingResults.set(key, result);
    }
  });

  return orderedCalls
    .sort((left, right) => left.order - right.order)
    .map(({ call, result }): JarvisThreadToolCallView => {
      const id = call.messageId ?? call.callId;
      return {
        id,
        callId: call.callId,
        messageId: call.messageId,
        eventId: call.eventId,
        sequence: call.sequence,
        occurredAt: call.occurredAt,
        name: call.name,
        input: call.input,
        inputSummary: summarizeToolPayload(call.input),
        result: result?.result ?? null,
        resultSummary: summarizeToolPayload(result?.result ?? null),
        status: result === null ? "pending" : "completed",
      };
    });
}

export function mergeJarvisThreadToolEventsWithReply(
  result: Pick<JarvisProjectThreadTurnResult, "events" | "text">,
): JarvisThreadTurnMergedItem[] {
  const toolCalls = parseJarvisThreadToolEvents(result.events);
  const toolByMessageId = new Map<string, JarvisThreadToolCallView>();
  const toolByCallId = new Map<string, JarvisThreadToolCallView>();
  for (const toolCall of toolCalls) {
    if (toolCall.messageId !== null) {
      toolByMessageId.set(toolCall.messageId, toolCall);
    }
    toolByCallId.set(toolCall.callId, toolCall);
  }

  const items: JarvisThreadTurnMergedItem[] = [];
  const replyParts: string[] = [];
  let replyIndex = 0;
  let hasReplyFrame = false;

  const flushReply = () => {
    const text = replyParts.join("");
    replyParts.length = 0;
    if (text.trim().length === 0) {
      return;
    }
    items.push({ kind: "reply", id: `reply:${replyIndex++}`, text });
  };

  for (const event of result.events) {
    const kind = readEventKind(event);
    if (kind === "thread.reply") {
      hasReplyFrame = true;
      replyParts.push(readReplyText(event));
      continue;
    }
    if (kind !== "tool.call") {
      continue;
    }
    const projectedEvent = readProjectedEvent(event);
    const messageId = readMessageId(projectedEvent);
    const callId = readCallId(projectedEvent);
    const toolCall =
      (messageId === null ? undefined : toolByMessageId.get(messageId)) ??
      (callId === null ? undefined : toolByCallId.get(callId));
    if (toolCall === undefined) {
      continue;
    }
    flushReply();
    items.push({ kind: "tool", id: `tool:${toolCall.id}`, toolCall });
  }

  flushReply();
  if (!hasReplyFrame && result.text.trim().length > 0) {
    items.push({ kind: "reply", id: `reply:${replyIndex}`, text: result.text });
  }
  return items;
}

function parseToolCall(projectedEvent: unknown, index: number): ParsedToolCall {
  const data = readRecord(projectedEvent)?.data;
  const dataRecord = readRecord(data);
  const item = readRecord(dataRecord?.item) ?? dataRecord;
  const callId =
    readCallId(projectedEvent) ??
    readString(item?.id) ??
    readString(item?.call_id) ??
    `tool:${index}`;
  return {
    callId,
    messageId: readMessageId(projectedEvent),
    eventId: readString(readRecord(projectedEvent)?.event_id),
    sequence: readNumber(readRecord(projectedEvent)?.sequence),
    occurredAt: readString(readRecord(projectedEvent)?.occurred_at),
    name: readString(item?.name) ?? readString(dataRecord?.name) ?? "tool",
    input: item?.input ?? dataRecord?.input ?? null,
  };
}

function parseToolResult(projectedEvent: unknown): ParsedToolResult {
  const data = readRecord(projectedEvent)?.data;
  const dataRecord = readRecord(data);
  const item = readRecord(dataRecord?.item) ?? dataRecord;
  return {
    result:
      item?.output ??
      item?.content ??
      item?.result ??
      dataRecord?.output ??
      dataRecord?.content ??
      dataRecord?.result ??
      item ??
      null,
  };
}

function readEventKind(event: JsonObject): string {
  const direct = readString(event.event);
  if (direct !== null) {
    return direct;
  }
  const data = readProjectedEvent(event);
  return readString(readRecord(data)?.type) ?? "message";
}

function readProjectedEvent(event: JsonObject): unknown {
  return event.data ?? event;
}

function readMessageId(projectedEvent: unknown): string | null {
  const record = readRecord(projectedEvent);
  return readString(record?.message_id);
}

function readCallId(projectedEvent: unknown): string | null {
  const record = readRecord(projectedEvent);
  const data = readRecord(record?.data);
  const item = readRecord(data?.item);
  return (
    readString(data?.id) ??
    readString(item?.call_id) ??
    readString(item?.id) ??
    readString(record?.message_id)
  );
}

function toolEventKeys(messageId: string | null, callId: string | null): ReadonlyArray<string> {
  const keys = new Set<string>();
  if (messageId !== null) {
    keys.add(messageId);
  }
  if (callId !== null) {
    keys.add(callId);
  }
  return [...keys];
}

function readReplyText(event: JsonObject): string {
  const data = event.data;
  if (typeof data === "string") {
    return data;
  }
  const record = readRecord(data);
  const candidate = record?.text ?? record?.reply ?? record?.content;
  return typeof candidate === "string" ? candidate : "";
}

export function summarizeToolPayload(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return truncateSummary(value.replace(/\s+/gu, " ").trim());
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return truncateSummary(JSON.stringify(value));
  }
  const record = readRecord(value);
  if (record === null) {
    return truncateSummary(String(value));
  }
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return "{}";
  }
  const preview = entries
    .slice(0, 4)
    .map(([key, entryValue]) => `${key}: ${summarizeEntryValue(entryValue)}`)
    .join(", ");
  const suffix = entries.length > 4 ? `, +${entries.length - 4} more` : "";
  return truncateSummary(`${preview}${suffix}`);
}

function summarizeEntryValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value.replace(/\s+/gu, " ").trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function truncateSummary(value: string): string | null {
  if (value.length === 0) {
    return null;
  }
  if (value.length <= MAX_SUMMARY_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
