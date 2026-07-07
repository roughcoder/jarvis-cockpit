import { EnvironmentId, JarvisProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  appendProjectRepositoryDraftRow,
  buildProjectRepositoryDraftRows,
  findProjectById,
  removeProjectRepositoryDraftRow,
  resolveProjectRouteParams,
  resolveProjectRouteRenderState,
  setDefaultProjectRepositoryDraftRow,
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
