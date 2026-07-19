import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

interface ChatMessagePrimitiveProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** Shared right-aligned layout for every human/user message in Cockpit. */
export function ChatUserMessage({ children, className }: ChatMessagePrimitiveProps) {
  return (
    <div
      data-chat-message-role="user"
      className={cn("group flex flex-col items-end gap-1", className)}
    >
      {children}
    </div>
  );
}

/** Shared code-agent bubble treatment for user-authored content. */
export function ChatUserMessageBubble({ children, className }: ChatMessagePrimitiveProps) {
  return (
    <div
      className={cn(
        "relative max-w-[80%] rounded-2xl border border-border bg-secondary p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared unboxed surface for assistant/Jarvis/code-agent responses. */
export function ChatAssistantMessage({ children, className }: ChatMessagePrimitiveProps) {
  return (
    <div
      data-chat-message-role="assistant"
      className={cn("relative min-w-0 px-1 py-0.5", className)}
    >
      {children}
    </div>
  );
}

export function ChatWorkingIndicator({
  label = "Working...",
  className,
}: {
  readonly label?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div data-chat-working="true" className={cn("py-0.5 pl-1.5", className)}>
      <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70 tabular-nums">
        <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:200ms]" />
          <span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:400ms]" />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
