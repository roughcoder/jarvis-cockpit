export const PROJECT_CONTEXT_PANEL_COLLAPSED_STORAGE_KEY =
  "t3code:project-conversation-context-panel-collapsed:v1";

export interface ProjectConversationRenameResolution {
  readonly title: string;
  readonly isLocalOnly: boolean;
}

export interface CommitProjectConversationRenameInput {
  readonly threadId: string;
  readonly serverTitle: string;
  readonly draftTitle: string;
  readonly localTitleByThreadId: Readonly<Record<string, string>>;
}

export interface CommitProjectConversationRenameResult {
  readonly title: string;
  readonly status: "empty" | "unchanged" | "local-only";
  readonly localTitleByThreadId: Readonly<Record<string, string>>;
}

export function resolveProjectConversationTitle(input: {
  readonly threadId: string;
  readonly serverTitle: string;
  readonly localTitleByThreadId: Readonly<Record<string, string>>;
}): ProjectConversationRenameResolution {
  const localTitle = input.localTitleByThreadId[input.threadId]?.trim();
  if (!localTitle || localTitle === input.serverTitle) {
    return {
      title: input.serverTitle,
      isLocalOnly: false,
    };
  }
  return {
    title: localTitle,
    isLocalOnly: true,
  };
}

export function commitProjectConversationLocalRename(
  input: CommitProjectConversationRenameInput,
): CommitProjectConversationRenameResult {
  const draftTitle = input.draftTitle.trim();
  const currentTitle = resolveProjectConversationTitle(input).title;
  if (draftTitle.length === 0) {
    return {
      title: currentTitle,
      status: "empty",
      localTitleByThreadId: input.localTitleByThreadId,
    };
  }
  if (draftTitle === currentTitle) {
    return {
      title: currentTitle,
      status: "unchanged",
      localTitleByThreadId: input.localTitleByThreadId,
    };
  }
  return {
    title: draftTitle,
    status: "local-only",
    localTitleByThreadId: {
      ...input.localTitleByThreadId,
      [input.threadId]: draftTitle,
    },
  };
}

export function resolveProjectContextPanelToggleState(collapsed: boolean): {
  readonly ariaLabel: string;
  readonly tooltip: string;
  readonly nextCollapsed: boolean;
} {
  return collapsed
    ? {
        ariaLabel: "Show project context panel",
        tooltip: "Show context",
        nextCollapsed: false,
      }
    : {
        ariaLabel: "Hide project context panel",
        tooltip: "Hide context",
        nextCollapsed: true,
      };
}
