import { describe, expect, it } from "vite-plus/test";
import {
  JarvisProjectId,
  JarvisProjectThreadId,
  type JarvisProjectThread,
} from "@t3tools/contracts";

import {
  archivedProjectConversationSummary,
  buildProjectConversationRouteParams,
  defaultProjectRepo,
  extractProjectConversationReply,
  formatProjectConversationFailure,
  isProjectConversationArchived,
  latestProjectConversation,
  projectConversationHistoryMessages,
  reduceProjectConversationSendState,
  resolveProjectConversationRouteParams,
  resolveProjectConversationRouteRenderState,
  sortProjectConversations,
  visibleProjectFiles,
} from "./jarvisProjectConversations.logic";

function thread(id: string, updatedAt: string): JarvisProjectThread {
  return {
    thread_id: JarvisProjectThreadId.make(id),
    project_id: JarvisProjectId.make("jarvis"),
    session_id: `project:jarvis:orchestrator:${id}`,
    title: id,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: updatedAt,
    created_by: "operator",
  };
}

describe("project conversation routes", () => {
  it("builds and resolves route params without changing Jarvis ids", () => {
    expect(
      buildProjectConversationRouteParams({
        environmentId: "env-1",
        projectId: "jarvis",
        threadId: "thread-1",
      }),
    ).toEqual({
      environmentId: "env-1",
      projectId: "jarvis",
      threadId: "thread-1",
    });

    expect(
      resolveProjectConversationRouteParams({
        environmentId: "env-1",
        projectId: "jarvis",
        threadId: "thread-1",
      }),
    ).toEqual({
      environmentId: "env-1",
      projectId: "jarvis",
      threadId: "thread-1",
    });
    expect(resolveProjectConversationRouteParams({ environmentId: "env-1" })).toBeNull();
  });

  it("resolves every route bootstrap condition to a visible render state", () => {
    const params = buildProjectConversationRouteParams({
      environmentId: "env-1",
      projectId: "jarvis",
      threadId: "thread-1",
    });

    expect(
      resolveProjectConversationRouteRenderState({
        params: null,
        shellError: null,
        shellHasSnapshot: false,
        shellPending: false,
      }),
    ).toEqual({ status: "invalid" });

    expect(
      resolveProjectConversationRouteRenderState({
        params,
        shellError: null,
        shellHasSnapshot: false,
        shellPending: true,
      }),
    ).toEqual({ status: "loading" });

    expect(
      resolveProjectConversationRouteRenderState({
        params,
        shellError: "Environment bootstrap failed.",
        shellHasSnapshot: false,
        shellPending: false,
      }),
    ).toEqual({ status: "error", message: "Environment bootstrap failed." });

    expect(
      resolveProjectConversationRouteRenderState({
        params,
        shellError: null,
        shellHasSnapshot: false,
        shellPending: false,
      }),
    ).toEqual({ status: "ready", params });
  });
});

describe("project conversation selection", () => {
  it("orders threads by Jarvis updated_at and picks the latest", () => {
    const older = thread("older", "2026-07-01T10:00:00.000Z");
    const newer = thread("newer", "2026-07-02T10:00:00.000Z");

    expect(sortProjectConversations([older, newer]).map((item) => item.thread_id)).toEqual([
      "newer",
      "older",
    ]);
    expect(latestProjectConversation([older, newer])?.thread_id).toBe("newer");
  });

  it("resolves archived state from Jarvis thread archive fields", () => {
    const active = thread("active", "2026-07-01T10:00:00.000Z");
    const archived = {
      ...thread("archived", "2026-07-02T10:00:00.000Z"),
      archived_at: "2026-07-03T10:00:00.000Z",
      archived_by: "neil",
      archive_reason: "superseded",
    };

    expect(isProjectConversationArchived(active)).toBe(false);
    expect(isProjectConversationArchived(archived)).toBe(true);
    expect(archivedProjectConversationSummary(archived)).toBe(
      "Archived 2026-07-03T10:00:00.000Z by neil - superseded",
    );
  });

  it("selects default repo and hides retracted project files from context", () => {
    expect(
      defaultProjectRepo({
        repos: [
          { name: "runtime", remote: "roughcoder/jarvis", default: false },
          { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true },
        ],
      })?.remote,
    ).toBe("roughcoder/jarvis-cockpit");

    expect(
      visibleProjectFiles([
        {
          doc_id: "visible",
          title: "Visible",
          artifact_type: "spec",
          session_id: "sess",
          retracted: false,
        },
        {
          doc_id: "hidden",
          title: "Hidden",
          artifact_type: "spec",
          session_id: "sess",
          retracted: true,
        },
      ]).map((file) => file.doc_id),
    ).toEqual(["visible"]);
  });
});

