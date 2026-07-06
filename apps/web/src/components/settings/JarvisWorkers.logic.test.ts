import { describe, expect, it } from "vite-plus/test";
import { JarvisWorkerId, MessageId, ThreadId, type JarvisWorkerProfile } from "@t3tools/contracts";

import {
  buildWorkerTestJobStartTurnInput,
  NOT_REPORTED,
  resolveWorkerTestJobStatus,
  workerIdentityAccessSummary,
  workerReadinessRows,
} from "./JarvisWorkers.logic";

function worker(overrides: Partial<JarvisWorkerProfile> = {}): JarvisWorkerProfile {
  return {
    worker_id: JarvisWorkerId.make("mac-mini-worker"),
    display_name: "Mac mini",
    status: "online",
    health: "healthy",
    last_seen_at: "2026-07-06T12:00:00.000Z",
    capabilities: ["code.edit", "shell.run", "browser.use"],
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

describe("workerReadinessRows", () => {
  it("distinguishes reported healthy rows from not reported rows", () => {
    const rows = new Map(workerReadinessRows(worker()).map((row) => [row.id, row]));

    expect(rows.get("codex-installed")?.status).toBe("reported-healthy");
    expect(rows.get("codex-authenticated")?.status).toBe("reported-healthy");
    expect(rows.get("browser-dev-server")?.status).toBe("reported-healthy");
    expect(rows.get("git-credentials")?.status).toBe("not-reported");
    expect(rows.get("git-credentials")?.detail).toBe(NOT_REPORTED);
    expect(rows.get("worktree-materialization")?.status).toBe("not-reported");
    expect(rows.get("package-manager")?.status).toBe("not-reported");
  });

  it("marks explicit unhealthy reported data without inferring missing future data", () => {
    const rows = new Map(
      workerReadinessRows(
        worker({
          capabilities: ["git.credentials.invalid", "package-manager.unavailable"],
          engines: [
            {
              engine: "codex",
              display_name: "Codex",
              status: "unavailable",
              default: true,
              supports: {
                streaming: false,
                resume: false,
                interrupt: false,
                approval_requests: false,
                input_requests: false,
                checkpoints: false,
              },
            },
          ],
        }),
      ).map((row) => [row.id, row]),
    );

    expect(rows.get("codex-installed")?.status).toBe("reported-healthy");
    expect(rows.get("codex-authenticated")?.status).toBe("reported-unhealthy");
    expect(rows.get("git-credentials")?.status).toBe("reported-unhealthy");
    expect(rows.get("package-manager")?.status).toBe("reported-unhealthy");
    expect(rows.get("worktree-materialization")?.status).toBe("not-reported");
  });
});

describe("workerIdentityAccessSummary", () => {
  it("keeps git identity, repo access, and worktree inventory honest until reported", () => {
    expect(workerIdentityAccessSummary(worker())).toEqual({
      gitIdentity: NOT_REPORTED,
      repoAccess: NOT_REPORTED,
      worktreeInventory: NOT_REPORTED,
    });
  });

  it("uses future snapshot metadata when Jarvis starts reporting it", () => {
    expect(
      workerIdentityAccessSummary(
        worker({
          public_metadata: {
            git_identity: { login: "octocat" },
            repo_access_summary: "12 private repos + public",
            worktree_inventory: { count: 3, disk_usage: "2.4 GB", stale_count: 1 },
          },
        }),
      ),
    ).toEqual({
      gitIdentity: "octocat",
      repoAccess: "12 private repos + public",
      worktreeInventory: "3 worktrees / 2.4 GB / 1 stale",
    });
  });
});

describe("buildWorkerTestJobStartTurnInput", () => {
  it("pins the existing start-work dispatch path to the selected worker", () => {
    const input = buildWorkerTestJobStartTurnInput({
      worker: worker(),
      threadId: ThreadId.make("thread-worker-test"),
      messageId: MessageId.make("message-worker-test"),
      createdAt: "2026-07-06T12:00:00.000Z",
    });

    expect(input.threadId).toBe("thread-worker-test");
    expect(input.message.text).toContain("worker readiness test");
    expect(input.titleSeed).toBe("Worker readiness test: Mac mini");
    expect(input.bootstrap?.createThread).toMatchObject({
      projectId: "jarvis-start",
      title: "Worker readiness test: Mac mini",
      modelSelection: { instanceId: "codex" },
      branch: null,
      worktreePath: null,
      createdAt: "2026-07-06T12:00:00.000Z",
    });
    expect(input.bootstrap).toMatchObject({
      jarvisWorkerId: "mac-mini-worker",
      jarvisEngine: "codex",
      jarvisRepo: "roughcoder/jarvis-cockpit",
    });
    expect(input.createdAt).toBe("2026-07-06T12:00:00.000Z");
  });
});

describe("resolveWorkerTestJobStatus", () => {
  it("returns an idle presentation before any test job is sent", () => {
    expect(resolveWorkerTestJobStatus(null)).toEqual({
      label: "Not sent",
      detail: "No worker readiness test has been sent from this card.",
      variant: "outline",
      timestamp: null,
    });
  });

  it("keeps pending test jobs inspectable while the RPC is in flight", () => {
    expect(
      resolveWorkerTestJobStatus({
        state: "pending",
        updatedAt: "2026-07-06T12:01:00.000Z",
      }),
    ).toEqual({
      label: "Pending",
      detail: "Dispatch RPC is in flight.",
      variant: "warning",
      timestamp: "2026-07-06T12:01:00.000Z",
    });
  });

  it("shows the promoted Jarvis thread when dispatch succeeds", () => {
    expect(
      resolveWorkerTestJobStatus({
        state: "dispatched",
        updatedAt: "2026-07-06T12:02:00.000Z",
        promotedThreadId: "jarvis-session_sessref_worker_sess_1",
      }),
    ).toEqual({
      label: "Dispatched",
      detail: "Jarvis accepted the test job as jarvis-session_sessref_worker_sess_1.",
      variant: "success",
      timestamp: "2026-07-06T12:02:00.000Z",
    });
  });

  it("keeps failed dispatch errors visible on the worker card", () => {
    expect(
      resolveWorkerTestJobStatus({
        state: "failed",
        updatedAt: "2026-07-06T12:03:00.000Z",
        error: "missing authority github:write",
      }),
    ).toEqual({
      label: "Failed",
      detail: "missing authority github:write",
      variant: "error",
      timestamp: "2026-07-06T12:03:00.000Z",
    });
  });
});
