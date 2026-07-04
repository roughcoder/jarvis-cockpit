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
  mapJarvisArchivedRunsSnapshotToShellSnapshot,
  mapJarvisRunsSnapshotToReadModel,
  mapJarvisRunsSnapshotToShellSnapshot,
  mapJarvisSessionToThreadDetail,
} from "./JarvisProjectionMapper.ts";
import {
  jarvisCheckpointIdFromCheckpointRef,
  jarvisCheckpointRefForCheckpoint,
} from "./JarvisIds.ts";

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
  archived_at: null,
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
  authority: "jarvis",
  supported_controls: [
    "turn",
    "input",
    "approval",
    "interrupt",
    "stop",
    "archive",
    "checkpoint_restore",
  ],
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
  archived_at: null,
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
  assert.strictEqual(snapshot.projects[0]?.workspaceRoot, "jarvis://runs/run_1");
  assert.strictEqual(snapshot.threads[1]?.hasPendingApprovals, true);
  assert.strictEqual(snapshot.threads[0]?.worktreePath, null);
});

it("normalizes empty Jarvis repo and branch labels before projection", () => {
  const session = {
    ...makeSession("sess_empty_labels"),
    repo: "",
    branch: "",
  };
  const snapshot = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });
  const detail = mapJarvisSessionToThreadDetail({
    session,
    events: [],
  });

  assert.strictEqual(snapshot.projects[0]?.title, "Session sess_empty_labels");
  assert.strictEqual(snapshot.threads[0]?.branch, null);
  assert.strictEqual(detail.branch, null);
});

it("preserves Jarvis provenance in generated thread ids", () => {
  const threadId = "jarvis-session_sessref_macbook-worker_sess_1";
  assert.strictEqual(isJarvisThreadId(threadId), true);
  assert.strictEqual(jarvisSessionIdFromThreadId(threadId), "sessref_macbook-worker_sess_1");
  assert.strictEqual(isJarvisThreadId("thread_1"), false);
});

it("uses synthetic Jarvis project roots when repo is missing", () => {
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

  assert.strictEqual(mapped.projects[0]?.workspaceRoot, "jarvis://runs/run_1");
});

it("round trips encoded Jarvis checkpoint ids", () => {
  const checkpointRef = jarvisCheckpointRefForCheckpoint(
    "sessref_macbook-worker_sess:1",
    "provider:checkpoint/1",
  );

  assert.strictEqual(
    checkpointRef,
    "jarvis:sessref_macbook-worker_sess%3A1:provider%3Acheckpoint%2F1",
  );
  assert.strictEqual(jarvisCheckpointIdFromCheckpointRef(checkpointRef), "provider:checkpoint/1");
});

it("keeps archived Jarvis sessions out of live threads while preserving active run rows", () => {
  const archivedAt = "2026-07-01T13:00:00+00:00";
  const session = { ...makeSession("sess_archived"), archived_at: archivedAt };
  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [run],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });
  const readModel = mapJarvisRunsSnapshotToReadModel({
    snapshot: {
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_1",
      sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
      runs: [run],
      sessions: [session],
      workers: [],
      artifacts: [],
      generated_at: now,
    },
    eventsBySession: new Map(),
  });
  const detail = mapJarvisSessionToThreadDetail({ session, run, events: [] });

  assert.strictEqual(shell.threads.length, 0);
  assert.strictEqual(shell.projects.length, 1);
  assert.strictEqual(readModel.threads.length, 0);
  assert.strictEqual(readModel.projects.length, 1);
  assert.strictEqual(detail.archivedAt, archivedAt);
});

it("keeps queued Jarvis runs visible before they have sessions", () => {
  const queuedRun = {
    ...run,
    run_id: "run_queued" as JarvisRun["run_id"],
    title: "Queued work",
    session_count: 0,
    active_session_count: 0,
  };
  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [queuedRun],
    sessions: [],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(shell.projects.length, 1);
  assert.strictEqual(shell.projects[0]?.id, "jarvis-run_run_queued");
  assert.strictEqual(shell.threads.length, 0);
});

it("adds a start-work anchor project when Jarvis has workers but no runs yet", () => {
  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_empty",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [],
    sessions: [],
    workers: [
      {
        worker_id: "macbook-worker" as JarvisWorkerSession["worker_id"],
        display_name: "MacBook worker",
        status: "online",
        health: "healthy",
        last_seen_at: now,
        capabilities: ["code.edit"],
        engines: [],
        capacity: {
          max_sessions: 1,
          active_sessions: 0,
          queued_sessions: 0,
        },
        repositories: [],
        public_metadata: {},
      },
    ],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(shell.projects.length, 1);
  assert.strictEqual(shell.projects[0]?.id, "jarvis-start");
  assert.strictEqual(shell.projects[0]?.workspaceRoot, "jarvis://start");
  assert.strictEqual(shell.threads.length, 0);
});

