import type { JarvisProjectThread, JarvisWorkerSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectConversationArchiveTarget,
  projectConversationDescendantArchiveTargets,
  projectConversationPinKey,
  projectConversationPinKeyPrefix,
  projectConversationTreeItems,
  projectConversationTreeDescendants,
  pinnedProjectConversationTreeRoots,
  workerSessionThreadId,
} from "./projectConversationTree.logic";
import { buildChatTree } from "./chatTree.logic";

function projectThread(input: Record<string, unknown> = {}): JarvisProjectThread {
  return {
    thread_id: "review-42",
    project_id: "cockpit",
    parent_chat_id: "",
    session_id: "project:cockpit:review-42",
    title: "review: #42 cockpit",
    engine: "jarvis",
    model: "",
    created_at: "2026-07-11T10:00:00.000Z",
    updated_at: "2026-07-11T10:00:00.000Z",
    ...input,
  } as unknown as JarvisProjectThread;
}

function workerSession(input: Record<string, unknown> = {}): JarvisWorkerSession {
  return {
    session_ref: "sessref_worker_child-1",
    worker_id: "worker",
    session_id: "child-1",
    run_id: "run-1",
    project_id: "cockpit",
    parent_chat_id: "review-42",
    model: "gpt-5.5",
    title: "Codex review",
    provider: "codex",
    engine: "codex",
    authority: "jarvis",
    supported_controls: [],
    status: "running",
    provision_phase: "",
    repo: "roughcoder/jarvis-cockpit",
    branch: "feature",
    cwd_label: "cockpit",
    latest_event_cursor: "",
    pending_input_count: 0,
    pending_approval_count: 0,
    waiting_on: [],
    checkpoint_count: 0,
    created_at: "2026-07-11T10:01:00.000Z",
    updated_at: "2026-07-11T10:01:00.000Z",
    archived_at: null,
    metadata: {},
    ...input,
  } as unknown as JarvisWorkerSession;
}

describe("projectConversationTreeItems", () => {
  it("nests live worker children beneath their parent project conversation", () => {
    const items = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [projectThread()],
      workerSessions: [
        workerSession(),
        workerSession({
          session_ref: "sessref_worker_child-2",
          session_id: "child-2",
          title: "Claude review",
          engine: "claude",
          model: "claude-opus-4-7",
          status: "completed",
        }),
      ],
      includeArchived: false,
    });
    const tree = buildChatTree(items);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.conversation.kind).toBe("project-thread");
    expect(tree[0]?.children.map((child) => child.conversation)).toMatchObject([
      {
        kind: "worker-session",
        thread_id: workerSessionThreadId("sessref_worker_child-1"),
        status: "running",
        model: "gpt-5.5",
      },
      {
        kind: "worker-session",
        thread_id: workerSessionThreadId("sessref_worker_child-2"),
        status: "completed",
        model: "claude-opus-4-7",
      },
    ]);
  });

  it("accepts linkage metadata from tolerant older/newer runtime projections", () => {
    const items = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [projectThread()],
      workerSessions: [
        workerSession({
          project_id: null,
          parent_chat_id: "",
          model: "",
          metadata: {
            project_id: "cockpit",
            parent_chat_id: "review-42",
            model: "claude-opus-4-7",
          },
        }),
      ],
      includeArchived: false,
    });

    expect(items[1]).toMatchObject({
      kind: "worker-session",
      parent_chat_id: "review-42",
      model: "claude-opus-4-7",
    });
  });

  it("excludes other-project, archived, and already represented sessions", () => {
    const thread = projectThread();
    const items = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [thread],
      workerSessions: [
        workerSession({ project_id: "runtime" }),
        workerSession({ archived_at: "2026-07-11T11:00:00.000Z" }),
        workerSession({ session_id: thread.session_id }),
      ],
      includeArchived: false,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("project-thread");
  });

  it("keeps project-linked root sessions as top-level rows under the project", () => {
    const items = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [projectThread()],
      workerSessions: [
        workerSession({
          session_ref: "sessref_worker_root-1",
          session_id: "root-1",
          parent_chat_id: "",
          title: "Start-work run",
        }),
      ],
      includeArchived: false,
    });
    const tree = buildChatTree(items);

    expect(items[1]).toMatchObject({
      kind: "worker-session",
      thread_id: workerSessionThreadId("sessref_worker_root-1"),
      parent_chat_id: null,
    });
    expect(tree).toHaveLength(2);
    expect(tree[1]?.conversation.kind).toBe("worker-session");
    expect(tree[1]?.children).toHaveLength(0);
  });
});

