import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { RightPanelTabs } from "./RightPanelTabs";

describe("RightPanelTabs conversation context surface", () => {
  it("renders context as a native panel tab without requiring unrelated add callbacks", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabs
        mode="inline"
        surfaces={[{ id: "context", kind: "context" }]}
        activeSurfaceId="context"
        pendingSurfaceIds={new Set()}
        previewSessions={{}}
        terminalLabelsById={new Map()}
        onActivate={vi.fn()}
        onCloseSurface={vi.fn()}
        onCloseOtherSurfaces={vi.fn()}
        onCloseSurfacesToRight={vi.fn()}
        onCloseAllSurfaces={vi.fn()}
        onAddContext={vi.fn()}
        contextAvailable
      >
        <div>Conversation state</div>
      </RightPanelTabs>,
    );

    expect(markup).toContain("Context");
    expect(markup).toContain("Conversation state");
    expect(markup).toContain('aria-label="Add panel surface"');
  });
});
