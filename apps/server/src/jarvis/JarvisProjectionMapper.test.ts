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

const now = "2026-07-01T12:00:00+00:00";

const run: JarvisRun = {
  run_id: "run_1" as JarvisRun["run_id"],
  title: "Build worker sessions",
  objective: "Expose live worker sessions",
  status: "running",
  phase: "implementing",
  repo: "roughcoder/jarvis",
  branch: "feature/sessions",
  session_count: 2,
  active_session_count: 1,
  pending_input_count: 0,
  pending_approval_count: 1,
  artifact_count: 0,
  primary_artifact_ids: [],
  latest_activity_at: now,
  latest_cursor: "evt_1",
  created_at: now,
  updated_at: now,
  terminal_reason: null,
  metadata: {},
};

const makeSession = (
  id: string,
  status: JarvisWorkerSession["status"] = "running",
): JarvisWorkerSession => ({
  session_ref: `sessref_macbook-worker_${id}` as JarvisWorkerSession["session_ref"],
  worker_id: "macbook-worker" as JarvisWorkerSession["worker_id"],
  session_id: id as JarvisWorkerSession["session_id"],
  run_id: run.run_id,
  title: `Session ${id}`,
  provider: "codex",
  engine: "codex",
  status,
  repo: run.repo,
  branch: run.branch,
  cwd_label: "jarvis",
  latest_event_cursor: "evt_1",
  pending_input_count: status === "needs_input" ? 1 : 0,
  pending_approval_count: status === "needs_approval" ? 1 : 0,
  checkpoint_count: 0,
  created_at: now,
  updated_at: now,
  metadata: {},
});

const makeEvent = (
  input: Partial<JarvisSessionEvent> & Pick<JarvisSessionEvent, "event_id" | "type">,
): JarvisSessionEvent => ({
  sequence: 1,
  session_ref: "sessref_macbook-worker_sess_1" as JarvisSessionEvent["session_ref"],
  run_id: run.run_id,
  occurred_at: now,
  turn_id: null,
  message_id: null,
  data: {},
  ...input,
});

it("maps one Jarvis run with two sessions into one project and two thread shells", () => {
  const snapshot = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [run],
    sessions: [makeSession("sess_1"), makeSession("sess_2", "needs_approval")],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(snapshot.projects.length, 1);
  assert.strictEqual(snapshot.threads.length, 2);
  assert.strictEqual(snapshot.projects[0]?.id, "jarvis-run_run_1");
  assert.strictEqual(snapshot.projects[0]?.workspaceRoot, "roughcoder/jarvis");
  assert.strictEqual(snapshot.threads[1]?.hasPendingApprovals, true);
});

it("preserves Jarvis provenance in generated thread ids", () => {
  const threadId = "jarvis-session_sessref_macbook-worker_sess_1";
  assert.strictEqual(isJarvisThreadId(threadId), true);
  assert.strictEqual(jarvisSessionIdFromThreadId(threadId), "sessref_macbook-worker_sess_1");
  assert.strictEqual(isJarvisThreadId("thread_1"), false);
});

it("uses deterministic public workspace labels when repo is missing", () => {
  const mapped = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [
      {
        ...run,
        repo: null,
      },
    ],
    sessions: [{ ...makeSession("sess_1"), cwd_label: "jarvis", repo: null }],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(mapped.projects[0]?.workspaceRoot, "jarvis");
});

it("maps known and unknown events into timeline activities", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_1" as JarvisSessionEvent["event_id"],
      type: "assistant.message",
      turn_id: "turn_1",
      message_id: "msg_1",
      data: {
        text: "Done.",
      },
    }),
    makeEvent({
      event_id: "evt_2" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "provider.future_event",
      occurred_at: "2026-07-01T12:00:01+00:00",
      data: {
        message: "Future event",
      },
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages[0]?.text, "Done.");
  assert.strictEqual(detail.activities[1]?.kind, "provider.future_event");
  assert.strictEqual(detail.activities[1]?.tone, "info");
  assert.strictEqual(detail.activities[1]?.summary, "Future event");
});

it("uses a stable assistant message id for deltas from the same canonical message", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_delta_1" as JarvisSessionEvent["event_id"],
      type: "assistant.delta",
      turn_id: "turn_1",
      message_id: "msg_1",
      data: {
        text: "Hel",
      },
    }),
    makeEvent({
      event_id: "evt_delta_2" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "assistant.delta",
      occurred_at: "2026-07-01T12:00:01+00:00",
      turn_id: "turn_1",
      message_id: "msg_1",
      data: {
        text: "lo",
      },
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages.length, 2);
  assert.strictEqual(detail.messages[0]?.id, detail.messages[1]?.id);
});

it("normalizes Jarvis input and approval request activities for T3 derivations", () => {
  const session = makeSession("sess_1", "needs_input");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_input" as JarvisSessionEvent["event_id"],
      type: "input.requested",
      turn_id: "turn_1",
      data: {
        request_id: "input_1",
        prompt: "Which worker should continue?",
      },
    }),
    makeEvent({
      event_id: "evt_approval" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "approval.requested",
      occurred_at: "2026-07-01T12:00:01+00:00",
      turn_id: "turn_1",
      data: {
        request_id: "approval_1",
        request_type: "file_change_approval",
        summary: "Approve file edits",
      },
    }),
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
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      type: "turn.started",
      turn_id: "turn_1",
    }),
    makeEvent({
      event_id: "evt_completed" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "turn.completed",
      occurred_at: "2026-07-01T12:00:02+00:00",
      turn_id: "turn_1",
    }),
  ];

  const completed = mapJarvisSessionToThreadDetail({
    session: { ...session, status: "completed" },
    run,
    events,
  });
  assert.strictEqual(completed.latestTurn?.startedAt, now);
  assert.strictEqual(completed.latestTurn?.completedAt, "2026-07-01T12:00:02+00:00");
  assert.strictEqual(completed.session?.activeTurnId, null);

  const running = mapJarvisSessionToThreadDetail({
    session,
    run,
    events: [events[0] as JarvisSessionEvent],
  });
  assert.strictEqual(running.latestTurn?.startedAt, now);
  assert.strictEqual(running.session?.activeTurnId, "turn_1");
});

it("projects Jarvis checkpoints into thread checkpoint summaries", () => {
  const session = makeSession("sess_1");
  const checkpoints: ReadonlyArray<JarvisSessionCheckpoint> = [
    {
      session_ref: session.session_ref,
      checkpoint_id: "ckpt_1",
      label: "Before review",
      provider: "codex",
      restored: false,
      event: {
        turn_id: "turn_1",
        occurred_at: "2026-07-01T12:03:00+00:00",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events: [], checkpoints });
  assert.strictEqual(detail.checkpoints[0]?.turnId, "turn_1");
  assert.strictEqual(
    detail.checkpoints[0]?.checkpointRef,
    "jarvis:sessref_macbook-worker_sess_1:ckpt_1",
  );
  assert.strictEqual(detail.checkpoints[0]?.completedAt, "2026-07-01T12:03:00+00:00");
});
