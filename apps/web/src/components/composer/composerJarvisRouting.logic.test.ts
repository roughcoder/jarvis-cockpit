import { JarvisProjectId, JarvisWorkerId, type JarvisWorkerProfile } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveEffectiveComposerJarvisRouting,
  workerCanStartRepo,
  workerIsHealthyEnough,
  workerSupportsEngine,
  type ComposerJarvisProject,
} from "./composerJarvisRouting.logic";

function worker(overrides: Partial<JarvisWorkerProfile> = {}): JarvisWorkerProfile {
  return {
    worker_id: JarvisWorkerId.make("mac-mini-worker"),
    display_name: "Mac mini",
    status: "online",
    health: "healthy",
    last_seen_at: "2026-07-06T12:00:00.000Z",
    capabilities: ["code.edit"],
    engines: [
      {
        engine: "codex",
        display_name: "Codex",
        status: "available",
        default: true,
        supports: {
          streaming: true,
          resume: true,
          interrupt: true,
          approval_requests: true,
          input_requests: true,
          checkpoints: true,
        },
      },
    ],
    capacity: {
      max_sessions: 4,
      active_sessions: 0,
      queued_sessions: 0,
    },
    repositories: [
      {
        repo: "roughcoder/jarvis-cockpit",
        status: "ready",
        default_branch: "main",
        is_default: true,
        can_start_work: true,
      },
    ],
    system: {},
    public_metadata: {},
    ...overrides,
  };
}

describe("composer Jarvis routing", () => {
  const projects: ComposerJarvisProject[] = [
    {
      id: JarvisProjectId.make("project-a"),
      name: "Project A",
      repos: [
        { name: "secondary", remote: "roughcoder/secondary", default: false },
        { name: "primary", remote: "roughcoder/primary", default: true },
      ],
    },
    {
      id: JarvisProjectId.make("project-b"),
      name: "Project B",
      repos: [{ name: "app", remote: "roughcoder/app", default: false }],
    },
  ];

  it("derives routing from stored selections before active-thread defaults", () => {
    expect(
      resolveEffectiveComposerJarvisRouting({
        projects,
        activeProjectId: "project-a",
        storedRouting: {
          projectId: "project-b",
          repoRemote: "roughcoder/app",
          workerOverrideId: "worker-2",
        },
      }),
    ).toMatchObject({
      selectedProject: projects[1],
      selectedRepo: projects[1]?.repos[0],
      selectedRepoRemote: "roughcoder/app",
      selectedWorkerOverrideId: "worker-2",
    });
  });

  it("uses effective defaults without requiring stored routing", () => {
    expect(
      resolveEffectiveComposerJarvisRouting({
        projects,
        activeProjectId: "project-a",
        storedRouting: null,
      }),
    ).toMatchObject({
      selectedProject: projects[0],
      selectedRepo: projects[0]?.repos[1],
      selectedRepoRemote: "roughcoder/primary",
      selectedWorkerOverrideId: null,
    });
  });

  it("falls back when stored project or repository selections disappear", () => {
    expect(
      resolveEffectiveComposerJarvisRouting({
        projects,
        activeProjectId: "project-a",
        storedRouting: {
          projectId: "missing",
          repoRemote: "missing/repo",
          workerOverrideId: "worker-2",
        },
      }),
    ).toMatchObject({
      selectedProject: projects[0],
      selectedRepo: projects[0]?.repos[1],
      selectedRepoRemote: "roughcoder/primary",
      selectedWorkerOverrideId: "worker-2",
    });
  });

  it("accepts available and degraded engines case-insensitively", () => {
    expect(workerSupportsEngine(worker(), "codex")).toBe(true);
    expect(
      workerSupportsEngine(
        worker({
          engines: [
            {
              engine: "Claude",
              display_name: "Claude",
              status: "degraded",
              default: false,
              supports: {
                streaming: true,
                resume: true,
                interrupt: true,
                approval_requests: true,
                input_requests: true,
                checkpoints: true,
              },
            },
          ],
        }),
        "claude",
      ),
    ).toBe(true);
    expect(
      workerSupportsEngine(
        worker({
          engines: [
            {
              engine: "codex",
              display_name: "Codex",
              status: "unavailable",
              default: true,
              supports: {
                streaming: true,
                resume: true,
                interrupt: true,
                approval_requests: true,
                input_requests: true,
                checkpoints: true,
              },
            },
          ],
        }),
        "codex",
      ),
    ).toBe(false);
  });

  it("matches startable repositories by remote or last path segment", () => {
    expect(workerCanStartRepo(worker(), "roughcoder/jarvis-cockpit")).toBe(true);
    expect(
      workerCanStartRepo(
        worker({
          repositories: [
            {
              repo: "jarvis-cockpit",
              status: "ready",
              default_branch: "main",
              is_default: true,
              can_start_work: true,
            },
          ],
        }),
        "/Users/neil/Development/jarvis-cockpit",
      ),
    ).toBe(true);
    expect(workerCanStartRepo(worker(), "roughcoder/other")).toBe(false);
    expect(
      workerCanStartRepo(
        worker({
          repositories: [
            {
              repo: "roughcoder/jarvis-cockpit",
              status: "ready",
              default_branch: "main",
              is_default: true,
              can_start_work: false,
            },
          ],
        }),
        "roughcoder/jarvis-cockpit",
      ),
    ).toBe(false);
  });

  it("allows any selected repository when the worker reports no repository list", () => {
    expect(workerCanStartRepo(worker({ repositories: [] }), "roughcoder/anything")).toBe(true);
    expect(workerCanStartRepo(worker({ repositories: [] }), null)).toBe(true);
  });

  it("rejects offline or unhealthy workers", () => {
    expect(workerIsHealthyEnough(worker())).toBe(true);
    expect(workerIsHealthyEnough(worker({ status: "offline" }))).toBe(false);
    expect(workerIsHealthyEnough(worker({ health: "unhealthy" }))).toBe(false);
  });
});
