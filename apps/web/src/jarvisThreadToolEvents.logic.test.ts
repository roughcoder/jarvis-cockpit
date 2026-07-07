import { describe, expect, it } from "vite-plus/test";
import type { JsonObject } from "@t3tools/contracts";

import {
  mergeJarvisThreadToolEventsWithReply,
  parseJarvisThreadToolEvents,
} from "./jarvisThreadToolEvents.logic";

function toolCallFrame(): JsonObject {
  return {
    event: "tool.call",
    data: {
      event_id: "ev_call",
      sequence: 1,
      type: "tool.call",
      occurred_at: "2026-07-07T10:00:00.000Z",
      turn_id: "turn_1",
      message_id: "call_1",
      data: {
        id: "call_1",
        item: {
          id: "call_1",
          type: "tool_use",
          name: "add_finding",
          input: {
            project: "Jarvis",
            content: "Tool calls should render in cockpit.",
          },
        },
      },
    },
  };
}

function toolResultFrame(): JsonObject {
  return {
    event: "tool.result",
    data: {
      event_id: "ev_result",
      sequence: 2,
      type: "tool.result",
      occurred_at: "2026-07-07T10:00:01.000Z",
      turn_id: "turn_1",
      message_id: "call_1",
      data: {
        id: "call_1",
        item: {
          id: "call_1",
          type: "tool_result",
          output: {
            ok: true,
            finding_id: "finding_1",
          },
        },
      },
    },
  };
}

describe("jarvis thread tool events", () => {
  it("pairs tool.call and tool.result frames by message id", () => {
    const [toolCall] = parseJarvisThreadToolEvents([toolCallFrame(), toolResultFrame()]);

    expect(toolCall).toMatchObject({
      id: "call_1",
      callId: "call_1",
      messageId: "call_1",
      eventId: "ev_call",
      sequence: 1,
      occurredAt: "2026-07-07T10:00:00.000Z",
      name: "add_finding",
      inputSummary: "project: Jarvis, content: Tool calls should render in cockpit.",
      resultSummary: "ok: true, finding_id: finding_1",
      status: "completed",
    });
  });

  it("keeps an unpaired tool.call pending", () => {
    const [toolCall] = parseJarvisThreadToolEvents([toolCallFrame()]);

    expect(toolCall).toMatchObject({
      id: "call_1",
      name: "add_finding",
      result: null,
      resultSummary: null,
      status: "pending",
    });
  });

  it("returns only the reply for a no-tool turn", () => {
    const items = mergeJarvisThreadToolEventsWithReply({
      text: "No tool needed.",
      events: [
        {
          event: "thread.reply",
          data: "No tool needed.",
        },
      ],
    });

    expect(items).toEqual([{ kind: "reply", id: "reply:0", text: "No tool needed." }]);
  });

  it("interleaves tool call rows with streamed reply chunks", () => {
    const items = mergeJarvisThreadToolEventsWithReply({
      text: "Before after.",
      events: [
        { event: "thread.reply", data: "Before " },
        toolCallFrame(),
        toolResultFrame(),
        { event: "thread.reply", data: "after." },
      ],
    });

    expect(items.map((item) => item.kind)).toEqual(["reply", "tool", "reply"]);
    expect(items[0]).toEqual({ kind: "reply", id: "reply:0", text: "Before " });
    expect(items[1]?.kind === "tool" ? items[1].toolCall.status : null).toBe("completed");
    expect(items[2]).toEqual({ kind: "reply", id: "reply:1", text: "after." });
  });
});
