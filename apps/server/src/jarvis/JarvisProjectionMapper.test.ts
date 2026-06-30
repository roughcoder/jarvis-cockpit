import { assert, it } from "@effect/vitest";

import type { JarvisRun, JarvisSessionEvent, JarvisWorkerSession } from "@t3tools/contracts";

import {
  isJarvisThreadId,
  jarvisSessionIdFromThreadId,
  mapJarvisRunsSnapshotToShellSnapshot,
  mapJarvisSessionToThreadDetail,
} from "./JarvisProjectionMapper.ts";

const now = "2026-06-30T18:00:00+00:00";

const run: JarvisRun = {
  run_id: "run_1" as JarvisRun["run_id"],
  title: "Build worker sessions",
  objective: "Expose live worker sessions",
  status: "running",
  repo: "roughcoder/jarvis",
  branch: "feature/sessions",
  cwd: "/Users/neilbarton/Development/jarvis",
  worker_count: 1,
  session_count: 2,
  needs_input: false,
  needs_approval: true,
  created_at: now,
  updated_at: now,
  metadata: {},
};

const makeSession = (
  id: string,
  status: JarvisWorkerSession["status"] = "running",
): JarvisWorkerSession => ({
  session_id: id as JarvisWorkerSession["session_id"],
  provider: "codex",
  engine: "codex",
  status,
  run_id: run.run_id,
  repo: run.repo,
  branch: run.branch,
  cwd: run.cwd,
  title: `Session ${id}`,
  created_at: now,
  updated_at: now,
  metadata: {},
});

it("maps one Jarvis run with two sessions into one project and two thread shells", () => {
  const snapshot = mapJarvisRunsSnapshotToShellSnapshot({
    runs: [run],
    sessions: [makeSession("sess_1"), makeSession("sess_2", "needs_approval")],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(snapshot.projects.length, 1);
  assert.strictEqual(snapshot.threads.length, 2);
  assert.strictEqual(snapshot.projects[0]?.id, "jarvis-run_run_1");
  assert.strictEqual(snapshot.threads[1]?.hasPendingApprovals, true);
});

it("preserves Jarvis provenance in generated thread ids", () => {
  const threadId = "jarvis-session_sess_1";
  assert.strictEqual(isJarvisThreadId(threadId), true);
  assert.strictEqual(jarvisSessionIdFromThreadId(threadId), "sess_1");
  assert.strictEqual(isJarvisThreadId("thread_1"), false);
});

it("uses deterministic fallback workspace labels when cwd is missing", () => {
  const mapped = mapJarvisRunsSnapshotToShellSnapshot({
    runs: [
      {
        ...run,
        cwd: null,
        repo: null,
      },
    ],
    sessions: [{ ...makeSession("sess_1"), cwd: null, repo: null }],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(mapped.projects[0]?.workspaceRoot, "/jarvis/run_1");
});

it("maps known and unknown events into timeline activities", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: "ev_1" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "assistant.message",
      time: now,
      data: {
        turn_id: "turn_1",
        text: "Done.",
      },
    },
    {
      event_id: "ev_2" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "provider.future_event",
      time: "2026-06-30T18:00:01+00:00",
      data: {
        message: "Future event",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages[0]?.text, "Done.");
  assert.strictEqual(detail.activities[1]?.kind, "provider.future_event");
  assert.strictEqual(detail.activities[1]?.tone, "info");
  assert.strictEqual(detail.activities[1]?.summary, "Future event");
});
