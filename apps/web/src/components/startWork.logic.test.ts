import { describe, expect, it } from "vite-plus/test";

import {
  buildStartWorkRepositoryOptions,
  buildStartWorkRoutingSummary,
  buildStartWorkSources,
  START_WORK_SEARCH_TERMS,
  START_WORK_TITLE,
  startWorkValidationMessages,
} from "./startWork.logic";

describe("buildStartWorkSources", () => {
  it("lists the six Jarvis work sources in order", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    expect(sources.map((source) => source.id)).toEqual([
      "create-project",
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

  it("enables describe work and continue work when Jarvis projects exist", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    const byId = new Map(sources.map((source) => [source.id, source]));
    expect(byId.get("create-project")?.enabled).toBe(true);
    expect(byId.get("describe-work")?.enabled).toBe(true);
    expect(byId.get("continue-run")?.enabled).toBe(true);
  });

  it("labels manual starts as simulations in fixture mode", () => {
    const sources = buildStartWorkSources({
      hasAnchorProject: true,
      hasResumableThread: false,
      fixtureMode: true,
    });
    const describeWork = sources.find((source) => source.id === "describe-work");

    expect(describeWork?.title).toBe("Simulate work");
    expect(describeWork?.description).toContain("No live workers");
    expect(describeWork?.description).not.toContain("dispatched to Jarvis");
  });

  it("keeps describe work enabled before the first run", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: false, hasResumableThread: false });
    const byId = new Map(sources.map((source) => [source.id, source]));
    expect(byId.get("describe-work")?.enabled).toBe(true);
    expect(byId.get("continue-run")?.enabled).toBe(false);
    expect(byId.get("continue-run")?.disabledHint).toBeTruthy();
  });

  it("marks source rows disabled when Jarvis catalog does not expose them", () => {
    const sources = buildStartWorkSources({ hasAnchorProject: true, hasResumableThread: true });
    const byId = new Map(sources.map((source) => [source.id, source]));
    for (const id of ["github-issue", "linear-ticket", "register-repository"] as const) {
      expect(byId.get(id)?.enabled).toBe(false);
      expect(byId.get(id)?.disabledHint).toMatch(/Jarvis/);
    }
  });

  it("enables source rows from Jarvis catalog start options", () => {
    const sources = buildStartWorkSources({
      hasAnchorProject: true,
      hasResumableThread: true,
      catalog: {
        sources: ["manual", "github", "linear"],
        defaults: {
          repo: "roughcoder/jarvis",
          engine: "codex",
          landing_mode: "draft_pr",
        },
      },
    });
    const byId = new Map(sources.map((source) => [source.id, source]));

    expect(byId.get("describe-work")?.enabled).toBe(true);
    expect(byId.get("github-issue")?.enabled).toBe(true);
    expect(byId.get("linear-ticket")?.enabled).toBe(true);
    expect(byId.get("describe-work")?.description).toContain("roughcoder/jarvis");
    expect(byId.get("describe-work")?.description).toContain("codex");
  });

  it("shows selected Jarvis routing context in the manual start row", () => {
    const sources = buildStartWorkSources({
      hasAnchorProject: true,
      hasResumableThread: false,
      routing: {
        projects: [
          {
            id: "project_jarvis",
            name: "Jarvis",
            repos: [{ name: "jarvis-cockpit", remote: "roughcoder/jarvis-cockpit", default: true }],
          },
        ],
        workers: [
          {
            worker_id: "mac-mini-worker",
            display_name: "Mac mini",
            repositories: [
              { repo: "roughcoder/jarvis-cockpit", can_start_work: true, is_default: true },
            ],
          },
        ],
        engine: "codex",
      },
    });
    const describeWork = sources.find((source) => source.id === "describe-work");

    expect(describeWork?.description).toContain("Project: Jarvis");
    expect(describeWork?.description).toContain("Repo: roughcoder/jarvis-cockpit");
    expect(describeWork?.description).toContain("Worker: Auto: Mac mini");
    expect(describeWork?.description).toContain("Engine: codex");
    expect(describeWork?.description).toContain("Compatible");
  });

  it("orders Jarvis repository options by start readiness and default marker", () => {
    const repositories = buildStartWorkRepositoryOptions([
      {
        worker_id: "macbook-worker",
        display_name: "MacBook",
        repositories: [
          {
            repo: "roughcoder/secondary",
            status: "ready",
            default_branch: "main",
            can_start_work: true,
          },
          {
            repo: "roughcoder/jarvis",
            status: "ready",
            default_branch: "main",
            is_default: true,
            can_start_work: true,
          },
          {
            repo: "roughcoder/not-ready",
            status: "missing",
            default_branch: "main",
            is_default: true,
            can_start_work: false,
          },
        ],
      },
    ]);

    expect(repositories.map((repository) => repository.repo)).toEqual([
      "roughcoder/jarvis",
      "roughcoder/secondary",
      "roughcoder/not-ready",
    ]);
    expect(repositories[0]?.workerName).toBe("MacBook");
    expect(repositories[0]?.defaultBranch).toBe("main");
  });

  it("keeps upstream add-project spellings searchable on the root action", () => {
    expect(START_WORK_TITLE).toBe("Start work");
    expect(START_WORK_SEARCH_TERMS).toContain("add project");
  });
});

describe("buildStartWorkRoutingSummary", () => {
  it("blocks incompatible selected workers and reports engine support", () => {
    const summary = buildStartWorkRoutingSummary({
      projects: [
        {
          id: "project_jarvis",
          name: "Jarvis",
          repos: [{ name: "jarvis", remote: "roughcoder/jarvis", default: true }],
        },
      ],
      workers: [
        {
          worker_id: "laptop-worker",
          display_name: "Laptop",
          repositories: [{ repo: "roughcoder/other", can_start_work: true }],
          engines: [{ engine: "codex", status: "available" }],
        },
      ],
      selectedWorkerId: "laptop-worker",
      engine: "claude",
    });

    expect(summary.projectLabel).toBe("Jarvis");
    expect(summary.repoLabel).toBe("roughcoder/jarvis");
    expect(summary.workerLabel).toBe("Laptop");
    expect(summary.compatibilityLabel).toBe("No compatible worker");
    expect(summary.engineSupport).toBe("claude unsupported");
    expect(summary.canDispatch).toBe(false);
  });

  it("surfaces Jarvis validation missing fields, authority, and reasons", () => {
    const messages = startWorkValidationMessages({
      ok: true,
      validation: {
        can_start: false,
        missing: ["repo"],
        missing_authority: ["github:write"],
        reasons: ["selected worker cannot access the repository"],
      },
    });

    expect(messages).toEqual([
      "Missing: repo",
      "Missing authority: github:write",
      "selected worker cannot access the repository",
    ]);
  });
});
