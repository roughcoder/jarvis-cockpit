import { MessageId } from "@t3tools/contracts";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

vi.mock("./MessagesTimeline", () => ({
  MessagesTimeline: (props: {
    anchorMessageId: string | null;
    contentInsetEndAdjustment: number;
    onImageExpand: () => void;
    onManualNavigation: () => void;
  }) => (
    <div
      data-testid="messages-timeline"
      data-anchor-message-id={props.anchorMessageId}
      data-content-inset-end={props.contentInsetEndAdjustment}
      data-has-image-expand={typeof props.onImageExpand === "function"}
      data-has-manual-navigation={typeof props.onManualNavigation === "function"}
    />
  ),
}));

vi.mock("./ExpandedImageDialog", () => ({
  ExpandedImageDialog: (props: { preview: { images: ReadonlyArray<{ name: string }> } }) => (
    <div data-testid="expanded-image-dialog">{props.preview.images[0]?.name}</div>
  ),
}));

import { ConversationTimeline, type ConversationTimelineProps } from "./ConversationTimeline";
import type { ConversationTimelineController } from "./useConversationTimelineController";

describe("ConversationTimeline", () => {
  it("renders the shared scroll affordance at the composer inset", () => {
    const markup = renderToStaticMarkup(
      <ConversationTimeline
        {...timelineProps()}
        controller={controller({ showScrollToBottom: true, composerInset: 176 })}
      />,
    );

    expect(markup).toContain('data-testid="messages-timeline"');
    expect(markup).toContain('aria-label="Scroll to end"');
    expect(markup).toContain("bottom:180px");
  });

  it("omits the scroll affordance while following the live edge", () => {
    const markup = renderToStaticMarkup(
      <ConversationTimeline {...timelineProps()} controller={controller()} />,
    );

    expect(markup).not.toContain('aria-label="Scroll to end"');
  });

  it("binds controller-owned viewport props and renders its expanded image", () => {
    const anchorMessageId = MessageId.make("message-1");
    const markup = renderToStaticMarkup(
      <ConversationTimeline
        {...timelineProps()}
        controller={controller({
          anchorMessageId,
          composerInset: 144,
          expandedImage: {
            images: [{ src: "data:image/png;base64,iVBORw0KGgo=", name: "screenshot.png" }],
            index: 0,
          },
        })}
      />,
    );

    expect(markup).toContain('data-anchor-message-id="message-1"');
    expect(markup).toContain('data-content-inset-end="144"');
    expect(markup).toContain('data-has-image-expand="true"');
    expect(markup).toContain('data-has-manual-navigation="true"');
    expect(markup).toContain('data-testid="expanded-image-dialog"');
    expect(markup).toContain("screenshot.png");
  });
});

function timelineProps(): Omit<ConversationTimelineProps, "controller"> {
  return {
    isWorking: false,
    activeTurnInProgress: false,
    activeTurnStartedAt: null,
    timelineEntries: [],
    latestTurn: null,
    runningTurnId: null,
    turnDiffSummaryByAssistantMessageId: new Map(),
    routeThreadKey: "environment-1:thread-1",
    onOpenTurnDiff: () => {},
    revertTurnCountByUserMessageId: new Map(),
    onRevertUserMessage: () => {},
    isRevertingCheckpoint: false,
    activeThreadEnvironmentId: "environment-1" as never,
    markdownCwd: undefined,
    resolvedTheme: "light",
    timestampFormat: "locale",
    workspaceRoot: undefined,
  };
}

function controller(
  overrides: Partial<ConversationTimelineController> = {},
): ConversationTimelineController {
  return {
    listRef: createRef<LegendListRef>(),
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
    ...overrides,
  };
}