describe("project conversation send state", () => {
  it("models pending, streaming, completed, and failed retry states", () => {
    const initial = { prompt: "Ship it", response: "", status: "idle" as const, error: null };
    const pending = reduceProjectConversationSendState(initial, { type: "pending" });
    const streaming = reduceProjectConversationSendState(pending, {
      type: "streaming",
      delta: "Working",
    });
    const completed = reduceProjectConversationSendState(streaming, {
      type: "completed",
      response: "Working done",
    });
    const failed = reduceProjectConversationSendState(completed, {
      type: "failed",
      error: "Jarvis request projects.threads.turn failed with HTTP 502: provider_unavailable",
    });

    expect(pending.status).toBe("pending");
    expect(streaming).toMatchObject({ status: "streaming", response: "Working" });
    expect(completed).toMatchObject({ status: "completed", response: "Working done" });
    expect(failed).toMatchObject({
      status: "failed",
      error: "Jarvis request projects.threads.turn failed with HTTP 502: provider_unavailable",
    });
  });

  it("extracts progressive assistant text from Jarvis events when no final text is present", () => {
    expect(
      extractProjectConversationReply({
        ok: true,
        text: "",
        events: [
          { event: "assistant.delta", data: { delta: "Hello " } },
          { event: "assistant.delta", data: { text: "there" } },
        ],
      }),
    ).toBe("Hello there");
  });
});

describe("project conversation history", () => {
  it("renders history in observed order with user and assistant roles", () => {
    const messages = projectConversationHistoryMessages({
      messages: [
        {
          role: "assistant",
          peer_id: "jarvis",
          content: "Second",
          observed_at: "2026-07-01T10:02:00.000Z",
        },
        {
          role: "user",
          peer_id: "neil",
          content: "First",
          observed_at: "2026-07-01T10:01:00.000Z",
        },
      ],
    });

    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "First"],
      ["assistant", "Second"],
    ]);
    expect(messages.every((message) => message.source === "history")).toBe(true);
  });
});

describe("project conversation failures", () => {
  it("preserves Jarvis status and API error messages for send failures", () => {
    expect(
      formatProjectConversationFailure(
        "send",
        "Jarvis request projects.threads.turn failed with HTTP 502: provider_unavailable: Codex is unavailable.",
      ),
    ).toBe(
      "Jarvis request projects.threads.turn failed with HTTP 502: provider_unavailable: Codex is unavailable.",
    );
  });

  it("surfaces archive route gaps as unavailable instead of successful local archive", () => {
    expect(
      formatProjectConversationFailure(
        "archive",
        "Jarvis request projects.threads.archive failed with HTTP 404.",
      ),
    ).toContain("does not expose project conversation archive yet");
  });

  it("surfaces detail route gaps as honest no-history fallback", () => {
    expect(
      formatProjectConversationFailure(
        "detail",
        "Jarvis request projects.threads.get failed with HTTP 404.",
      ),
    ).toContain("does not expose project conversation history yet");
  });

  it("preserves archive and unarchive Jarvis failures without mutating local state", () => {
    expect(
      formatProjectConversationFailure(
        "archive",
        "Jarvis request projects.threads.archive failed with HTTP 500: write failed.",
      ),
    ).toBe("Jarvis request projects.threads.archive failed with HTTP 500: write failed.");
    expect(
      formatProjectConversationFailure(
        "unarchive",
        "Jarvis request projects.threads.unarchive failed with HTTP 409: already active.",
      ),
    ).toBe("Jarvis request projects.threads.unarchive failed with HTTP 409: already active.");
  });
});
