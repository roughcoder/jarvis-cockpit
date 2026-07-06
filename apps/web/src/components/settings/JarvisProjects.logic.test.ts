import { describe, expect, it } from "vite-plus/test";

import {
  classifyProjectWriteFailure,
  formatProjectConversationFailure,
  formatProjectWriteFailure,
  validateProjectRepositoryDrafts,
} from "./JarvisProjects.logic";

describe("validateProjectRepositoryDrafts", () => {
  it("accepts one default repo with trimmed names and remotes", () => {
    const result = validateProjectRepositoryDrafts([
      { name: " runtime ", remote: " roughcoder/jarvis ", default: true },
      { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
    ]);

    expect(result.ok).toBe(true);
    expect(result.repos).toEqual([
      { name: "runtime", remote: "roughcoder/jarvis", default: true },
      { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
    ]);
  });

  it("requires at least one repository", () => {
    const result = validateProjectRepositoryDrafts([]);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.message)).toContain("Add at least one repository.");
  });

  it("requires exactly one default repository", () => {
    expect(
      validateProjectRepositoryDrafts([
        { name: "runtime", remote: "roughcoder/jarvis", default: false },
      ]).errors.map((error) => error.message),
    ).toContain("Select exactly one default repository.");

    expect(
      validateProjectRepositoryDrafts([
        { name: "runtime", remote: "roughcoder/jarvis", default: true },
        { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true },
      ]).errors.map((error) => error.message),
    ).toContain("Select exactly one default repository.");
  });

  it("reports empty row fields and duplicate remotes", () => {
    const result = validateProjectRepositoryDrafts([
      { name: "", remote: "roughcoder/jarvis", default: true },
      { name: "copy", remote: " ROUGHCODER/JARVIS ", default: false },
      { name: "empty-remote", remote: "", default: false },
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { rowIndex: 0, field: "name", message: "Repository name is required." },
        { rowIndex: 1, field: "remote", message: "Remote duplicates row 1." },
        { rowIndex: 2, field: "remote", message: "Remote is required." },
      ]),
    );
  });
});

describe("formatProjectWriteFailure", () => {
  it("keeps missing-authority detail for forbidden project writes", () => {
    expect(
      formatProjectWriteFailure(
        new Error(
          "Jarvis request projects.create failed with HTTP 403: missing authority: project.create",
        ),
      ),
    ).toBe("Jarvis denied the project write: missing authority: project.create");
  });

  it("classifies missing authority separately from generic auth failures", () => {
    expect(
      classifyProjectWriteFailure(
        "Jarvis request projects.update failed with HTTP 403: missing authority: project.update",
      ),
    ).toEqual({
      kind: "missing-authority",
      message: "Jarvis denied the project write: missing authority: project.update",
    });
    expect(
      classifyProjectWriteFailure("Jarvis request projects.update failed with HTTP 401."),
    ).toMatchObject({ kind: "auth" });
  });

  it("identifies network failures", () => {
    expect(formatProjectWriteFailure(new Error("fetch failed: ECONNREFUSED"))).toMatch(
      /could not reach the Jarvis brain/,
    );
    expect(classifyProjectWriteFailure("Failed to fetch")).toMatchObject({ kind: "network" });
  });

  it("identifies validation failures", () => {
    expect(
      classifyProjectWriteFailure(
        "Jarvis request projects.create failed with HTTP 422: duplicate remote",
      ),
    ).toEqual({
      kind: "validation",
      message: "Jarvis rejected the project write as invalid: duplicate remote",
    });
  });

  it("treats HTTP 405 as a missing project-management route", () => {
    expect(
      formatProjectWriteFailure(new Error("Jarvis request projects.update failed with HTTP 405.")),
    ).toMatch(/does not expose project-management writes/);
  });

  it("does not blame missing APIs for generic request failures", () => {
    expect(formatProjectWriteFailure("failed")).toBe(
      "Cockpit could not complete the project write against this Jarvis brain. Check the brain connection, auth mode, and project permissions.",
    );
  });

  it("identifies missing conversation archive routes", () => {
    expect(
      formatProjectConversationFailure(
        new Error("Jarvis request projects.threads.archive failed with HTTP 404."),
      ),
    ).toMatch(/does not expose project conversation archive/);
  });

  it("identifies missing conversation archive routes from server result messages", () => {
    expect(
      formatProjectConversationFailure(
        "Jarvis request projects.threads.archive failed with HTTP 404.",
      ),
    ).toMatch(/does not expose project conversation archive/);
  });
});
