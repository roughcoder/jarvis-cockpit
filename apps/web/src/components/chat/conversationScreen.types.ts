import type {
  ConversationContextContribution,
  ConversationExecutionControl,
  ConversationLifecycle,
} from "@t3tools/client-runtime/conversation";
import type { EnvironmentId, MessageId, ThreadId, TurnId } from "@t3tools/contracts";

import type { SessionPhase, TurnDiffSummary } from "../../types";
import type { ComposerCapabilities } from "../composer/composerCapabilities";
import type { TimelineEntry } from "../../session-logic";
import type { TimelineLatestTurn } from "./MessagesTimeline.logic";

export interface ConversationTimelineCapabilities {
  readonly diffs: boolean;
  readonly checkpoints: boolean;
  readonly imageExpansion: boolean;
  readonly reasoningSummaries: boolean;
  readonly childNavigation: boolean;
}

export interface ConversationExecutionCapabilities {
  readonly send: boolean;
  readonly queue: boolean;
  readonly steer: boolean;
  readonly interrupt: boolean;
  readonly approvals: boolean;
  readonly userInput: boolean;
}

export interface ConversationPanelCapabilities {
  readonly context: boolean;
  readonly files: boolean;
  readonly diff: boolean;
  readonly terminal: boolean;
  readonly browser: boolean;
}

export interface ConversationSurfaceCapabilities {
  readonly timeline: ConversationTimelineCapabilities;
  readonly composer: ComposerCapabilities;
  readonly execution: ConversationExecutionCapabilities;
  readonly panels: ConversationPanelCapabilities;
}

export interface ConversationScreenIdentity {
  readonly environmentId: EnvironmentId;
  readonly conversationId: string;
  readonly threadId: ThreadId;
  readonly routeThreadKey: string;
  readonly scopeId: string | null;
}

export interface ConversationScreenState {
  readonly identity: ConversationScreenIdentity;
  readonly title: string;
  readonly projectName: string | null;
  readonly lifecycle: ConversationLifecycle;
  readonly phase: SessionPhase;
  readonly loading: boolean;
  readonly error: string | null;
  readonly statusLabel: string | null;
  readonly statusDescription: string | null;
}

export interface ConversationTimelineState {
  readonly entries: ReadonlyArray<TimelineEntry>;
  readonly isWorking: boolean;
  readonly activeTurnInProgress: boolean;
  readonly activeTurnStartedAt: string | null;
  readonly latestTurn: TimelineLatestTurn | null;
  readonly runningTurnId: TurnId | null;
  readonly turnDiffSummaryByAssistantMessageId: ReadonlyMap<MessageId, TurnDiffSummary>;
  readonly revertTurnCountByUserMessageId: ReadonlyMap<MessageId, number>;
  readonly isRevertingCheckpoint: boolean;
  readonly markdownCwd: string | null;
  readonly workspaceRoot: string | null;
  readonly anchorMessageId: MessageId | null;
  readonly contentInsetEndAdjustment: number;
}

export interface ConversationComposerState {
  readonly capabilities: ComposerCapabilities;
  readonly phase: SessionPhase;
  readonly allowSendWhileRunning: boolean;
  readonly connecting: boolean;
  readonly sendBusy: boolean;
  readonly preparingWorkspace: boolean;
  readonly disabledReason: string | null;
  readonly pendingApprovalCount: number;
  readonly pendingUserInputCount: number;
}

export type ConversationPanelKind = "context" | "files" | "diff" | "terminal" | "browser";

export interface ConversationPanelDescriptor {
  readonly id: string;
  readonly kind: ConversationPanelKind;
  readonly label: string;
  readonly disabledReason: string | null;
}

export interface ConversationHeaderActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly tone: "default" | "destructive";
}

export interface ConversationTarget {
  readonly conversationId: string;
  readonly scopeId: string | null;
  readonly routeAlias: {
    readonly namespace: string;
    readonly id: string;
  } | null;
  readonly availability: "resolvable" | "pending" | "unavailable";
  readonly unavailableReason: string | null;
}

export interface ConversationSurfaceContributions {
  readonly context: ReadonlyArray<ConversationContextContribution>;
  readonly headerActions: ReadonlyArray<ConversationHeaderActionDescriptor>;
  readonly panels: ReadonlyArray<ConversationPanelDescriptor>;
}

export interface ConversationScreenModel {
  readonly screen: ConversationScreenState;
  readonly timeline: ConversationTimelineState;
  readonly composer: ConversationComposerState;
  readonly capabilities: ConversationSurfaceCapabilities;
  readonly contributions: ConversationSurfaceContributions;
}

export interface ConversationScreenCommands {
  readonly send: () => void;
  readonly interrupt: () => void;
  readonly steer: (prompt: string) => void;
  readonly openTurnDiff: (turnId: TurnId, filePath?: string) => void;
  readonly revertUserMessage: (messageId: MessageId) => void;
  readonly openConversationTarget: (target: ConversationTarget) => void;
  readonly runHeaderAction: (actionId: string) => void;
}

const EMPTY_TIMELINE_CAPABILITIES: ConversationTimelineCapabilities = {
  diffs: false,
  checkpoints: false,
  imageExpansion: false,
  reasoningSummaries: false,
  childNavigation: false,
};

const EMPTY_PANEL_CAPABILITIES: ConversationPanelCapabilities = {
  context: false,
  files: false,
  diff: false,
  terminal: false,
  browser: false,
};

export function deriveConversationExecutionCapabilities(input: {
  readonly available: boolean;
  readonly supportedControls: ReadonlyArray<ConversationExecutionControl>;
  readonly supportsSteer: boolean;
  readonly supportsQueue: boolean;
}): ConversationExecutionCapabilities {
  const controls = new Set(input.supportedControls);
  return {
    send: input.available && controls.has("turn"),
    queue: input.available && input.supportsQueue,
    steer: input.available && input.supportsSteer,
    interrupt: input.available && controls.has("interrupt"),
    approvals: input.available && controls.has("approval"),
    userInput: input.available && controls.has("input"),
  };
}

export function buildConversationSurfaceCapabilities(input: {
  readonly composer: ComposerCapabilities;
  readonly execution: ConversationExecutionCapabilities;
  readonly timeline?: Partial<ConversationTimelineCapabilities>;
  readonly panels?: Partial<ConversationPanelCapabilities>;
}): ConversationSurfaceCapabilities {
  return {
    composer: input.composer,
    execution: input.execution,
    timeline: { ...EMPTY_TIMELINE_CAPABILITIES, ...input.timeline },
    panels: { ...EMPTY_PANEL_CAPABILITIES, ...input.panels },
  };
}
