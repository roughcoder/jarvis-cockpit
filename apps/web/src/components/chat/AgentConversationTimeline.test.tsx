import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./MessagesTimeline", () => ({
  MessagesTimeline: (props: {
    isWorking: boolean;
    activeTurnInProgress: boolean;
    timelineEntries: ReadonlyArray<unknown>;
  }) => (
    <div
      data-working={props.isWorking}
      data-active={props.activeTurnInProgress}
      data-entry-count={props.timelineEntries.length}
    />
  ),
}));

import { AgentConversationTimeline } from "./AgentConversationTimeline";

describe("AgentConversationTimeline", () => {
  it("owns native timeline props while keeping waiting state active without a spinner", () => {
    const markup = renderToStaticMarkup(
      <AgentConversationTimeline
        conversation={conversation()}
        environmentId={EnvironmentId.make("environment-1")}
        routeThreadKey="environment-1:thread-1"
        resolvedTheme="light"
        timestampFormat="locale"
      />,
    );

    expect(markup).toContain('data-working="false"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('data-entry-count="1"');
  });

  it("renders optimistic local rows through the native timeline on the first turn", () => {
    const markup = renderToStaticMarkup(
      <AgentConversationTimeline
        conversation={{ ...conversation(), messages: [], timeline: [] }}
        environmentId={EnvironmentId.make("environment-1")}
        routeThreadKey="environment-1:thread-1"
        resolvedTheme="light"
        timestampFormat="locale"
        overlayTurns={[
          {
            id: "local-turn",
            prompt: "First prompt",
            response: "",
            status: "pending",
            error: null,
            createdAt: "2026-07-13T00:00:01.000Z",
            activities: [],
          },
        ]}
      />,
    );

    expect(markup).toContain('data-working="true"');
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('data-entry-count="1"');
  });
});

function conversation(): AgentConversation {
  const at = "2026-07-13T00:00:00.000Z";
  return {
    id: "conversation-1",
    title: "Conversation",
    lifecycle: "open",
    operationalState: "waiting_for_children",
    createdAt: at,
    updatedAt: at,
    lastTurnAt: at,
    messages: [
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "assistant",
        content: "Waiting for review",
        authorId: null,
        observedAt: at,
      },
    ],
    activities: [],
    timeline: [{ kind: "message", id: "message-1", observedAt: at }],
    routing: { aliases: [] },
    ownership: { scopeId: null, parentConversationId: null },
    diagnostics: { reason: null, execution: null },
    context: { workspace: null, archivedAt: null, archivedBy: null, archiveReason: null },
  };
}
