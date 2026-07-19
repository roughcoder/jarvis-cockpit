export const PROJECT_CONVERSATION_TITLE_MAX_LENGTH = 200;

export interface ProjectConversationRenameResolution {
  readonly title: string;
}

export interface ThreadTitleContextMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
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

export function isActiveProjectConversationStatus(status: string | null | undefined): boolean {
  return (
    status === "created" ||
    status === "running" ||
    status === "starting" ||
    status === "working" ||
    status === "joining" ||
    status === "waiting_for_children"
  );
}

export function normalizeProjectConversationTitleInput(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, PROJECT_CONVERSATION_TITLE_MAX_LENGTH);
}

export function buildProjectConversationTitleGenerationContext(input: {
  readonly currentTitle: string;
  readonly messages: ReadonlyArray<ThreadTitleContextMessage>;
}): string {
  const transcript = input.messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-12)
    .map((message) => `${message.role}: ${message.content.trim()}`)
    .join("\n\n")
    .slice(-8_000);
  return [
    `Current title: ${normalizeProjectConversationTitleInput(input.currentTitle)}`,
    transcript.length > 0 ? `Conversation:\n${transcript}` : "Conversation: no messages yet",
  ].join("\n\n");
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
  readonly status: string | null | undefined;
  readonly endedReason: string | null | undefined;
}): ProjectConversationHeaderStatus | null {
  const status = input.status ?? null;
  if (status === null) {
    return null;
  }
  const endedNote = input.endedReason ? `ended: ${formatEndedReason(input.endedReason)}` : null;
  if (status === "running") {
    return { label: "Running", variant: "warning", endedNote: null };
  }
  if (status === "working") {
    return { label: "Working", variant: "warning", endedNote: null };
  }
  if (status === "starting") {
    return { label: "Starting", variant: "warning", endedNote: null };
  }
  if (status === "joining") {
    return { label: "Joining results", variant: "warning", endedNote: null };
  }
  if (status === "waiting_for_children") {
    return { label: "Waiting for children", variant: "warning", endedNote: null };
  }
  if (status === "waiting_for_input") {
    return { label: "Needs input", variant: "warning", endedNote: null };
  }
  if (status === "waiting_for_approval") {
    return { label: "Needs approval", variant: "warning", endedNote: null };
  }
  if (status === "waiting_for_event") {
    return { label: "Waiting", variant: "outline", endedNote: null };
  }
  if (status === "idle") {
    return { label: "Idle", variant: "outline", endedNote: null };
  }
  if (status === "paused") {
    return { label: "Paused", variant: "outline", endedNote: null };
  }
  if (status === "archived") {
    return { label: "Archived", variant: "outline", endedNote: null };
  }
  if (status === "blocked" || status === "degraded") {
    return {
      label: status === "blocked" ? "Blocked" : "Needs attention",
      variant: "error",
      endedNote: null,
    };
  }
  if (status === "completed") {
    return { label: "Idle", variant: "outline", endedNote: null };
  }
  if (status === "failed") {
    return { label: "Needs attention", variant: "error", endedNote };
  }
  if (status === "created") {
    return { label: "Created", variant: "outline", endedNote };
  }
  // Unknown (future) status → no header badge rather than a misleading "Created".
  return null;
}

function formatEndedReason(reason: string): string {
  return reason.replaceAll("_", " ");
}
