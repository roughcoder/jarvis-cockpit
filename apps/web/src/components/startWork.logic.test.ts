import { describe, expect, it } from "vite-plus/test";

import {
  buildStartWorkSources,
  START_WORK_SEARCH_TERMS,
  START_WORK_TITLE,
} from "./startWork.logic";

describe("buildStartWorkSources", () => {
  it("lists the five Jarvis work sources in order", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    expect(sources.map((source) => source.id)).toEqual([
      "describe-work",
      "github-issue",
      "linear-ticket",
      "continue-run",
      "register-repository",
    ]);
  });

  it("never offers local folder, git url, or provider clone sources", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    const haystack = sources
      .flatMap((source) => [source.title, source.description, ...source.searchTerms])
      .join(" ")
      .toLowerCase();
    expect(haystack).not.toContain("local folder");
    expect(haystack).not.toContain("clone");
    expect(haystack).not.toContain("worktree");
    expect(haystack).not.toContain("branch");
  });

  it("enables describe work and continue run when Jarvis runs exist", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    const byId = new Map(sources.map((source) => [source.id, source]));
    expect(byId.get("describe-work")?.enabled).toBe(true);
    expect(byId.get("continue-run")?.enabled).toBe(true);
  });

  it("keeps describe work enabled before the first run", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: false, hasResumableThread: false });
    const byId = new Map(sources.map((source) => [source.id, source]));
    expect(byId.get("describe-work")?.enabled).toBe(true);
    expect(byId.get("continue-run")?.enabled).toBe(false);
    expect(byId.get("continue-run")?.disabledHint).toBeTruthy();
  });

  it("marks unresolved Jarvis source contracts as disabled with the missing capability", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    const byId = new Map(sources.map((source) => [source.id, source]));
    for (const id of ["github-issue", "linear-ticket", "register-repository"] as const) {
      expect(byId.get(id)?.enabled).toBe(false);
      expect(byId.get(id)?.disabledHint).toMatch(/Jarvis/);
    }
  });

  it("keeps upstream add-project spellings searchable on the root action", () => {
    expect(START_WORK_TITLE).toBe("Start work");
    expect(START_WORK_SEARCH_TERMS).toContain("add project");
  });
});
