import { describe, expect, it } from "vite-plus/test";

import { buildChatTree, type ChatTreeConversation, type ChatTreeNode } from "./chatTree.logic";

function conversation(threadId: string, parentChatId?: string | null): ChatTreeConversation {
  return {
    thread_id: threadId,
    parent_chat_id: parentChatId,
  };
}

function serializeTree(
  nodes: ReadonlyArray<ChatTreeNode<ChatTreeConversation>>,
): ReadonlyArray<{ readonly id: string; readonly children: ReadonlyArray<unknown> }> {
  return nodes.map((node) => ({
    id: node.conversation.thread_id,
    children: serializeTree(node.children),
  }));
}

describe("buildChatTree", () => {
  it("nests project conversations under their parent with stable sibling order", () => {
    const tree = buildChatTree([
      conversation("root"),
      conversation("child-b", "root"),
      conversation("child-a", "root"),
      conversation("grandchild", "child-b"),
    ]);

    expect(serializeTree(tree)).toEqual([
      {
        id: "root",
        children: [
          { id: "child-b", children: [{ id: "grandchild", children: [] }] },
          { id: "child-a", children: [] },
        ],
      },
    ]);
  });

  it("treats conversations with missing parents as roots", () => {
    const tree = buildChatTree([
      conversation("orphan", "missing"),
      conversation("root", ""),
      conversation("null-root", null),
      conversation("undefined-root"),
    ]);

    expect(serializeTree(tree)).toEqual([
      { id: "orphan", children: [] },
      { id: "root", children: [] },
      { id: "null-root", children: [] },
      { id: "undefined-root", children: [] },
    ]);
  });

  it("supports arbitrary-depth nesting", () => {
    const tree = buildChatTree([
      conversation("root"),
      conversation("level-1", "root"),
      conversation("level-2", "level-1"),
      conversation("level-3", "level-2"),
      conversation("level-4", "level-3"),
    ]);

    expect(serializeTree(tree)).toEqual([
      {
        id: "root",
        children: [
          {
            id: "level-1",
            children: [
              {
                id: "level-2",
                children: [
                  {
                    id: "level-3",
                    children: [{ id: "level-4", children: [] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("guards cycles by promoting cycle members to roots", () => {
    const tree = buildChatTree([
      conversation("a", "c"),
      conversation("b", "a"),
      conversation("c", "b"),
      conversation("self", "self"),
      conversation("safe-root"),
      conversation("safe-child", "safe-root"),
    ]);

    expect(serializeTree(tree)).toEqual([
      { id: "a", children: [] },
      { id: "b", children: [] },
      { id: "c", children: [] },
      { id: "self", children: [] },
      { id: "safe-root", children: [{ id: "safe-child", children: [] }] },
    ]);
  });
});
