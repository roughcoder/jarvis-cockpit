import { describe, expect, it } from "vite-plus/test";

import {
  CREATE_PROJECT_COLLISION_CATALOG_INPUT,
  addCreateProjectRepository,
  buildCreateProjectPayload,
  createProjectCollisionCatalogState,
  createInitialProjectDraft,
  projectSlugFromTitle,
  removeCreateProjectRepository,
  setDefaultCreateProjectRepository,
  uniqueProjectSlugFromTitle,
  validateCreateProjectTitle,
  type CreateProjectRepositoryDraft,
} from "./CreateProjectDialog.logic";

function repository(rowId: string, defaultRepository = false): CreateProjectRepositoryDraft {
  return {
    rowId,
    name: rowId,
    remote: `roughcoder/${rowId}`,
    default: defaultRepository,
  };
}

describe("project creation wizard logic", () => {
  it("loads all project ids and blocks creation until the collision catalog resolves", () => {
    expect(CREATE_PROJECT_COLLISION_CATALOG_INPUT).toEqual({ includeArchived: true });
    expect(
      createProjectCollisionCatalogState({
        hasEnvironment: true,
        querySucceeded: false,
        queryFailed: false,
      }),
    ).toBe("loading");
    expect(
      createProjectCollisionCatalogState({
        hasEnvironment: true,
        querySucceeded: false,
        queryFailed: true,
      }),
    ).toBe("error");
    expect(
      createProjectCollisionCatalogState({
        hasEnvironment: true,
        querySucceeded: true,
        queryFailed: false,
      }),
    ).toBe("ready");
  });

  it("creates a title-first draft with one blank default repository", () => {
    expect(createInitialProjectDraft("first-repo")).toEqual({
      title: "",
      repos: [{ rowId: "first-repo", name: "", remote: "", default: true }],
    });
  });

  it("normalizes a project title into a stable slug", () => {
    expect(projectSlugFromTitle("  Holo Table: Launch!  ")).toBe("holo-table-launch");
    expect(projectSlugFromTitle("!!!")).toBe("project");
  });

  it("adds a stable suffix when a generated project key already exists", () => {
    expect(
      uniqueProjectSlugFromTitle(
        "Holo Table",
        new Set(["holo-table", "holo-table-2", "another-project"]),
      ),
    ).toBe("holo-table-3");
    expect(uniqueProjectSlugFromTitle("Fresh project", new Set(["holo-table"]))).toBe(
      "fresh-project",
    );
  });

  it("trims and validates titles", () => {
    expect(validateCreateProjectTitle("  Holo Table  ")).toEqual({
      ok: true,
      title: "Holo Table",
    });
    expect(validateCreateProjectTitle("   ")).toEqual({
      ok: false,
      message: "Project title is required.",
    });
  });

  it("adds repository rows while repairing the single-default invariant", () => {
    expect(
      addCreateProjectRepository([repository("runtime"), repository("cockpit")], "website").map(
        ({ rowId, default: isDefault }) => [rowId, isDefault],
      ),
    ).toEqual([
      ["runtime", true],
      ["cockpit", false],
      ["website", false],
    ]);
  });

  it("promotes the first remaining row when the default repository is removed", () => {
    const repos = [repository("runtime", true), repository("cockpit")];

    expect(
      removeCreateProjectRepository(repos, "runtime").map(({ rowId, default: isDefault }) => [
        rowId,
        isDefault,
      ]),
    ).toEqual([["cockpit", true]]);
    expect(removeCreateProjectRepository([repository("runtime", true)], "runtime")).toEqual([
      repository("runtime", true),
    ]);
  });

  it("changes the default repository without allowing an unknown row to clear it", () => {
    const repos = [repository("runtime", true), repository("cockpit")];

    expect(
      setDefaultCreateProjectRepository(repos, "cockpit").map(({ rowId, default: isDefault }) => [
        rowId,
        isDefault,
      ]),
    ).toEqual([
      ["runtime", false],
      ["cockpit", true],
    ]);
    expect(setDefaultCreateProjectRepository(repos, "missing")).toEqual(repos);
  });

  it("builds a trimmed payload and infers missing repository names from remotes", () => {
    const result = buildCreateProjectPayload({
      title: "  Holo Table  ",
      repos: [
        {
          rowId: "runtime",
          name: " ",
          remote: " https://github.com/roughcoder/holo-table.git ",
          default: true,
        },
        {
          rowId: "docs",
          name: " docs ",
          remote: " roughcoder/holo-docs ",
          default: false,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        id: "holo-table",
        name: "Holo Table",
        repos: [
          {
            name: "holo-table",
            remote: "https://github.com/roughcoder/holo-table.git",
            default: true,
          },
          { name: "docs", remote: "roughcoder/holo-docs", default: false },
        ],
      },
    });
  });

  it("returns title and shared repository validation errors together", () => {
    const result = buildCreateProjectPayload({
      title: " ",
      repos: [
        { rowId: "one", name: "one", remote: "roughcoder/same", default: true },
        { rowId: "two", name: "two", remote: " ROUGHCODER/SAME ", default: false },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.titleError).toBe("Project title is required.");
    expect(result.repositoryErrors).toContainEqual({
      rowIndex: 1,
      field: "remote",
      message: "Remote duplicates row 1.",
    });
  });
});