it("keeps the start-work anchor when terminal runs exist", () => {
  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_terminal",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [{ ...run, status: "terminal", repo: "", branch: "", terminal_reason: "Needs repo" }],
    sessions: [],
    workers: [
      {
        worker_id: "macbook-worker" as JarvisWorkerSession["worker_id"],
        display_name: "MacBook worker",
        status: "online",
        health: "healthy",
        last_seen_at: now,
        capabilities: ["code.edit"],
        engines: [],
        capacity: {
          max_sessions: 1,
          active_sessions: 0,
          queued_sessions: 0,
        },
        repositories: [],
        public_metadata: {},
      },
    ],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(shell.projects[0]?.id, "jarvis-start");
  assert.strictEqual(shell.projects[1]?.id, "jarvis-run_run_1");
});

it("moves run-level archived sessions out of live snapshots", () => {
  const archivedRun = { ...run, archived_at: "2026-07-01T13:00:00+00:00" };
  const session = makeSession("sess_run_archived");
  const live = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [archivedRun],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });
  const archived = mapJarvisArchivedRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [archivedRun],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(live.projects.length, 0);
  assert.strictEqual(live.threads.length, 0);
  assert.strictEqual(archived.projects[0]?.id, "jarvis-run_run_1");
  assert.strictEqual(
    archived.threads[0]?.id,
    "jarvis-session_sessref_macbook-worker_sess_run_archived",
  );
  assert.strictEqual(archived.threads[0]?.archivedAt, archivedRun.archived_at);
  assert.strictEqual(
    mapJarvisSessionToThreadDetail({
      session,
      run: archivedRun,
      events: [],
    }).archivedAt,
    archivedRun.archived_at,
  );
});

it("synthesizes project rows for sessions when partial snapshots omit their run", () => {
  const session = makeSession("sess_partial");
  const shell = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [],
    sessions: [session],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(shell.projects[0]?.id, "jarvis-run_run_1");
  assert.strictEqual(shell.projects[0]?.title, "roughcoder/jarvis");
  assert.strictEqual(shell.threads[0]?.projectId, shell.projects[0]?.id);
});

it("keeps run-level pending counts off sibling Jarvis thread shells", () => {
  const snapshot = mapJarvisRunsSnapshotToShellSnapshot({
    api_version: "v1",
    schema_version: 1,
    cursor: "evt_1",
    sync: { mode: "fast", status: "fresh", synced_at: now, errors: [] },
    runs: [{ ...run, pending_input_count: 1, pending_approval_count: 1 }],
    sessions: [
      {
        ...makeSession("sess_1"),
        pending_input_count: 0,
        pending_approval_count: 0,
      },
      makeSession("sess_2", "needs_approval"),
    ],
    workers: [],
    artifacts: [],
    generated_at: now,
  });

  assert.strictEqual(snapshot.threads[0]?.hasPendingApprovals, false);
  assert.strictEqual(snapshot.threads[0]?.hasPendingUserInput, false);
  assert.strictEqual(snapshot.threads[1]?.hasPendingApprovals, true);
});

it("maps known and unknown events into timeline activities", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_1" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "assistant.message",
      occurred_at: "2026-07-01T11:59:59+00:00",
      turn_id: "turn_1",
      message_id: "msg_1",
      data: {
        text: "Done.",
      },
    }),
    makeEvent({
      event_id: "evt_2" as JarvisSessionEvent["event_id"],
      sequence: 3,
      type: "provider.future_event",
      occurred_at: "2026-07-01T12:00:01+00:00",
      data: {
        message: "Future event",
      },
    }),
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      sequence: 1,
      type: "turn.started",
      occurred_at: "2026-07-01T12:00:02+00:00",
      turn_id: "turn_1",
      data: {
        prompt: "Please run verification.",
      },
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages[0]?.role, "user");
  assert.strictEqual(detail.messages[0]?.text, "Please run verification.");
  assert.strictEqual(detail.messages[1]?.text, "Done.");
  assert.strictEqual(detail.activities[0]?.kind, "turn.started");
  assert.strictEqual(detail.activities[2]?.kind, "provider.future_event");
  assert.strictEqual(detail.activities[2]?.tone, "info");
  assert.strictEqual(detail.activities[2]?.summary, "Future event");
});

it("uses echoed client message ids for Jarvis user turn messages", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      type: "turn.started",
      turn_id: "turn_1",
      data: {
        prompt: "Continue.",
        metadata: {
          client_message_id: "msg_client_user",
        },
      },
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });

  assert.strictEqual(detail.messages[0]?.id, "msg_client_user");
  assert.strictEqual(detail.messages[0]?.role, "user");
});

it("coalesces assistant deltas from the same canonical message", () => {
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
  assert.strictEqual(detail.messages.length, 1);
  assert.strictEqual(detail.messages[0]?.id, "jarvis-message:msg_1");
  assert.strictEqual(detail.messages[0]?.text, "Hello");
  assert.strictEqual(detail.messages[0]?.streaming, true);
});

