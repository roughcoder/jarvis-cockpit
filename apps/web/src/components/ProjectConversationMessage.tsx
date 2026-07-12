import { CheckIcon, RotateCcwIcon } from "lucide-react";

import type { ProjectConversationMessageView } from "../jarvisProjectConversations.logic";
import { deriveWorkspaceProvisionSteps } from "./projectConversationWorkspace.logic";
import ChatMarkdown from "./ChatMarkdown";
import {
  ChatAssistantMessage,
  ChatUserMessage,
  ChatUserMessageBubble,
  ChatWorkingIndicator,
} from "./chat/ChatMessagePrimitives";
import { ThreadToolCallRow } from "./chat/ThreadToolCallRow";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export function ProjectConversationMessage({
  message,
  workspaceProvisionPhase,
  onRetry,
  retryDisabled,
}: {
  readonly message: ProjectConversationMessageView;
  readonly workspaceProvisionPhase: string | null;
  readonly onRetry: (() => void) | undefined;
  readonly retryDisabled: boolean;
}) {
  const isUser = message.role === "user";
  const showProvisionStepper =
    !isUser &&
    message.workspaceProvisionRequested &&
    (message.status === "pending" || message.status === "streaming");

  if (isUser) {
    return (
      <ChatUserMessage className="pb-4">
        <ChatUserMessageBubble>
          <ChatMarkdown text={message.content} cwd={undefined} lineBreaks />
        </ChatUserMessageBubble>
      </ChatUserMessage>
    );
  }

  return (
    <div className="group/assistant pb-4">
      <ChatAssistantMessage>
        {message.status === "pending" || message.status === "streaming" ? (
          <div className="space-y-2">
            {message.content ? (
              <ChatMarkdown
                text={message.content}
                cwd={undefined}
                isStreaming={message.status === "streaming"}
              />
            ) : null}
            <ChatWorkingIndicator label="Waiting for Jarvis" />
            {showProvisionStepper ? (
              <WorkspaceProvisionStepper phase={workspaceProvisionPhase} />
            ) : null}
          </div>
        ) : null}
        {message.status === "completed" ? (
          message.toolItems.length > 0 ? (
            <div className="space-y-2">
              {message.toolItems.map((item) =>
                item.kind === "tool" ? (
                  <ThreadToolCallRow key={item.id} toolCall={item.toolCall} />
                ) : (
                  <ChatMarkdown key={item.id} text={item.text} cwd={undefined} />
                ),
              )}
            </div>
          ) : (
            <ChatMarkdown text={message.content} cwd={undefined} />
          )
        ) : null}
        {message.status === "failed" ? (
          <div className="space-y-2">
            <div className="text-destructive">{message.error ?? message.content}</div>
            {onRetry ? (
              <Button size="xs" variant="outline" onClick={onRetry} disabled={retryDisabled}>
                <RotateCcwIcon className="size-3.5" />
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </ChatAssistantMessage>
    </div>
  );
}

function WorkspaceProvisionStepper({ phase }: { readonly phase: string | null }) {
  const steps = deriveWorkspaceProvisionSteps(phase);
  return (
    <div className="rounded-md border border-border/60 bg-muted/35 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step) => (
          <div
            key={step.phase}
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-[11px]",
              step.active
                ? "font-medium text-foreground"
                : step.complete
                  ? "text-success-foreground"
                  : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px]",
                step.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : step.complete
                    ? "border-success/40 bg-success/10 text-success-foreground"
                    : "border-border bg-background",
              )}
            >
              {step.complete ? <CheckIcon className="size-2.5" /> : null}
            </span>
            <span className="truncate">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
