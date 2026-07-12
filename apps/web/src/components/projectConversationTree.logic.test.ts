import type { JarvisProjectThread, JarvisWorkerSession } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectConversationTreeItems,
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