it("coalesces assistant deltas by turn when later chunks omit message ids", () => {
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
      message_id: null,
      data: {
        text: "lo",
      },
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages.length, 1);
  assert.strictEqual(detail.messages[0]?.id, "jarvis-message:msg_1");
  assert.strictEqual(detail.messages[0]?.text, "Hello");
});

it("marks delta-only assistant replies complete when the turn completes", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_delta_1" as JarvisSessionEvent["event_id"],
      type: "assistant.delta",
      turn_id: "turn_1",
      message_id: null,
      data: {
        text: "Done",
      },
    }),
    makeEvent({
      event_id: "evt_completed" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "turn.completed",
      occurred_at: "2026-07-01T12:00:01+00:00",
      turn_id: "turn_1",
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });
  assert.strictEqual(detail.messages.length, 1);
  assert.strictEqual(detail.messages[0]?.text, "Done");
  assert.strictEqual(detail.messages[0]?.streaming, false);
  assert.strictEqual(detail.messages[0]?.updatedAt, "2026-07-01T12:00:01+00:00");
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

it("treats stopped and interrupted Jarvis session events as settled turns", () => {
  const session = makeSession("sess_1", "stopped");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      type: "turn.started",
      turn_id: "turn_1",
    }),
    makeEvent({
      event_id: "evt_stopped" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "session.stopped",
      occurred_at: "2026-07-01T12:00:02+00:00",
      turn_id: null,
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });

  assert.strictEqual(detail.latestTurn?.state, "interrupted");
  assert.strictEqual(detail.latestTurn?.completedAt, "2026-07-01T12:00:02+00:00");
});

it("ignores older session terminal events when a newer Jarvis turn is active", () => {
  const session = makeSession("sess_1", "running");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_started_1" as JarvisSessionEvent["event_id"],
      sequence: 1,
      type: "turn.started",
      turn_id: "turn_1",
    }),
    makeEvent({
      event_id: "evt_stopped" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "session.stopped",
      occurred_at: "2026-07-01T12:00:02+00:00",
      turn_id: null,
    }),
    makeEvent({
      event_id: "evt_started_2" as JarvisSessionEvent["event_id"],
      sequence: 3,
      type: "turn.started",
      occurred_at: "2026-07-01T12:00:03+00:00",
      turn_id: "turn_2",
    }),
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events });

  assert.strictEqual(detail.latestTurn?.turnId, "turn_2");
  assert.strictEqual(detail.latestTurn?.state, "running");
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

it("links Jarvis checkpoints to assistant messages instead of user prompts", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      sequence: 1,
      type: "turn.started",
      turn_id: "turn_1",
      data: {
        prompt: "Please implement the change.",
      },
    }),
    makeEvent({
      event_id: "evt_assistant" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "assistant.message",
      turn_id: "turn_1",
      message_id: "message_1",
      data: {
        text: "Implemented.",
      },
    }),
  ];
  const checkpoints: ReadonlyArray<JarvisSessionCheckpoint> = [
    {
      session_ref: session.session_ref,
      checkpoint_id: "ckpt_1",
      label: "After implementation",
      provider: "codex",
      restored: false,
      event: {
        turn_id: "turn_1",
        occurred_at: "2026-07-01T12:03:00+00:00",
      },
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events, checkpoints });

  assert.strictEqual(detail.messages[0]?.role, "user");
  assert.strictEqual(detail.messages[1]?.role, "assistant");
  assert.strictEqual(detail.checkpoints[0]?.assistantMessageId, detail.messages[1]?.id);
});

it("links checkpoint wrappers to turns from canonical checkpoint events", () => {
  const session = makeSession("sess_1");
  const events: ReadonlyArray<JarvisSessionEvent> = [
    makeEvent({
      event_id: "evt_started" as JarvisSessionEvent["event_id"],
      sequence: 1,
      type: "turn.started",
      turn_id: "turn_1",
      data: {
        prompt: "Please implement the change.",
      },
    }),
    makeEvent({
      event_id: "evt_assistant" as JarvisSessionEvent["event_id"],
      sequence: 2,
      type: "assistant.message",
      turn_id: "turn_1",
      message_id: "message_1",
      data: {
        text: "Implemented.",
      },
    }),
    makeEvent({
      event_id: "evt_checkpoint" as JarvisSessionEvent["event_id"],
      sequence: 3,
      type: "checkpoint.created",
      turn_id: "turn_1",
      data: {
        checkpoint_id: "ckpt_1",
      },
    }),
  ];
  const checkpoints: ReadonlyArray<JarvisSessionCheckpoint> = [
    {
      session_ref: session.session_ref,
      checkpoint_id: "ckpt_1",
      label: "After implementation",
      provider: "codex",
      restored: false,
      event: {},
    },
  ];

  const detail = mapJarvisSessionToThreadDetail({ session, run, events, checkpoints });

  assert.strictEqual(detail.checkpoints[0]?.turnId, "turn_1");
  assert.strictEqual(detail.checkpoints[0]?.assistantMessageId, detail.messages[1]?.id);
});
