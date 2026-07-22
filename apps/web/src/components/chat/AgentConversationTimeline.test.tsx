import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./MessagesTimeline", () => ({
  MessagesTimeline: (props: {
    isWorking: boolean;
    activeTurnInProgress: boolean;
    timelineEntries: ReadonlyArray<{
      id: string;
      kind: "message" | "work";
      message?: { role: string; text: string };
      entry?: { label: string; detail?: string; semanticActivityStatus?: string };
    }>;
  }) => (
    <div
      data-working={props.isWorking}
      data-active={props.activeTurnInProgress}
      data-entry-count={props.timelineEntries.length}
    >
      {props.timelineEntries.map((entry) => (
        <div
          key={entry.id}
          data-entry-id={entry.id}
          data-entry-kind={entry.kind}
          data-entry-status={entry.entry?.semanticActivityStatus}
        >
          {entry.kind === "message"
            ? `${entry.message?.role}:${entry.message?.text}`
            : `${entry.entry?.label}:${entry.entry?.detail ?? ""}`}
        </div>
      ))}
    </div>
  ),
}));

import { AgentConversationTimeline } from "./AgentConversationTimeline";
import type { ConversationTimelineController } from "./useConversationTimelineController";

const timelineController: ConversationTimelineController = {
  listRef: { current: null },
  anchorMessageId: null,
  composerOverlayRef: () => {},
  composerInset: 0,
  showScrollToBottom: false,
  expandedImage: null,
  beginAnchoredTurn: () => {},
  scrollToEnd: () => {},
  onAnchorReady: () => {},
  onAnchorSizeChanged: () => {},
  onIsAtEndChange: () => {},
  onManualNavigation: () => {},
  onExpandImage: () => {},
  closeExpandedImage: () => {},
};

describe("AgentConversationTimeline", () => {
  it("owns native timeline props while keeping waiting state active without a spinner", () => {
    const markup = renderToStaticMarkup(
      <AgentConversationTimeline
        conversation={conversation()}
        controller={timelineController}
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
        controller={timelineController}
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

  it("passes waiting, queued, and recoverable failure rows into the shared timeline", () => {
    const base = conversation();
    const markup = renderToStaticMarkup(
      <AgentConversationTimeline
        conversation={{
          ...base,
          operationalState: "waiting_for_children",
          messages: [],
          activities: [
            {
              id: "children-waiting",
              conversationId: base.id,
              kind: "children.waiting",
              status: "waiting",
              title: "Waiting for 2 child conversations",
              summary: null,
              toolName: null,
              correlationId: "watch-1",
              relatedConversationIds: ["child-a", "child-b"],
              startedAt: "2026-07-13T00:00:01.000Z",
              completedAt: null,
              error: null,
            },
            {
              id: "turn-queued",
              conversationId: base.id,
              kind: "turn.queued",
              status: "waiting",
              title: "Turn queued",
              summary: "Waiting for the active turn to finish.",
              toolName: null,
              correlationId: "queue-1",
              relatedConversationIds: [],
              startedAt: "2026-07-13T00:00:02.000Z",
              completedAt: null,
              error: null,
            },
          ],
          timeline: [
            {
              kind: "activity",
              id: "children-waiting",
              observedAt: "2026-07-13T00:00:01.000Z",
            },
            {
              kind: "activity",
              id: "turn-queued",
              observedAt: "2026-07-13T00:00:02.000Z",
            },
          ],
        }}
        controller={timelineController}
        environmentId={EnvironmentId.make("environment-1")}
        routeThreadKey="environment-1:thread-1"
        resolvedTheme="light"
        timestampFormat="locale"
        overlayTurns={[
          {
            id: "failed-turn",
            prompt: "Retry the task",
            response: "",
            status: "failed",
            error: "Connection lost",
            createdAt: "2026-07-13T00:00:03.000Z",
            activities: [],
          },
        ]}
      />,
    );

    expect(markup).toContain('data-entry-id="activity:children-waiting"');
    expect(markup).toContain(
      "Waiting for 2 child conversations:Child conversation 1\nChild conversation 2",
    );
    expect(markup).toContain('data-entry-id="activity:turn-queued"');
    expect(markup).toContain("Turn queued:Waiting for the active turn to finish.");
    expect(markup).toContain('data-entry-id="overlay:failed-turn:failure"');
    expect(markup).toContain('data-entry-status="failed"');
    expect(markup).toContain("Turn failed:Connection lost");
  });
});

function conversation(): AgentConversation {
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
