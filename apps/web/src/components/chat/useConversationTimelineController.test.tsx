import { MessageId } from "@t3tools/contracts";
import { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  conversationTimelineRealContentOverflowsViewport,
  useConversationTimelineController,
} from "./useConversationTimelineController";

describe("useConversationTimelineController", () => {
  it("starts at the live edge with no anchor, inset, scroll affordance, or image", () => {
    function Harness() {
      const controller = useConversationTimelineController({
        conversationKey: "environment-1:thread-1",
        timelineEntries: [],
      });
      return (
        <div
          data-anchor={controller.anchorMessageId}
          data-composer-inset={controller.composerInset}
          data-show-scroll={controller.showScrollToBottom}
          data-expanded-image={controller.expandedImage !== null}
        />
      );
    }

    const markup = renderToStaticMarkup(<Harness />);

    expect(markup).toContain('data-composer-inset="0"');
    expect(markup).toContain('data-show-scroll="false"');
    expect(markup).toContain('data-expanded-image="false"');
    expect(markup).not.toContain("data-anchor=");
  });

  it("publishes the optimistic message anchor when a turn begins", () => {
    function Harness() {
      const controller = useConversationTimelineController({
        conversationKey: "environment-1:thread-1",
        timelineEntries: [],
      });
      const started = useRef(false);
      if (!started.current) {
        started.current = true;
        controller.beginAnchoredTurn(MessageId.make("optimistic-user-message"));
      }
      return <div data-anchor={controller.anchorMessageId} />;
    }

    const markup = renderToStaticMarkup(<Harness />);

    expect(markup).toContain('data-anchor="optimistic-user-message"');
  });
});

describe("conversationTimelineRealContentOverflowsViewport", () => {
  it("ignores reserved tail space and detects only real row overflow", () => {
    const state = {
      data: ["first", "last"],
      scroll: 0,
      scrollLength: 700,
      positionAtIndex: (index: number) => [0, 420][index],
      sizeAtIndex: (index: number) => [300, 80][index],
    };

    expect(conversationTimelineRealContentOverflowsViewport(state, 100)).toBe(false);
    expect(conversationTimelineRealContentOverflowsViewport(state, 220)).toBe(true);
  });

  it("does not follow when row measurements are missing", () => {
    expect(
      conversationTimelineRealContentOverflowsViewport(
        {
          data: ["row"],
          scroll: 0,
          scrollLength: 700,
          positionAtIndex: () => undefined,
          sizeAtIndex: () => 80,
        },
        0,
      ),
    ).toBe(false);
  });
});
