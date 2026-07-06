export type NoActiveThreadActionKind =
  | "open-project-conversation"
  | "start-project-work"
  | "create-first-project"
  | "reconnect-brain";

export interface NoActiveThreadActionDescriptor {
  readonly kind: NoActiveThreadActionKind;
  readonly label: string;
  readonly variant: "default" | "outline";
}

export interface NoActiveThreadProjectConversationTarget {
  readonly environmentId: string;
  readonly threadId: string;
}

export interface NoActiveThreadStateDescriptor {
  readonly headerLabel: string;
  readonly title: string;
  readonly description: string;
  readonly actions: ReadonlyArray<NoActiveThreadActionDescriptor>;
  readonly statusLabel: string | null;
  readonly fixtureBanner: string | null;
}

export interface ResolveNoActiveThreadStateInput {
  readonly isJarvisCockpitMode: boolean;
  readonly registryFailed: boolean;
  readonly registryPending: boolean;
  readonly fixtureMode: boolean;
  readonly visibleProjectCount: number;
  readonly latestProjectConversation: NoActiveThreadProjectConversationTarget | null;
}

export function resolveNoActiveThreadState(
  input: ResolveNoActiveThreadStateInput,
): NoActiveThreadStateDescriptor {
  if (!input.isJarvisCockpitMode) {
    return {
      headerLabel: "No active thread",
      title: "Pick a thread to continue",
      description: "Select an existing thread or create a new one to get started.",
      actions: [],
      statusLabel: null,
      fixtureBanner: null,
    };
  }

  const fixtureBanner = input.fixtureMode
    ? "Fixture mode: no live workers. Start work simulates dispatch."
    : null;

  if (input.registryFailed && !input.fixtureMode) {
    return {
      headerLabel: "No active project",
      title: "Reconnect Jarvis Brain",
      description:
        "Cockpit cannot create projects or start project conversations until the Jarvis project registry is reachable.",
      actions: [{ kind: "reconnect-brain", label: "Reconnect brain", variant: "default" }],
      statusLabel: null,
      fixtureBanner: null,
    };
  }

  if (input.registryPending) {
    return {
      headerLabel: "No active project",
      title: "Checking Jarvis Brain",
      description: "Checking whether the Jarvis brain already has projects.",
      actions: [],
      statusLabel: "Checking project registry",
      fixtureBanner,
    };
  }

  if (input.visibleProjectCount === 0) {
    return {
      headerLabel: "No active project",
      title: "Create your first Jarvis project",
      description:
        "Jarvis cockpit needs a project before project conversations or live work can start.",
      actions: [
        {
          kind: "create-first-project",
          label: "Create first project",
          variant: "default",
        },
      ],
      statusLabel: null,
      fixtureBanner,
    };
  }

  if (input.latestProjectConversation !== null) {
    return {
      headerLabel: "No active project",
      title: "Open a project conversation",
      description:
        "Continue the latest Jarvis project conversation or choose another project from the sidebar.",
      actions: [
        {
          kind: "open-project-conversation",
          label: "Open project conversation",
          variant: "default",
        },
        {
          kind: "start-project-work",
          label: input.fixtureMode ? "Simulate work" : "Start project work",
          variant: "outline",
        },
      ],
      statusLabel: null,
      fixtureBanner,
    };
  }

  return {
    headerLabel: "No active project",
    title: input.fixtureMode ? "Simulate project work" : "Start project work",
    description: input.fixtureMode
      ? "Choose a Jarvis project and simulate work against fixture data. No live workers will run."
      : "Choose a Jarvis project and describe the work Jarvis should start.",
    actions: [
      {
        kind: "start-project-work",
        label: input.fixtureMode ? "Simulate work" : "Start project work",
        variant: "default",
      },
    ],
    statusLabel: null,
    fixtureBanner,
  };
}

export interface NoActiveThreadProjectRefLike {
  readonly environmentId: string;
  readonly id: string;
}

export interface NoActiveThreadConversationLike {
  readonly environmentId: string;
  readonly id: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestUserMessageAt?: string | null;
  readonly archivedAt?: string | null;
}

export function findLatestProjectConversation(input: {
  readonly projects: ReadonlyArray<NoActiveThreadProjectRefLike>;
  readonly conversations: ReadonlyArray<NoActiveThreadConversationLike>;
}): NoActiveThreadProjectConversationTarget | null {
  if (input.projects.length === 0 || input.conversations.length === 0) {
    return null;
  }

  const projectKeys = new Set(
    input.projects.map((project) => projectConversationKey(project.environmentId, project.id)),
  );
  let latest: NoActiveThreadConversationLike | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const conversation of input.conversations) {
    if (conversation.archivedAt !== null && conversation.archivedAt !== undefined) {
      continue;
    }
    if (
      !projectKeys.has(projectConversationKey(conversation.environmentId, conversation.projectId))
    ) {
      continue;
    }
    const timestamp = conversationTimestamp(conversation);
    if (timestamp > latestTimestamp) {
      latest = conversation;
      latestTimestamp = timestamp;
    }
  }

  return latest === null
    ? null
    : {
        environmentId: latest.environmentId,
        threadId: latest.id,
      };
}

function projectConversationKey(environmentId: string, projectId: string): string {
  return `${environmentId}\u0000${projectId}`;
}

function conversationTimestamp(conversation: NoActiveThreadConversationLike): number {
  const timestamp = Date.parse(
    conversation.latestUserMessageAt ?? conversation.updatedAt ?? conversation.createdAt,
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}
