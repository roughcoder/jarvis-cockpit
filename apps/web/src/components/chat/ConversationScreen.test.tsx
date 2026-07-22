import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ConversationScreen } from "./ConversationScreen";

describe("ConversationScreen", () => {
  it("renders runtime contributions through one ordered presentation shell", () => {
    const markup = renderToStaticMarkup(
      <ConversationScreen
        header={<header>Header</header>}
        banners={<aside>Banner</aside>}
        timeline={<section>Timeline</section>}
        composer={<form>Composer</form>}
        chatOverlays={<dialog open>Chat overlay</dialog>}
        afterChatColumn={<footer>After chat</footer>}
        floatingControls={<nav>Controls</nav>}
        inlinePanel={<aside>Inline panel</aside>}
        sheetPanel={<aside>Sheet panel</aside>}
        overlays={<dialog open>Root overlay</dialog>}
        chatColumnMaximizedAway
      />,
    );

    expect(markup).toContain('data-conversation-screen="true"');
    expect(markup).toContain('data-chat-column-maximized-away="true"');
    expect(markup.indexOf("Header")).toBeLessThan(markup.indexOf("Timeline"));
    expect(markup.indexOf("Timeline")).toBeLessThan(markup.indexOf("Composer"));
    expect(markup).toContain("Inline panel");
    expect(markup).toContain("Sheet panel");
    expect(markup).toContain("Root overlay");
  });
});
