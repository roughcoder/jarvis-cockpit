import { ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadStatusLabel, ThreadWorktreeIndicator } from "./ThreadStatusIndicators";

describe("ThreadStatusLabel", () => {
  it.each(["Working", "Connecting"] as const)("renders %s as an accessible spinner", (label) => {
    const markup = renderToStaticMarkup(
      <ThreadStatusLabel
        status={{
          label,
          colorClass: "text-sky-600",
          dotClass: "bg-sky-500",
          pulse: true,
        }}
      />,
    );

    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain("animate-spin");
    expect(markup).not.toContain("animate-pulse");
  });

  it("renders an unread reply as a blue dot without visible status copy", () => {
    const markup = renderToStaticMarkup(
      <ThreadStatusLabel
        status={{
          label: "Unread Reply",
          colorClass: "text-blue-600",
          dotClass: "bg-blue-500",
          pulse: false,
        }}
      />,
    );

    expect(markup).toContain('aria-label="Unread Reply"');
    expect(markup).toContain("bg-blue-500");
    expect(markup).not.toContain(">Unread Reply<");
  });
});

describe("ThreadWorktreeIndicator", () => {
  it("renders the worktree folder and branch in an accessible label", () => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "feature/sidebar-indicator",
          worktreePath: "/tmp/worktrees/sidebar-indicator",
        }}
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain(
      'aria-label="Worktree: sidebar-indicator (feature/sidebar-indicator)"',
    );
    expect(markup).toContain('data-testid="thread-worktree-thread-1"');
  });

  it.each([null, "", "   "])("renders nothing for an absent worktree path", (worktreePath) => {
    const markup = renderToStaticMarkup(
      <ThreadWorktreeIndicator
        thread={{
          id: ThreadId.make("thread-1"),
          branch: "main",
          worktreePath,
        }}
      />,
    );

    expect(markup).toBe("");
  });
});
