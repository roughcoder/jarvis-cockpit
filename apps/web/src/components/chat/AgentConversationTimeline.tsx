import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { TurnId, type EnvironmentId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { MessageSquareIcon } from "lucide-react";

import { agentConversationOperationalFlags } from "../../agentConversationTimeline.logic";
import {
  mergeAgentConversationTimelineOverlay,
  type AgentConversationOverlayTurn,
  type AgentConversationTimelineOverlayResult,
} from "../../agentConversationTimelineOverlay.logic";
import { ConversationTimeline } from "./ConversationTimeline";
import type { ConversationTimelineController } from "./useConversationTimelineController";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";

interface AgentConversationTimelineProps {
  readonly conversation: AgentConversation;
  readonly timeline?: AgentConversationTimelineOverlayResult;
  readonly controller: ConversationTimelineController;
  readonly environmentId: EnvironmentId;
  readonly routeThreadKey: string;
  readonly resolvedTheme: "light" | "dark";
  readonly timestampFormat: TimestampFormat;
  readonly showEmptyState?: boolean;
  readonly markdownCwd?: string;
  readonly workspaceRoot?: string;
  readonly overlayTurns?: ReadonlyArray<AgentConversationOverlayTurn>;
  readonly onRecoveryAction?: (actionId: string) => void;
  readonly onOpenConversationTarget?: (targetId: string) => void;
  readonly recoveryActionsDisabled?: boolean;
}

const NOOP = () => {};
const EMPTY_TURN_DIFF_SUMMARIES = new Map();
const EMPTY_REVERT_COUNTS = new Map();

export function AgentConversationTimeline({
  conversation,
  timeline,
  controller,
  environmentId,
  routeThreadKey,
  resolvedTheme,
  timestampFormat,
  showEmptyState = true,
  markdownCwd,
  workspaceRoot,
  overlayTurns = EMPTY_OVERLAY_TURNS,
  onRecoveryAction,
  onOpenConversationTarget,
  recoveryActionsDisabled = false,
}: AgentConversationTimelineProps) {
  const resolvedTimeline =
    timeline ?? mergeAgentConversationTimelineOverlay(conversation, overlayTurns);
  const flags = agentConversationOperationalFlags(conversation.operationalState);
  const activeTurn = conversation.runtime.activeTurn;

  if (resolvedTimeline.timelineEntries.length === 0 && !resolvedTimeline.isWorking) {
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
    <ConversationTimeline
      controller={controller}
      isWorking={resolvedTimeline.isWorking}
      activeTurnInProgress={flags.activeTurnInProgress || resolvedTimeline.isWorking}
      activeTurnStartedAt={activeTurn?.startedAt ?? null}
      timelineEntries={resolvedTimeline.timelineEntries}
      latestTurn={null}
      runningTurnId={activeTurn ? TurnId.make(activeTurn.id) : null}
      turnDiffSummaryByAssistantMessageId={EMPTY_TURN_DIFF_SUMMARIES}
      routeThreadKey={routeThreadKey}
      onOpenTurnDiff={NOOP}
      revertTurnCountByUserMessageId={EMPTY_REVERT_COUNTS}
      onRevertUserMessage={NOOP}
      isRevertingCheckpoint={false}
      activeThreadEnvironmentId={environmentId}
      markdownCwd={markdownCwd}
      resolvedTheme={resolvedTheme}
      timestampFormat={timestampFormat}
      workspaceRoot={workspaceRoot}
      onRecoveryAction={onRecoveryAction ?? NOOP}
      onOpenConversationTarget={onOpenConversationTarget ?? NOOP}
      recoveryActionsDisabled={recoveryActionsDisabled}
    />
  );
}

const EMPTY_OVERLAY_TURNS: ReadonlyArray<AgentConversationOverlayTurn> = [];
