import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  NetworkIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";

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

  if (message.orchestrationLifecycle) {
    return <OrchestrationLifecycleCard lifecycle={message.orchestrationLifecycle} />;
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

function OrchestrationLifecycleCard({
  lifecycle,
}: {
  readonly lifecycle: NonNullable<ProjectConversationMessageView["orchestrationLifecycle"]>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const completeCount = lifecycle.children.filter((child) => child.status === "completed").length;
  const failedCount = lifecycle.children.filter((child) => child.status === "failed").length;
  const heading =
    lifecycle.status === "completed"
      ? "Child reviews complete"
      : lifecycle.status === "failed"
        ? "Child review orchestration failed"
        : lifecycle.status === "running"
          ? "Combining child reviews"
          : "Waiting for child reviews";
  return (
    <div className="pb-4">
      <section
        className="overflow-hidden rounded-lg border border-border/65 bg-muted/20"
        aria-label={heading}
      >
        <div className="flex items-center gap-2 border-b border-border/45 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs">
            <NetworkIcon className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">{heading}</p>
            <p className="text-[11px] text-muted-foreground">
              {completeCount}/{lifecycle.children.length} complete
              {failedCount > 0 ? ` · ${failedCount} failed` : ""}
            </p>
          </div>
          {lifecycle.status === "completed" ? (
            <CheckIcon className="size-4 text-success-foreground" aria-label="Completed" />
          ) : lifecycle.status === "failed" ? (
            <CircleAlertIcon className="size-4 text-destructive" aria-label="Failed" />
          ) : (
            <LoaderCircleIcon
              className="size-4 animate-spin text-muted-foreground"
              aria-label="In progress"
            />
          )}
        </div>
        <div className="divide-y divide-border/35 px-3">
          {lifecycle.children.map((child) => (
            <div key={child.id} className="flex items-center gap-2 py-2">
              <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground/88">{child.title}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{child.phase}</p>
              </div>
              {child.status === "completed" ? (
                <CheckIcon className="size-3.5 text-success-foreground" />
              ) : child.status === "failed" ? (
                <CircleAlertIcon className="size-3.5 text-destructive" />
              ) : (
                <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 border-t border-border/45 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((value) => !value)}
        >
          <ChevronDownIcon
            className={`size-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
          />
          Technical details
        </button>
        {showDetails ? (
          <div className="border-t border-border/35 px-3 py-2 font-mono text-[10px] text-muted-foreground">
            <div>watch {lifecycle.watchId}</div>
            {lifecycle.children.map((child) => (
              <div key={child.id}>{child.id}</div>
            ))}
          </div>
        ) : null}
      </section>
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
