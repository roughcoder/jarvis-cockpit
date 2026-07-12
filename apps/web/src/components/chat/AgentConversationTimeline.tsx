import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import type { EnvironmentId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import type { LegendListRef } from "@legendapp/list/react";
import { useMemo, useRef } from "react";
import { MessageSquareIcon } from "lucide-react";

import {
  agentConversationOperationalFlags,
  agentConversationTimelineEntries,
} from "../../agentConversationTimeline.logic";
import { MessagesTimeline } from "./MessagesTimeline";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

interface AgentConversationTimelineProps {
  readonly conversation: AgentConversation;
  readonly environmentId: EnvironmentId;
  readonly routeThreadKey: string;
  readonly resolvedTheme: "light" | "dark";
  readonly timestampFormat: TimestampFormat;
  readonly showEmptyState?: boolean;
  readonly markdownCwd?: string;
  readonly workspaceRoot?: string;
}

const NOOP = () => {};

export function AgentConversationTimeline({
  conversation,
  environmentId,
  routeThreadKey,
  resolvedTheme,
  timestampFormat,
  showEmptyState = true,
  markdownCwd,
  workspaceRoot,
}: AgentConversationTimelineProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const timelineEntries = useMemo(
    () => agentConversationTimelineEntries(conversation),
    [conversation],
  );
  const flags = agentConversationOperationalFlags(conversation.operationalState);

  if (timelineEntries.length === 0 && !flags.isWorking) {
    if (!showEmptyState) return null;
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <MessageSquareIcon className="mb-4 size-7 text-muted-foreground" />
          <EmptyTitle>{conversation.title}</EmptyTitle>
          <EmptyDescription>
            {conversation.context.workspace
              ? "Continue the workspace conversation from this surface."
              : "Planning conversation - no repo access. Attach a repo to let it inspect code."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <MessagesTimeline
      isWorking={flags.isWorking}
      activeTurnInProgress={flags.activeTurnInProgress}
      activeTurnStartedAt={null}
      listRef={listRef}
      timelineEntries={timelineEntries}
      latestTurn={null}
      runningTurnId={null}
      turnDiffSummaryByAssistantMessageId={new Map()}
      routeThreadKey={routeThreadKey}
      onOpenTurnDiff={NOOP}
      revertTurnCountByUserMessageId={new Map()}
      onRevertUserMessage={NOOP}
      isRevertingCheckpoint={false}
      onImageExpand={NOOP}
      activeThreadEnvironmentId={environmentId}
      markdownCwd={markdownCwd}
      resolvedTheme={resolvedTheme}
      timestampFormat={timestampFormat}
      workspaceRoot={workspaceRoot}
      anchorMessageId={null}
      onAnchorReady={NOOP}
      onAnchorSizeChanged={NOOP}
      contentInsetEndAdjustment={0}
      onIsAtEndChange={NOOP}
      onManualNavigation={NOOP}
    />
  );
}
