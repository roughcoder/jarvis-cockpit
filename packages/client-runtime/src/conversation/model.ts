export type ConversationLifecycle = "open" | "archived" | "deleting" | "deleted";

export type ConversationOperationalState =
  | "idle"
  | "starting"
  | "working"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "waiting_for_children"
  | "joining"
  | "waiting_for_event"
  | "blocked"
  | "degraded"
  | "paused"
  | "archived";

export type ConversationMessageRole = "user" | "assistant" | "system" | "unknown";

export interface ConversationMessagePresentation {
  readonly summary: string;
  readonly disclosure: {
    readonly label: string;
    readonly text: string;
  } | null;
}

export interface ConversationMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: ConversationMessageRole;
  readonly content: string;
  readonly authorId: string | null;
  readonly turnId?: string | null;
  readonly observedAt: string;
  readonly presentation?: ConversationMessagePresentation;
}

export type ConversationActivityStatus =
  | "requested"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

/** Optional structured data that lets shared presentation retain provider tool fidelity. */
export interface ConversationActivityPresentation {
  readonly command?: string;
  readonly rawCommand?: string;
  readonly changedFiles?: ReadonlyArray<string>;
  readonly toolTitle?: string;
  readonly toolData?: unknown;
  /** Kept open-ended so future provider item types do not invalidate conversation history. */
  readonly itemType?: string;
}

export interface ConversationActivity {
  readonly id: string;
  readonly conversationId: string;
  readonly kind: string;
  readonly status: ConversationActivityStatus;
  readonly title: string;
  readonly summary: string | null;
  readonly toolName: string | null;
  readonly correlationId: string;
  readonly turnId?: string | null;
  readonly relatedConversationIds: ReadonlyArray<string>;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
  readonly presentation?: ConversationActivityPresentation;
}

export type ConversationTimelineItem =
  | { readonly kind: "message"; readonly id: string; readonly observedAt: string }
  | { readonly kind: "activity"; readonly id: string; readonly observedAt: string };

export interface ConversationWorktree {
  readonly name: string | null;
  readonly repository: string | null;
  readonly pathLabel: string | null;
  readonly branch: string | null;
  readonly baseRef: string | null;
  readonly status?: string | null;
  readonly provisionPhase?: string | null;
}

export interface ConversationWorkspace {
  readonly workspaceId: string | null;
  readonly rootLabel: string | null;
  readonly cwdLabel: string | null;
  readonly status?: string | null;
  readonly provisionPhase?: string | null;
  readonly worktrees: ReadonlyArray<ConversationWorktree>;
}

export interface ConversationProjectContext {
  readonly id: string;
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly owner: string | null;
  readonly members: ReadonlyArray<string>;
  readonly visibility: string | null;
  readonly status: string | null;
  readonly repositories: ReadonlyArray<{
    readonly name: string;
    readonly remote: string;
    readonly isDefault: boolean;
  }>;
  readonly links: {
    readonly issueTracker: string | null;
    readonly urls: ReadonlyArray<string>;
  };
}

export interface ConversationMemoryContext {
  readonly representation: string;
  readonly conclusions: ReadonlyArray<{
    readonly id: string;
    readonly content: string;
    readonly artifactType: string;
    readonly recordedBy: string | null;
    readonly observedAt: string | null;
  }>;
}

export interface ConversationArtifactContext {
  readonly id: string;
  readonly title: string | null;
  readonly contentHash: string | null;
  readonly artifactType: string | null;
  readonly uploadedBy: string | null;
  readonly observedAt: string | null;
  readonly retracted: boolean;
}

export interface ConversationContext {
  readonly workspace: ConversationWorkspace | null;
  readonly project?: ConversationProjectContext | null;
  readonly memory?: ConversationMemoryContext | null;
  readonly artifacts?: ReadonlyArray<ConversationArtifactContext>;
  readonly archivedAt: string | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

export type ConversationContextContributionKind =
  | "goal"
  | "orchestration"
  | "workspace"
  | "resources"
  | "authority"
  | "project"
  | "memory"
  | "evidence";

export type ConversationContextItemStatus =
  | "neutral"
  | "waiting"
  | "running"
  | "completed"
  | "failed";

export interface ConversationContextItem {
  readonly id: string;
  readonly label: string;
  readonly value?: string;
  readonly detail?: string;
  readonly status?: ConversationContextItemStatus;
}

/** Provider-neutral contribution rendered by the standard conversation context panel. */
export interface ConversationContextContribution {
  readonly id: string;
  readonly kind: ConversationContextContributionKind;
  readonly title: string;
  readonly summary?: string;
  readonly items: ReadonlyArray<ConversationContextItem>;
  readonly emptyMessage?: string;
  readonly loading?: boolean;
  readonly progress?: {
    readonly completed: number;
    readonly total: number;
    readonly failed: number;
  };
}

export interface ConversationOwnership {
  readonly scopeId: string | null;
  readonly parentConversationId: string | null;
}

export interface ConversationRoutingAlias {
  readonly namespace: string;
  readonly id: string;
}

export interface ConversationRouting {
  readonly aliases: ReadonlyArray<ConversationRoutingAlias>;
}

export interface ConversationExecutionDiagnostics {
  readonly provider: string | null;
  readonly workerId: string | null;
  readonly sessionId: string | null;
  readonly status: string | null;
  readonly provisionPhase: string | null;
  readonly worktrees: ReadonlyArray<{
    readonly repository: string | null;
    readonly status: string | null;
    readonly provisionPhase: string | null;
  }>;
}

export interface ConversationDiagnostics {
  readonly reason: string | null;
  readonly execution: ConversationExecutionDiagnostics | null;
}

export type ConversationExecutionControl = "turn" | "input" | "approval" | "interrupt" | "stop";

export interface ConversationActiveTurn {
  readonly id: string;
  readonly status: string;
  readonly startedAt: string | null;
}

export interface ConversationPendingRequest {
  readonly id: string;
  readonly kind: "approval" | "input";
  readonly status: string;
  readonly title: string;
  readonly detail: string | null;
  readonly createdAt: string | null;
  readonly requestKind: "command" | "file-read" | "file-change" | null;
  readonly questions: ReadonlyArray<{
    readonly id: string;
    readonly header: string | null;
    readonly question: string;
    readonly multiSelect: boolean;
    readonly options: ReadonlyArray<{
      readonly label: string;
      readonly description: string | null;
    }>;
  }>;
}

export interface ConversationRuntime {
  readonly available: boolean;
  readonly status: string;
  readonly activeTurn: ConversationActiveTurn | null;
  readonly pendingRequests: ReadonlyArray<ConversationPendingRequest>;
  readonly supportedControls: ReadonlyArray<ConversationExecutionControl>;
  readonly supportsSteer: boolean;
  readonly supportsQueue: boolean;
  readonly diagnostic: {
    readonly code: string;
    readonly message: string | null;
  } | null;
}

/** Provider-neutral, replay-safe conversation projection consumed by client presentation code. */
export interface AgentConversation {
  readonly id: string;
  readonly title: string;
  readonly lifecycle: ConversationLifecycle;
  readonly operationalState: ConversationOperationalState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastTurnAt: string | null;
  readonly messages: ReadonlyArray<ConversationMessage>;
  readonly activities: ReadonlyArray<ConversationActivity>;
  readonly timeline: ReadonlyArray<ConversationTimelineItem>;
  readonly routing: ConversationRouting;
  readonly ownership: ConversationOwnership;
  readonly diagnostics: ConversationDiagnostics;
  readonly runtime: ConversationRuntime;
  readonly context: ConversationContext;
}