describe("project conversation archive helpers", () => {
  it("maps durable threads and worker sessions to their native archive identifiers", () => {
    const thread = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [projectThread()],
      workerSessions: [workerSession()],
      includeArchived: false,
    });

    expect(projectConversationArchiveTarget(thread[0]!)).toEqual({
      kind: "project-thread",
      threadId: "review-42",
    });
    expect(projectConversationArchiveTarget(thread[1]!)).toEqual({
      kind: "worker-session",
      sessionRef: "sessref_worker_child-1",
    });
  });

  it("collects every nested descendant and returns archive targets deepest-first", () => {
    const parent = projectThread();
    const nestedThread = projectThread({
      thread_id: "follow-up",
      session_id: "project:cockpit:follow-up",
      parent_chat_id: parent.thread_id,
      title: "Follow-up",
    });
    const items = projectConversationTreeItems({
      projectId: "cockpit",
      projectThreads: [parent, nestedThread],
      workerSessions: [
        workerSession(),
        workerSession({
          session_ref: "sessref_worker_grandchild",
          session_id: "grandchild",
          parent_chat_id: nestedThread.thread_id,
        }),
      ],
      includeArchived: false,
    });
    const root = buildChatTree(items)[0]!;

    expect(projectConversationTreeDescendants(root).map((item) => item.thread_id)).toEqual([
      "follow-up",
      workerSessionThreadId("sessref_worker_grandchild"),
      workerSessionThreadId("sessref_worker_child-1"),
    ]);
    expect(projectConversationDescendantArchiveTargets(root)).toEqual([
      { kind: "worker-session", sessionRef: "sessref_worker_grandchild" },
      { kind: "project-thread", threadId: "follow-up" },
      { kind: "worker-session", sessionRef: "sessref_worker_child-1" },
    ]);
  });
});

describe("project conversation pin helpers", () => {
  it("builds scoped keys that distinguish environments and projects", () => {
    expect(projectConversationPinKey("local", "cockpit", "review/42")).toBe(
      `${projectConversationPinKeyPrefix("local", "cockpit")}review%2F42`,
    );
    expect(projectConversationPinKey("remote", "cockpit", "review/42")).not.toBe(
      projectConversationPinKey("local", "cockpit", "review/42"),
    );
  });

  it("keeps descendants nested when their parent is pinned", () => {
    const parent = projectThread();
    const nestedThread = projectThread({
      thread_id: "follow-up",
      session_id: "project:cockpit:follow-up",
      parent_chat_id: parent.thread_id,
      title: "Follow-up",
    });
    const tree = buildChatTree(
      projectConversationTreeItems({
        projectId: "cockpit",
        projectThreads: [parent, nestedThread],
        workerSessions: [
          workerSession({
            session_ref: "sessref_worker_grandchild",
            session_id: "grandchild",
            parent_chat_id: nestedThread.thread_id,
          }),
        ],
        includeArchived: false,
      }),
    );

    const pinned = pinnedProjectConversationTreeRoots(
      tree,
      new Set([parent.thread_id, nestedThread.thread_id]),
    );

    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.conversation.thread_id).toBe(parent.thread_id);
    expect(pinned[0]?.children[0]?.conversation.thread_id).toBe(nestedThread.thread_id);
    expect(pinned[0]?.children[0]?.children[0]?.conversation.thread_id).toBe(
      workerSessionThreadId("sessref_worker_grandchild"),
    );
  });

  it("promotes a pinned child to a pinned root when its parent is not pinned", () => {
    const parent = projectThread();
    const child = projectThread({
      thread_id: "follow-up",
      session_id: "project:cockpit:follow-up",
      parent_chat_id: parent.thread_id,
    });
    const tree = buildChatTree(
      projectConversationTreeItems({
        projectId: "cockpit",
        projectThreads: [parent, child],
        workerSessions: [],
        includeArchived: false,
      }),
    );

    expect(
      pinnedProjectConversationTreeRoots(tree, new Set([child.thread_id]))[0]?.conversation
        .thread_id,
    ).toBe(child.thread_id);
  });
});
