import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  ChatAssistantMessage,
  ChatUserMessage,
  ChatUserMessageBubble,
  ChatWorkingIndicator,
} from "./ChatMessagePrimitives";

describe("shared chat message primitives", () => {
  it("keeps user messages on the code-agent surface", () => {
    const markup = renderToStaticMarkup(
      <ChatUserMessage>
        <ChatUserMessageBubble>Review this change</ChatUserMessageBubble>
      </ChatUserMessage>,
    );

    expect(markup).toContain('data-chat-message-role="user"');
    expect(markup).toContain("max-w-[80%]");
    expect(markup).toContain("rounded-2xl");
    expect(markup).toContain("bg-secondary");
    expect(markup).not.toContain("bg-primary");
  });

  it("keeps assistant content unboxed like code-agent replies", () => {
    const markup = renderToStaticMarkup(
      <ChatAssistantMessage>
        <p>Combined review</p>
      </ChatAssistantMessage>,
    );

    expect(markup).toContain('data-chat-message-role="assistant"');
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("bg-card");
  });

  it("shares the code-agent working treatment", () => {
    const markup = renderToStaticMarkup(<ChatWorkingIndicator label="Waiting for children" />);

    expect(markup).toContain('data-chat-working="true"');
    expect(markup).toContain("Waiting for children");
    expect(markup).toContain("animate-pulse");
  });
});
