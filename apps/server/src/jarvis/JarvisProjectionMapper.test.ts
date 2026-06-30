import { assert, it } from "@effect/vitest";

import type {
  JarvisRun,
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisWorkerSession,
} from "@t3tools/contracts";

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

it("uses a stable assistant message id for deltas from the same turn", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: "ev_delta_1" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "assistant.delta",
      time: now,
      data: {
        turn_id: "turn_1",
        text: "Hel",
      },
    },
    {
      event_id: "ev_delta_2" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "assistant.delta",
      time: "2026-06-30T18:00:01+00:00",
      data: {
        turn_id: "turn_1",
        text: "lo",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages.length, 2);
  assert.strictEqual(detail.messages[0]?.id, detail.messages[1]?.id);
});

it("normalizes Jarvis input and approval request activities for T3 derivations", () => {
  const session = makeSession("sess_1", "needs_input");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: "ev_input" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "input.requested",
      time: now,
      data: {
        request_id: "input_1",
        prompt: "Which worker should continue?",
      },
    },
    {
      event_id: "ev_approval" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "approval.requested",
      time: "2026-06-30T18:00:01+00:00",
      data: {
        request_id: "approval_1",
        request_type: "file_change_approval",
        summary: "Approve file edits",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  const inputActivity = detail.activities[0];
  const approvalActivity = detail.activities[1];
  assert.ok(inputActivity);
  assert.ok(approvalActivity);
  const inputPayload = inputActivity.payload as Record<string, unknown>;
  const approvalPayload = approvalActivity.payload as Record<string, unknown>;
  assert.strictEqual(inputActivity?.kind, "user-input.requested");
  assert.deepStrictEqual(inputPayload.requestId, "input_1");
  assert.ok(Array.isArray(inputPayload.questions));
  assert.strictEqual(approvalActivity?.kind, "approval.requested");
  assert.deepStrictEqual(approvalPayload.requestId, "approval_1");
  assert.deepStrictEqual(approvalPayload.requestKind, "file-change");
});

it("preserves turn start timing and active turn state from Jarvis events", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    {
      event_id: "ev_started" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "turn.started",
      time: now,
      data: {
        turn_id: "turn_1",
      },
    },
    {
      event_id: "ev_completed" as JarvisSessionEvent["event_id"],
      session_id: session.session_id,
      type: "turn.completed",
      time: "2026-06-30T18:00:02+00:00",
      data: {
        turn_id: "turn_1",
      },
    },
  ];

  const completed = mapJarvisSessionToThreadDetail({
    session: { ...session, status: "completed" },
    run,
    events,
  });
  assert.strictEqual(completed.latestTurn?.startedAt, now);
  assert.strictEqual(completed.latestTurn?.completedAt, "2026-06-30T18:00:02+00:00");
  assert.strictEqual(completed.session?.activeTurnId, null);

  const running = mapJarvisSessionToThreadDetail({
    session,
    run,
    events: [events[0] as JarvisSessionEvent],
  });
  assert.strictEqual(running.latestTurn?.startedAt, now);
  assert.strictEqual(running.session?.activeTurnId, "turn_1");
});

it("uses the same fallback project id for run-less sessions in shell and detail views", () => {
  const session = {
    ...makeSession("sess_orphan"),
    run_id: undefined,
  };

  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    runs: [
      {
        ...run,
        run_id: "run_sess_orphan" as JarvisRun["run_id"],
      },
    ],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });
  const detail = mapJarvisSessionToThreadDetail({ session, events: [] });

  assert.strictEqual(shell.threads[0]?.projectId, "jarvis-run_run_sess_orphan");
  assert.strictEqual(detail.projectId, "jarvis-run_run_sess_orphan");
});

it("projects Jarvis checkpoints into thread checkpoint summaries", () => {
  const session = makeSession("sess_1");
  const checkpoints: ReadonlyArray<JarvisSessionCheckpoint> = [
    {
      session_id: session.session_id,
      checkpoint_id: "ckpt_1",
      label: "Before review",
      provider: "codex",
      restored: false,
      event: {
        turn_id: "turn_1",
        time: "2026-06-30T18:03:00+00:00",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events: [], checkpoints });
  assert.strictEqual(detail.checkpoints[0]?.turnId, "turn_1");
  assert.strictEqual(detail.checkpoints[0]?.checkpointRef, "jarvis:sess_1:ckpt_1");
  assert.strictEqual(detail.checkpoints[0]?.completedAt, "2026-06-30T18:03:00+00:00");
});
