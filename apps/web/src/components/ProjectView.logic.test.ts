import { EnvironmentId, JarvisProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  appendProjectRepositoryDraftRow,
  buildProjectFileUploadInput,
  buildProjectMemoryRecordInput,
  buildProjectRepositoryDraftRows,
  findProjectById,
  removeProjectRepositoryDraftRow,
  resolveProjectRouteParams,
  resolveProjectRouteRenderState,
  setDefaultProjectRepositoryDraftRow,
  validateAddedProjectRepositoryDraft,
} from "./ProjectView.logic";

describe("resolveProjectRouteParams", () => {
  it("requires an environment and project id", () => {
    expect(resolveProjectRouteParams({ environmentId: "env", projectId: "jarvis" })).toEqual({
      environmentId: "env",
      projectId: "jarvis",
    });
    expect(resolveProjectRouteParams({ environmentId: "env" })).toBe(null);
    expect(resolveProjectRouteParams({ projectId: "jarvis" })).toBe(null);
  });
});

describe("resolveProjectRouteRenderState", () => {
  it("matches the chat-surface shell readiness contract", () => {
    const params = { environmentId: EnvironmentId.make("env"), projectId: "jarvis" } as const;

    expect(
      resolveProjectRouteRenderState({
        params: null,
        shellError: null,
        shellHasSnapshot: false,
        shellPending: false,
      }),
    ).toEqual({ status: "invalid" });
    expect(
      resolveProjectRouteRenderState({
        params,
        shellError: "offline",
        shellHasSnapshot: false,
        shellPending: false,
      }),
    ).toEqual({ status: "error", message: "offline" });
    expect(
      resolveProjectRouteRenderState({
        params,
        shellError: null,
        shellHasSnapshot: false,
        shellPending: true,
      }),
    ).toEqual({ status: "loading" });
    expect(
      resolveProjectRouteRenderState({
        params,
        shellError: null,
        shellHasSnapshot: true,
        shellPending: true,
      }),
    ).toEqual({ status: "ready", params });
  });
});

describe("project repository draft rows", () => {
  it("reuses settings repository draft projection and adds stable row ids", () => {
    expect(
      buildProjectRepositoryDraftRows({
        repos: [
          { name: " runtime ", remote: " roughcoder/jarvis ", default: true },
          { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        ],
        makeRowId: (index, repo) => `${index}:${repo.remote}`,
      }),
    ).toEqual([
      {
        rowId: "0: roughcoder/jarvis ",
        name: " runtime ",
        remote: " roughcoder/jarvis ",
        default: true,
      },
      {
        rowId: "1:roughcoder/jarvis-cockpit",
        name: "cockpit",
        remote: "roughcoder/jarvis-cockpit",
        default: false,
      },
    ]);
  });

  it("keeps exactly one default when removing the default row", () => {
    expect(
      removeProjectRepositoryDraftRow(
        [
          { rowId: "a", name: "runtime", remote: "roughcoder/jarvis", default: true },
          { rowId: "b", name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        ],
        0,
      ),
    ).toEqual([
      { rowId: "b", name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true },
    ]);
  });

  it("adds blank rows and moves default selection", () => {
    const drafts = appendProjectRepositoryDraftRow([], "a");
    expect(drafts).toEqual([{ rowId: "a", name: "", remote: "", default: true }]);

    expect(
      setDefaultProjectRepositoryDraftRow(
        [...drafts, { rowId: "b", name: "cockpit", remote: "roughcoder/cockpit", default: false }],
        1,
        true,
      ),
    ).toEqual([
      { rowId: "a", name: "", remote: "", default: false },
      { rowId: "b", name: "cockpit", remote: "roughcoder/cockpit", default: true },
    ]);
  });

  it("merges an added repository through the shared settings validator", () => {
    const result = validateAddedProjectRepositoryDraft({
      drafts: [
        { rowId: "a", name: "runtime", remote: "roughcoder/jarvis", default: true },
        { rowId: "b", name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
      ],
      draft: { name: "apple", remote: "roughcoder/jarvis-apple", default: true },
      rowId: "c",
    });

    expect(result).toEqual({
      ok: true,
      drafts: [
        { rowId: "a", name: "runtime", remote: "roughcoder/jarvis", default: false },
        { rowId: "b", name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        { rowId: "c", name: "apple", remote: "roughcoder/jarvis-apple", default: true },
      ],
      repos: [
        { name: "runtime", remote: "roughcoder/jarvis", default: false },
        { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        { name: "apple", remote: "roughcoder/jarvis-apple", default: true },
      ],
      errors: [],
    });
  });

  it("reports duplicate remotes when adding a repository", () => {
    const result = validateAddedProjectRepositoryDraft({
      drafts: [{ rowId: "a", name: "runtime", remote: "roughcoder/jarvis", default: true }],
      draft: { name: "duplicate", remote: "ROUGHCODER/JARVIS", default: false },
      rowId: "b",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      rowIndex: 1,
      field: "remote",
      message: "Remote duplicates row 1.",
    });
  });
});

describe("buildProjectFileUploadInput", () => {
  it("builds the same text artifact payload used by settings uploads", () => {
    expect(
      buildProjectFileUploadInput(
        {
          title: " Project plan ",
          artifactType: " design ",
          filename: " docs/plan.md ",
          content: "# Plan\n",
        },
        (content) => `base64:${content}`,
      ),
    ).toEqual({
      ok: true,
      input: {
        filename: "docs/plan.md",
        content_base64: "base64:# Plan\n",
        title: "Project plan",
        artifact_type: "design",
        mime_type: "text/markdown",
      },
    });
  });

  it("requires a file name and content before building an upload payload", () => {
    expect(
      buildProjectFileUploadInput(
        { title: "", artifactType: "spec", filename: " ", content: "notes" },
        (content) => content,
      ),
    ).toEqual({ ok: false, message: "File name and content are required." });
  });
});

describe("buildProjectMemoryRecordInput", () => {
  it("selects the finding command and trims the memory content", () => {
    expect(
      buildProjectMemoryRecordInput({ kind: "finding", content: "  Worker is idle  " }),
    ).toEqual({
      ok: true,
      kind: "finding",
      command: "recordFinding",
      input: { content: "Worker is idle" },
    });
  });

  it("selects the decision command", () => {
    expect(
      buildProjectMemoryRecordInput({ kind: "decision", content: "Use the cockpit repo" }),
    ).toEqual({
      ok: true,
      kind: "decision",
      command: "recordDecision",
      input: { content: "Use the cockpit repo" },
    });
  });

  it("requires memory content before building the command input", () => {
    expect(buildProjectMemoryRecordInput({ kind: "finding", content: " " })).toEqual({
      ok: false,
      message: "Memory content is required.",
    });
  });
});

describe("findProjectById", () => {
  it("returns null when a project is absent", () => {
    expect(
      findProjectById(
        [
          {
            id: JarvisProjectId.make("jarvis"),
            name: "Jarvis",
            peer_id: "peer",
            aliases: [],
            owner: null,
            members: [],
            visibility: null,
            status: "active",
            repos: [],
            links: { urls: [] },
            files_root: null,
          },
        ],
        "missing",
      ),
    ).toBe(null);
  });
});
