import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectConversationMessageView } from "../jarvisProjectConversations.logic";
import { ProjectConversationMessage } from "./ProjectConversationMessage";

function message(
  overrides: Partial<ProjectConversationMessageView>,
): ProjectConversationMessageView {
  return {
    id: "message-1",
    role: "assistant",
    content: "**Shared** response",
    observedAt: "2026-07-12T16:00:00Z",
    peerId: null,
    source: "history",
    status: "completed",
    error: null,
    toolItems: [],
    workspaceProvisionRequested: false,
    localTurnId: null,
    retryPrompt: null,
    retryWorkspace: null,
    ...overrides,
  };
}

describe("ProjectConversationMessage", () => {
  it("uses the shared code-agent user bubble", () => {
    const markup = renderToStaticMarkup(
      <ProjectConversationMessage
        message={message({ role: "user", content: "Review this PR" })}
        workspaceProvisionPhase={null}
        onRetry={undefined}
        retryDisabled={false}
      />,
    );

    expect(markup).toContain('data-chat-message-role="user"');
    expect(markup).toContain("bg-secondary");
    expect(markup).not.toContain("bg-primary text-primary-foreground");
  });

  it("renders assistant content through the shared Markdown surface", () => {
    const markup = renderToStaticMarkup(
      <ProjectConversationMessage
        message={message({})}
        workspaceProvisionPhase={null}
        onRetry={undefined}
        retryDisabled={false}
      />,
    );

    expect(markup).toContain('data-chat-message-role="assistant"');
    expect(markup).toContain("<strong>Shared</strong>");
    expect(markup).not.toContain("bg-card/40");
  });

  it("uses the shared working indicator for streaming Jarvis turns", () => {
    const markup = renderToStaticMarkup(
      <ProjectConversationMessage
        message={message({ content: "", status: "streaming" })}
        workspaceProvisionPhase={null}
        onRetry={undefined}
        retryDisabled={false}
      />,
    );

    expect(markup).toContain('data-chat-working="true"');
    expect(markup).toContain("Waiting for Jarvis");
  });
});
