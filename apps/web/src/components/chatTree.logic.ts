export interface ChatTreeConversation {
  readonly thread_id: string;
  readonly parent_chat_id?: string | null | undefined;
}

export interface ChatTreeNode<TConversation extends ChatTreeConversation> {
  readonly conversation: TConversation;
  readonly children: ChatTreeNode<TConversation>[];
}

interface MutableChatTreeNode<TConversation extends ChatTreeConversation> {
  readonly conversation: TConversation;
  readonly children: MutableChatTreeNode<TConversation>[];
}

export function buildChatTree<TConversation extends ChatTreeConversation>(
  conversations: ReadonlyArray<TConversation>,
): ChatTreeNode<TConversation>[] {
  const nodes = conversations.map<MutableChatTreeNode<TConversation>>((conversation) => ({
    conversation,
    children: [],
  }));
  const nodeById = new Map<string, MutableChatTreeNode<TConversation>>();
  const parentById = new Map<string, string | null>();

  for (const node of nodes) {
    const threadId = normalizeChatTreeId(node.conversation.thread_id);
    if (threadId === null || nodeById.has(threadId)) {
      continue;
    }
    nodeById.set(threadId, node);
    parentById.set(threadId, normalizeChatTreeId(node.conversation.parent_chat_id));
  }

  const roots: MutableChatTreeNode<TConversation>[] = [];

  for (const node of nodes) {
    const threadId = normalizeChatTreeId(node.conversation.thread_id);
    if (threadId === null || nodeById.get(threadId) !== node) {
      roots.push(node);
      continue;
    }

    const parentId = parentById.get(threadId) ?? null;
    if (parentId === null) {
      roots.push(node);
      continue;
    }

    const parentNode = nodeById.get(parentId);
    if (
      parentNode === undefined ||
      createsChatTreeCycle({ childId: threadId, parentId, parentById })
    ) {
      roots.push(node);
      continue;
    }

    parentNode.children.push(node);
  }

  return roots;
}

function normalizeChatTreeId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 ? null : normalized;
}

function createsChatTreeCycle({
  childId,
  parentId,
  parentById,
}: {
  readonly childId: string;
  readonly parentId: string;
  readonly parentById: ReadonlyMap<string, string | null>;
}): boolean {
  const visited = new Set<string>();
  let currentId: string | null = parentId;

  while (currentId !== null) {
    if (currentId === childId || visited.has(currentId)) {
      return true;
    }
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}
