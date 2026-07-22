import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ConversationTimelineController } from "./useConversationTimelineController";
import { ConversationComposer } from "./ConversationComposer";

const controller: ConversationTimelineController = {
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

describe("ConversationComposer", () => {
  it("renders one shared floating shell for banners, composer, and lower chrome", () => {
    const markup = renderToStaticMarkup(
      <ConversationComposer
        controller={controller}
        banners={<div>Banner</div>}
        lowerChrome={<div>Branch controls</div>}
        lowerChromeClassName="safe-padding"
      >
        <form>Composer</form>
      </ConversationComposer>,
    );

    expect(markup).toContain('data-chat-composer-overlay="true"');
    expect(markup).toContain("chat-composer-shared-blur");
    expect(markup).toContain("Banner");
    expect(markup).toContain("Composer");
    expect(markup).toContain("Branch controls");
    expect(markup).toContain("safe-padding");
  });
});
