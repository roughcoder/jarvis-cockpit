import type { ConversationContextContribution } from "@t3tools/client-runtime/conversation";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ConversationContextPanel } from "./ConversationContextPanel";

describe("ConversationContextPanel", () => {
  it("renders standard contribution sections with semantic progress and status", () => {
    const contributions: ConversationContextContribution[] = [
      {
        id: "orchestration",
        kind: "orchestration",
        title: "Orchestration",
        summary: "Joining results",
        progress: { completed: 1, total: 2, failed: 0 },
        items: [
          {
            id: "child-1",
            label: "Independent review",
            detail: "completed",
            status: "completed",
          },
          {
            id: "child-2",
            label: "Security review",
            detail: "running",
            status: "running",
          },
        ],
      },
      {
        id: "memory",
        kind: "memory",
        title: "Memory",
        items: [],
        emptyMessage: "No representation recorded.",
      },
    ];

    const markup = renderToStaticMarkup(<ConversationContextPanel contributions={contributions} />);

    expect(markup).toContain('aria-label="Conversation context"');
    expect(markup).toContain("Joining results");
    expect(markup).toContain("1/2");
    expect(markup).toContain('aria-label="Completed"');
    expect(markup).toContain('aria-label="In progress"');
    expect(markup).toContain("No representation recorded.");
  });

  it("does not render a parallel panel shell when collapsed", () => {
    expect(renderToStaticMarkup(<ConversationContextPanel contributions={[]} collapsed />)).toBe(
      "",
    );
  });
});
