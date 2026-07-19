import {
  JarvisProjectId,
  JarvisProjectThreadId,
  type JarvisProjectThread,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  archivedProjectConversationSummary,
  buildProjectConversationRouteParams,
  defaultProjectRepo,
  extractProjectConversationReply,
  formatProjectConversationFailure,
  isProjectConversationArchived,
  latestProjectConversation,
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
    const expected = {
      environmentId: "env-1",
      projectId: "jarvis",
      threadId: "thread-1",
    };
    expect(buildProjectConversationRouteParams(expected)).toEqual(expected);
    expect(resolveProjectConversationRouteParams(expected)).toEqual(expected);
    expect(resolveProjectConversationRouteParams({ environmentId: "env-1" })).toBeNull();
  });

  it("does not gate a durable conversation on the global orchestration snapshot", () => {
    const params = buildProjectConversationRouteParams({
      environmentId: "env-1",
      projectId: "jarvis",
      threadId: "thread-1",
    });
    expect(resolveProjectConversationRouteRenderState({ params: null })).toEqual({
      status: "invalid",
    });
    expect(resolveProjectConversationRouteRenderState({ params })).toEqual({
      status: "ready",
      params,
    });
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

  it("selects the default repo and hides retracted project files", () => {
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

describe("project conversation command projections", () => {
  it("extracts progressive assistant text when no final text is present", () => {
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

  it("preserves send failures and classifies compatibility route gaps", () => {
    const sendFailure =
      "Jarvis request projects.threads.turn failed with HTTP 502: provider_unavailable.";
    expect(formatProjectConversationFailure("send", sendFailure)).toBe(sendFailure);
    expect(
      formatProjectConversationFailure(
        "archive",
        "Jarvis request projects.threads.archive failed with HTTP 404.",
      ),
    ).toContain("does not expose project conversation archive yet");
    expect(
      formatProjectConversationFailure(
        "detail",
        "Jarvis request projects.threads.get failed with HTTP 404.",
      ),
    ).toContain("does not expose project conversation history yet");
  });

  it("does not reinterpret non-compatibility archive failures", () => {
    const archiveFailure =
      "Jarvis request projects.threads.archive failed with HTTP 500: write failed.";
    const unarchiveFailure =
      "Jarvis request projects.threads.unarchive failed with HTTP 409: already active.";
    expect(formatProjectConversationFailure("archive", archiveFailure)).toBe(archiveFailure);
    expect(formatProjectConversationFailure("unarchive", unarchiveFailure)).toBe(unarchiveFailure);
  });
});
