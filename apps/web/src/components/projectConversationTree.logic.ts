import type { JarvisProjectThread, JarvisWorkerSession } from "@t3tools/contracts";

import type { ChatTreeNode } from "./chatTree.logic";

const JARVIS_THREAD_ID_PREFIX = "jarvis-session_";

export type ProjectConversationTreeItem =
  | {
      readonly kind: "project-thread";
      readonly thread_id: string;
      readonly parent_chat_id?: string | null | undefined;
      readonly title: string;
      readonly engine?: string | null | undefined;
      readonly model?: string | null | undefined;
      readonly status?: string | null | undefined;
      readonly operational_state?: string | null | undefined;
      readonly archived_at?: string | null | undefined;
      readonly thread: JarvisProjectThread;
    }
  | {
      readonly kind: "worker-session";
      readonly thread_id: string;
      readonly parent_chat_id: string | null;
      readonly title: string;
      readonly engine: string;
      readonly model?: string | null | undefined;
      readonly status: string;
      readonly archived_at?: string | null | undefined;
      readonly session: JarvisWorkerSession;
    };

export type ProjectConversationArchiveTarget =
  | {
      readonly kind: "project-thread";
      readonly threadId: string;
    }
  | {
      readonly kind: "worker-session";
      readonly sessionRef: string;
    };

function metadataString(metadata: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sessionField(
  session: JarvisWorkerSession,
  key: "project_id" | "parent_chat_id" | "model",
): string | null {
  const direct = session[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  return metadataString(session.metadata ?? {}, key);
}

export function workerSessionThreadId(sessionRef: string): string {
  return `${JARVIS_THREAD_ID_PREFIX}${sessionRef}`;
}

export function projectConversationArchiveTarget(
  conversation: ProjectConversationTreeItem,
): ProjectConversationArchiveTarget {
  return conversation.kind === "project-thread"
    ? { kind: "project-thread", threadId: conversation.thread_id }
    : { kind: "worker-session", sessionRef: conversation.session.session_ref };
}

/** Descendants in display order, excluding the supplied node. */
export function projectConversationTreeDescendants(
  node: ChatTreeNode<ProjectConversationTreeItem>,
): ProjectConversationTreeItem[] {
  const descendants: ProjectConversationTreeItem[] = [];
  for (const child of node.children) {
    descendants.push(child.conversation, ...projectConversationTreeDescendants(child));
  }
  return descendants;
}

/**
 * Archive targets ordered child-before-parent so callers can archive a nested
 * family before archiving (and therefore promoting) any of its ancestors.
 */
export function projectConversationDescendantArchiveTargets(
  node: ChatTreeNode<ProjectConversationTreeItem>,
): ProjectConversationArchiveTarget[] {
  const targets: ProjectConversationArchiveTarget[] = [];
  for (const child of node.children) {
    targets.push(
      ...projectConversationDescendantArchiveTargets(child),
      projectConversationArchiveTarget(child.conversation),
    );
  }
  return targets;
}

/**
 * Joins durable project conversations with live child worker sessions. Every
 * project-linked session is added: parent-linked sessions nest under their
 * conversation, and root sessions (start-work dispatched directly against the
 * project, no parent chat) render as top-level rows so linked work always has
 * a home beneath its registry project.
 */
export function projectConversationTreeItems(input: {
  readonly projectId: string;
  readonly projectThreads: ReadonlyArray<JarvisProjectThread>;
  readonly workerSessions: ReadonlyArray<JarvisWorkerSession>;
  readonly includeArchived: boolean;
}): ProjectConversationTreeItem[] {
  const representedSessionIds = new Set(input.projectThreads.map((thread) => thread.session_id));
  const representedThreadIds = new Set<string>(
    input.projectThreads.map((thread) => thread.thread_id),
  );
  const threads = input.projectThreads.map<ProjectConversationTreeItem>((thread) => ({
    kind: "project-thread",
    thread_id: thread.thread_id,
    parent_chat_id: thread.parent_chat_id,
    title: thread.title,
    engine: thread.engine,
    model: thread.model,
    status: thread.status,
    operational_state: thread.operational_state,
    archived_at: thread.archived_at,
    thread,
  }));

  for (const session of input.workerSessions) {
    const projectId = sessionField(session, "project_id");
    const parentChatId = sessionField(session, "parent_chat_id");
    const threadId = workerSessionThreadId(session.session_ref);
    if (
      projectId !== input.projectId ||
      representedSessionIds.has(session.session_id) ||
      representedThreadIds.has(threadId) ||
      (!input.includeArchived && session.archived_at != null)
    ) {
      continue;
    }
    threads.push({
      kind: "worker-session",
      thread_id: threadId,
      parent_chat_id: parentChatId,
      title: session.title,
      engine: session.engine,
      model: sessionField(session, "model"),
      status: session.status,
      archived_at: session.archived_at,
      session,
    });
  }

  return threads;
}
