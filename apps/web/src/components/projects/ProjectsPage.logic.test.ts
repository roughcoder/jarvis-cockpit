import type { JarvisProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  projectRepositorySummary,
  projectsForIndex,
  projectStatusLabel,
} from "./ProjectsPage.logic";

function project(
  id: string,
  name: string,
  repos: JarvisProject["repos"] = [],
  status?: string | null,
): JarvisProject {
  return {
    id: id as JarvisProject["id"],
    name,
    peer_id: id,
    aliases: [],
    owner: null,
    members: [],
    visibility: null,
    status: status ?? null,
    repos,
    links: { jira: null, urls: [] },
    files_root: null,
  };
}

describe("projectsForIndex", () => {
  it("sorts real projects by name and omits the internal start project", () => {
    const result = projectsForIndex([
      project("zeta", "Zeta"),
      project("jarvis-start", "Start work"),
      project("alpha", "Alpha"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
  });
});

describe("projectRepositorySummary", () => {
  it("prefers the default repository and reports additional repositories", () => {
    const result = projectRepositorySummary(
      project("jarvis", "Jarvis", [
        { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        { name: "runtime", remote: "roughcoder/jarvis", default: true },
      ]),
    );

    expect(result).toBe("roughcoder/jarvis +1");
  });

  it("explains when a project has no repositories", () => {
    expect(projectRepositorySummary(project("notes", "Notes"))).toBe("No linked repositories");
  });
});

describe("projectStatusLabel", () => {
  it("uses active for missing or blank status", () => {
    expect(projectStatusLabel(project("one", "One"))).toBe("active");
    expect(projectStatusLabel(project("two", "Two", [], "  "))).toBe("active");
  });
});
