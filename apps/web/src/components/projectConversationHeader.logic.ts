import type { JarvisEndedReason, JarvisProjectThreadStatus } from "@t3tools/contracts";

export const PROJECT_CONTEXT_PANEL_COLLAPSED_STORAGE_KEY =
  "t3code:project-conversation-context-panel-collapsed:v1";

export const PROJECT_CONVERSATION_TITLE_MAX_LENGTH = 200;

export interface ProjectConversationRenameResolution {
  readonly title: string;
}

export interface BuildProjectConversationRenameInput {
  readonly currentTitle: string;
  readonly draftTitle: string;
  readonly idempotencyKey: string;
}

export type BuildProjectConversationRenameResult =
  | {
      readonly status: "empty";
      readonly title: string;
    }
  | {
      readonly status: "unchanged";
      readonly title: string;
    }
  | {
      readonly status: "ready";
      readonly title: string;
      readonly input: {
        readonly title: string;
        readonly idempotency_key: string;
      };
    };

export interface ProjectConversationHeaderStatus {
  readonly label: string;
  readonly variant: "outline" | "success" | "error" | "warning";
  readonly endedNote: string | null;
}

export function normalizeProjectConversationTitleInput(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, PROJECT_CONVERSATION_TITLE_MAX_LENGTH);
}

export function buildProjectConversationRenameInput(
  input: BuildProjectConversationRenameInput,
): BuildProjectConversationRenameResult {
  const title = normalizeProjectConversationTitleInput(input.draftTitle);
  const currentTitle = normalizeProjectConversationTitleInput(input.currentTitle);
  if (title.length === 0) {
    return {
      status: "empty",
      title: currentTitle,
    };
  }
  if (title === currentTitle) {
    return {
      status: "unchanged",
      title,
    };
  }
  return {
    status: "ready",
    title,
    input: {
      title,
      idempotency_key: input.idempotencyKey,
    },
  };
}

export function resolveProjectConversationTitle(input: {
  readonly serverTitle: string;
}): ProjectConversationRenameResolution {
  return {
    title: input.serverTitle,
  };
}

export function resolveProjectConversationHeaderStatus(input: {
  readonly status: JarvisProjectThreadStatus | null | undefined;
  readonly endedReason: JarvisEndedReason | null | undefined;
}): ProjectConversationHeaderStatus | null {
  const status = input.status ?? null;
  if (status === null) {
    return null;
  }
  const endedNote = input.endedReason ? `ended: ${formatEndedReason(input.endedReason)}` : null;
  if (status === "running") {
    return { label: "Running", variant: "warning", endedNote: null };
  }
  if (status === "completed") {
    return { label: "Completed", variant: "success", endedNote };
  }
  if (status === "failed") {
    return { label: "Failed", variant: "error", endedNote };
  }
  return {
    label: "Created",
    variant: "outline",
    endedNote,
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

function formatEndedReason(reason: JarvisEndedReason): string {
  return reason.replaceAll("_", " ");
}
