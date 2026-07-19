import type {
  AgentConversation,
  ConversationActivity,
  ConversationContextContribution,
  ConversationContextItemStatus,
} from "@t3tools/client-runtime/conversation";

export const LEGACY_PROJECT_CONVERSATION_CONTEXT_PANEL_COLLAPSED_KEY =
  "t3code:project-conversation-context-panel-collapsed:v1";

export type ProjectConversationContextPanelInitialization = "preserve" | "open" | "closed";

export function projectConversationContextPanelInitialization(input: {
  readonly hasPersistedState: boolean;
  readonly legacyCollapsedRaw: string | null;
}): ProjectConversationContextPanelInitialization {
  if (input.hasPersistedState) return "preserve";
  if (input.legacyCollapsedRaw === null) return "open";
  try {
    return JSON.parse(input.legacyCollapsedRaw) === true ? "closed" : "open";
  } catch {
    return "open";
  }
}

export function projectConversationContextContributions(input: {
  readonly conversation: AgentConversation | null;
  readonly memoryLoading: boolean;
}): ConversationContextContribution[] {
  return [
    ...orchestrationContribution(input.conversation),
    projectContribution(input.conversation),
    ...workspaceContribution(input.conversation),
    memoryContribution(input.conversation, input.memoryLoading),
    evidenceContribution(input.conversation),
  ];
}

function orchestrationContribution(
  conversation: AgentConversation | null,
): ConversationContextContribution[] {
  const activities = conversation?.activities ?? [];
  const watch = activities.toReversed().find((activity) => activity.kind.startsWith("children."));
  const relatedIds = new Set(watch?.relatedConversationIds ?? []);
  const children = activities.filter(
    (activity) =>
      activity.kind.startsWith("child.") &&
      (relatedIds.size === 0 ||
        activity.relatedConversationIds.some((conversationId) => relatedIds.has(conversationId))),
  );
  if (!watch && children.length === 0) return [];
  const completed = children.filter((child) => child.status === "completed").length;
  const failed = children.filter(
    (child) => child.status === "failed" || child.status === "cancelled",
  ).length;
  const status = watch?.status ?? aggregateActivityStatus(children);
  const summary =
    status === "completed"
      ? "Complete"
      : status === "failed" || status === "cancelled"
        ? "Failed"
        : status === "running"
          ? "Joining results"
          : "Waiting for children";
  return [
    {
      id: "orchestration",
      kind: "orchestration",
      title: "Orchestration",
      summary,
      progress: { completed, total: children.length, failed },
      items: children.map((child, index) => ({
        id: `orchestration-child:${index}`,
        label: child.title,
        ...(child.summary ? { detail: child.summary } : {}),
        status: contextItemStatus(child.status),
      })),
      emptyMessage: "No child conversations.",
    },
  ];
}

function projectContribution(
  conversation: AgentConversation | null,
): ConversationContextContribution {
  const project = conversation?.context.project ?? null;
  const defaultRepo = project?.repositories.find((repository) => repository.isDefault) ?? null;
  return {
    id: "project",
    kind: "project",
    title: "Project",
    summary: project?.name ?? "Project",
    items: defaultRepo
      ? [{ id: `repo:${defaultRepo.name}`, label: "Default repository", value: defaultRepo.remote }]
      : [],
    emptyMessage: "No default repository.",
  };
}

function workspaceContribution(
  conversation: AgentConversation | null,
): ConversationContextContribution[] {
  const workspace = conversation?.context.workspace ?? null;
  if (!workspace) return [];
  const items: ConversationContextContribution["items"] = workspace.worktrees.map(
    (worktree, index) => {
      const detail = [
        worktree.repository ? `repo: ${worktree.repository}` : null,
        worktree.baseRef ? `base: ${worktree.baseRef}` : null,
        worktree.provisionPhase ? `phase: ${worktree.provisionPhase}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join(" · ");
      return {
        id: `worktree:${worktree.repository ?? worktree.name ?? index}`,
        label: worktree.name ?? worktree.repository ?? `Worktree ${index + 1}`,
        ...(worktree.branch ? { value: worktree.branch } : {}),
        ...(detail ? { detail } : {}),
        status: contextItemStatus(worktree.status ?? worktree.provisionPhase),
      };
    },
  );
  const summary =
    [workspace.rootLabel ?? workspace.cwdLabel, workspace.provisionPhase ?? workspace.status]
      .filter((value): value is string => Boolean(value))
      .join(" · ") || null;
  return [
    {
      id: "workspace",
      kind: "workspace",
      title: "Workspace",
      ...(summary ? { summary } : {}),
      items,
      emptyMessage: "No worktrees projected yet.",
    },
  ];
}

function memoryContribution(
  conversation: AgentConversation | null,
  loading: boolean,
): ConversationContextContribution {
  const memory = conversation?.context.memory ?? null;
  return {
    id: "memory",
    kind: "memory",
    title: "Memory",
    ...(memory?.representation ? { summary: memory.representation } : {}),
    loading,
    items: (memory?.conclusions ?? []).slice(0, 3).map((conclusion) => ({
      id: conclusion.id,
      label: conclusion.artifactType,
      detail: conclusion.content,
    })),
    emptyMessage: "No representation recorded.",
  };
}

function evidenceContribution(
  conversation: AgentConversation | null,
): ConversationContextContribution {
  const artifacts = conversation?.context.artifacts ?? [];
  return {
    id: "evidence",
    kind: "evidence",
    title: "Files",
    items: artifacts.slice(0, 8).map((artifact) => ({
      id: artifact.id,
      label: artifact.title || artifact.id,
      detail: `${artifact.artifactType || "file"} · ${artifact.id}`,
    })),
    emptyMessage: "No project files recorded.",
  };
}

function aggregateActivityStatus(
  activities: ReadonlyArray<ConversationActivity>,
): ConversationActivity["status"] {
  if (activities.some((activity) => activity.status === "failed")) return "failed";
  if (activities.some((activity) => activity.status === "cancelled")) return "cancelled";
  if (activities.some((activity) => activity.status === "running")) return "running";
  if (activities.some((activity) => activity.status === "waiting")) return "waiting";
  if (activities.length > 0 && activities.every((activity) => activity.status === "completed")) {
    return "completed";
  }
  return "requested";
}

function contextItemStatus(status: string | null | undefined): ConversationContextItemStatus {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (/fail|error|cancel/u.test(normalized)) return "failed";
  if (/complete|ready|attach|success/u.test(normalized)) return "completed";
  if (/run|provision|start|join/u.test(normalized)) return "running";
  if (/wait|pending|request|queue/u.test(normalized)) return "waiting";
  return "neutral";
}
