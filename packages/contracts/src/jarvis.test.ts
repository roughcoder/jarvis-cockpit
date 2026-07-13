import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  JarvisApprovalInput,
  JarvisArchiveInput,
  JarvisCockpitCatalog,
  JarvisCockpitEvent,
  JarvisControlResult,
  JarvisDeleteInput,
  JarvisLifecycleResult,
  JarvisProjectThreadDetailResponse,
  JarvisProjectThreadControlResponse,
  JarvisProjectThreadsResponse,
  JarvisProjectThreadTurnInput,
  JarvisRestoreCheckpointInput,
  JarvisRunsSnapshot,
  JarvisSessionCheckpointsResponse,
  JarvisSessionCheckpointsPage,
  JarvisSessionDetailResponse,
  JarvisSessionEvent,
  JarvisSessionEventsPage,
  JarvisSessionRequestsResponse,
  JarvisSessionRequestsPage,
  JarvisStartWorkInput,
  JarvisStartWorkValidationResult,
  JarvisTurnInput,
  JarvisUserInputInput,
} from "./jarvis.ts";

const decodeCatalog = Schema.decodeUnknownEffect(JarvisCockpitCatalog);
const decodeSnapshot = Schema.decodeUnknownEffect(JarvisRunsSnapshot);
const decodeEvent = Schema.decodeUnknownEffect(JarvisSessionEvent);
const decodeEventsPage = Schema.decodeUnknownEffect(JarvisSessionEventsPage);
const decodeRequestsPage = Schema.decodeUnknownEffect(JarvisSessionRequestsPage);
const decodeCheckpointsPage = Schema.decodeUnknownEffect(JarvisSessionCheckpointsPage);
const decodeSessionDetail = Schema.decodeUnknownEffect(JarvisSessionDetailResponse);
const decodeRequestsResponse = Schema.decodeUnknownEffect(JarvisSessionRequestsResponse);
const decodeCheckpointsResponse = Schema.decodeUnknownEffect(JarvisSessionCheckpointsResponse);
const decodeStartWork = Schema.decodeUnknownEffect(JarvisStartWorkInput);
const decodeStartWorkValidation = Schema.decodeUnknownEffect(JarvisStartWorkValidationResult);
const decodeTurn = Schema.decodeUnknownEffect(JarvisTurnInput);
const decodeApproval = Schema.decodeUnknownEffect(JarvisApprovalInput);
const decodeUserInput = Schema.decodeUnknownEffect(JarvisUserInputInput);
const decodeRestoreCheckpoint = Schema.decodeUnknownEffect(JarvisRestoreCheckpointInput);
const decodeArchive = Schema.decodeUnknownEffect(JarvisArchiveInput);
const decodeDelete = Schema.decodeUnknownEffect(JarvisDeleteInput);
const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeLifecycleResult = Schema.decodeUnknownEffect(JarvisLifecycleResult);
const decodeSseEvent = Schema.decodeUnknownEffect(JarvisCockpitEvent);
const decodeProjectThreadDetail = Schema.decodeUnknownEffect(JarvisProjectThreadDetailResponse);
const decodeProjectThreads = Schema.decodeUnknownEffect(JarvisProjectThreadsResponse);
const decodeProjectThreadTurn = Schema.decodeUnknownEffect(JarvisProjectThreadTurnInput);
const decodeProjectThreadControl = Schema.decodeUnknownEffect(JarvisProjectThreadControlResponse);
const encodeProjectThreadDetail = Schema.encodeEffect(JarvisProjectThreadDetailResponse);
const encodeProjectThreadTurn = Schema.encodeEffect(JarvisProjectThreadTurnInput);

const generatedAt = "2026-07-01T12:00:00+00:00";
const sessionRef = "sessref_macbook-worker_sess_123";
const runId = "run_123";

const sessionFixture = {
  session_ref: sessionRef,
  worker_id: "macbook-worker",
  session_id: "sess_123",
  run_id: runId,
  project_id: "jarvis",
  parent_chat_id: "review_thread_42",
  model: "gpt-5.5",
  title: "Codex implementation",
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
  status: "running",
  repo: "roughcoder/jarvis",
  branch: "jarvis/eng-42-worker-heartbeat",
  cwd_label: "jarvis",
  latest_event_cursor: "evt_123",
  pending_input_count: 0,
  pending_approval_count: 1,
  checkpoint_count: 2,
  created_at: generatedAt,
  updated_at: generatedAt,
  archived_at: null,
};

const eventFixture = {
  event_id: "evt_124",
  sequence: 2,
  session_ref: sessionRef,
  run_id: runId,
  type: "turn.started",
  occurred_at: "2026-07-01T12:00:01+00:00",
  turn_id: "turn_1",
  message_id: null,
  data: {
    prompt: "Continue from the current diff and run the tests.",
    provider_payload: {
      provider_specific: true,
    },
  },
};

it.effect("decodes a Jarvis cockpit catalog fixture", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeCatalog({
      api_version: "v1",
      schema_version: 1,
      engines: [
        {
          engine: "codex",
          display_name: "Codex",
          description: "OpenAI Codex provider session",
          supports: {
            streaming: true,
            resume: true,
            interrupt: true,
            approval_requests: true,
            input_requests: true,
            checkpoints: true,
            attachments: true,
          },
        },
      ],
      capabilities: [
        {
          capability: "code.edit",
          display_name: "Edit code",
          maps_to: ["worker.session.create", "worker.session.turn"],
        },
      ],
      work_sources: ["manual", "github", "linear", "voice", "whatsapp"],
      engine_strategies: ["single", "parallel", "review_panel"],
      branch_strategies: ["auto", "use_existing", "create", "none"],
      landing_policies: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
      request_kinds: ["approval", "input"],
      start_options: {
        sources: ["manual", "github", "linear"],
        engines: ["codex", "claude"],
        engine_strategies: ["single", "parallel"],
        landing_modes: ["branch_only", "draft_pr", "ready_pr", "confirm_before_pr"],
        required_fields: {
          manual: ["phrase or work_item.title", "repo (unless a default repo is configured)"],
          github: ["repo (unless a default repo is configured)"],
          linear: [],
        },
        defaults: {
          source: "manual",
          worker_id: "macbook-worker",
          repo: "roughcoder/jarvis",
          engine: "codex",
          engine_strategy: "single",
          landing_mode: "draft_pr",
        },
      },
    });

    assert.strictEqual(parsed.api_version, "v1");
    assert.strictEqual(parsed.engines[0]?.engine, "codex");
    assert.strictEqual(parsed.engines[0]?.supports.attachments, true);
    assert.strictEqual(parsed.capabilities[0]?.capability, "code.edit");
    assert.deepStrictEqual(parsed.work_sources, [
      "manual",
      "github",
      "linear",
      "voice",
      "whatsapp",
    ]);
    assert.strictEqual(parsed.start_options?.defaults.repo, "roughcoder/jarvis");
    assert.deepStrictEqual(parsed.start_options?.engines, ["codex", "claude"]);
  }),
);

it.effect("defaults optional Jarvis catalog option groups omitted by live v1 servers", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeCatalog({
      api_version: "v1",
      schema_version: 1,
      engines: [],
      capabilities: [],
      work_sources: ["manual", "github", "linear"],
      engine_strategies: ["single", "parallel"],
      request_kinds: ["approval", "input"],
    });

    assert.deepStrictEqual(parsed.branch_strategies, []);
    assert.deepStrictEqual(parsed.landing_policies, []);
  }),
);

it.effect("decodes project conversation detail with archived state and history", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_1",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_1",
        title: "Planning",
        created_at: generatedAt,
        updated_at: generatedAt,
        created_by: "neil",
        archived_at: "2026-07-06T10:00:00+00:00",
        archived_by: "neil",
        archive_reason: "superseded",
        messages: [
          {
            role: "user",
            peer_id: "neil",
            content: "What next?",
            observed_at: "2026-07-06T10:01:00+00:00",
          },
          {
            role: "assistant",
            peer_id: "jarvis",
            content: "Continue Phase 5.",
            observed_at: "2026-07-06T10:02:00+00:00",
          },
        ],
      },
    });

    assert.strictEqual(parsed.thread.archived_by, "neil");
    assert.strictEqual(parsed.thread.messages[0]?.role, "user");
    assert.strictEqual(parsed.thread.messages[1]?.content, "Continue Phase 5.");
    assert.strictEqual(parsed.thread.workspace, undefined);
  }),
);

it.effect("decodes additive project conversation execution state", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_active",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_active",
        title: "Active review",
        created_at: generatedAt,
        updated_at: generatedAt,
        execution: {
          available: true,
          status: "waiting_approval",
          active_turn: {
            turn_id: "turn_active",
            status: "waiting_approval",
            started_at: generatedAt,
          },
          pending_requests: [
            {
              request_id: "approval_turn_active",
              kind: "approval",
              status: "pending",
              title: "Approve action",
              detail: "Run verification",
              created_at: generatedAt,
              request_kind: "command",
              questions: [],
            },
          ],
          supported_controls: ["turn", "approval", "interrupt"],
          supports: { steer: false, queue: false },
          diagnostic: null,
        },
        messages: [],
      },
    });

    assert.deepStrictEqual(parsed.thread.execution?.active_turn, {
      turn_id: "turn_active",
      status: "waiting_approval",
      started_at: generatedAt,
    });
    assert.strictEqual(parsed.thread.execution?.pending_requests[0]?.kind, "approval");
    assert.deepStrictEqual(parsed.thread.execution?.supported_controls, [
      "turn",
      "approval",
      "interrupt",
    ]);
    assert.deepStrictEqual(parsed.thread.execution?.supports, { steer: false, queue: false });
  }),
);

it.effect("decodes the bounded public project conversation turn queue", () =>
  Effect.gen(function* () {
    const thread = {
      thread_id: "thread_queued",
      project_id: "jarvis",
      session_id: "project:jarvis:orchestrator:thread_queued",
      title: "Queued work",
      created_at: generatedAt,
      updated_at: generatedAt,
      messages: [],
    };
    const parsed = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        ...thread,
        queued_turns: [
          {
            queue_id: "queuedturn_1",
            text: "Run the focused tests.",
            queued_at: generatedAt,
            status: "queued",
          },
          {
            queue_id: "queuedturn_2",
            text: "Then summarize the result.",
            queued_at: generatedAt,
            status: "claimed",
          },
        ],
      },
    });

    assert.deepStrictEqual(parsed.thread.queued_turns, [
      {
        queue_id: "queuedturn_1",
        text: "Run the focused tests.",
        queued_at: generatedAt,
        status: "queued",
      },
      {
        queue_id: "queuedturn_2",
        text: "Then summarize the result.",
        queued_at: generatedAt,
        status: "claimed",
      },
    ]);

    yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        ...thread,
        queued_turns: Array.from({ length: 33 }, (_, index) => ({
          queue_id: `queuedturn_${index}`,
          text: `Queued turn ${index}`,
          queued_at: generatedAt,
          status: "queued",
        })),
      },
    }).pipe(Effect.flip);
  }),
);

it.effect("decodes and encodes escalated project conversation workspace projections", () =>
  Effect.gen(function* () {
    const payload = {
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_1",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_1",
        title: "Planning",
        created_at: generatedAt,
        updated_at: generatedAt,
        created_by: "neil",
        workspace: {
          worker_id: "macbook-worker",
          session_id: "conv_thread_1",
          engine: "codex",
          workspace_id: "jarvis-thread-1",
          root_label: "jarvis-thread-1",
          cwd_label: "jarvis-thread-1",
          status: "ready",
          provision_phase: "running",
          worktrees: [
            {
              name: "runtime",
              repo: "roughcoder/jarvis",
              path_label: "runtime",
              branch: "jarvis/jarvis-thread-runtime",
              base_ref: "origin/main",
              status: "ready",
              provision_phase: "running",
            },
          ],
        },
        messages: [],
      },
    };

    const parsed = yield* decodeProjectThreadDetail(payload);
    const encoded = yield* encodeProjectThreadDetail(parsed);

    assert.strictEqual(parsed.thread.workspace?.engine, "codex");
    assert.strictEqual(parsed.thread.workspace?.worktrees[0]?.base_ref, "origin/main");
    assert.deepStrictEqual(encoded.thread.workspace, payload.thread.workspace);
  }),
);

it.effect("decodes unknown project conversation workspace status strings", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_1",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_1",
        title: "Planning",
        created_at: generatedAt,
        updated_at: generatedAt,
        workspace: {
          status: "warming-cache",
          provision_phase: "allocating-scratch-disk",
          worktrees: [
            {
              name: "runtime",
              status: "mounting-index",
              provision_phase: "hydrating-lfs",
            },
          ],
        },
        messages: [],
      },
    });

    assert.strictEqual(parsed.thread.workspace?.status, "warming-cache");
    assert.strictEqual(parsed.thread.workspace?.provision_phase, "allocating-scratch-disk");
    assert.strictEqual(parsed.thread.workspace?.worktrees[0]?.status, "mounting-index");
    assert.strictEqual(parsed.thread.workspace?.worktrees[0]?.provision_phase, "hydrating-lfs");

    const withoutWorktrees = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_2",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_2",
        title: "Planning",
        created_at: generatedAt,
        updated_at: generatedAt,
        workspace: {
          status: "ready",
        },
        messages: [],
      },
    });

    assert.deepStrictEqual(withoutWorktrees.thread.workspace?.worktrees, []);
  }),
);

it.effect("decodes a Jarvis cockpit snapshot fixture", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_123",
      generated_at: generatedAt,
      sync: {
        mode: "probe",
        status: "fresh",
        synced_at: generatedAt,
        errors: [],
      },
      runs: [
        {
          run_id: runId,
          title: "Worker heartbeat",
          objective: "Add worker heartbeat status",
          status: "running",
          phase: "implementing",
          repo: "roughcoder/jarvis",
          branch: "jarvis/eng-42-worker-heartbeat",
          session_count: 1,
          active_session_count: 1,
          pending_input_count: 0,
          pending_approval_count: 1,
          artifact_count: 1,
          primary_artifact_ids: ["artifact_branch_1"],
          latest_activity_at: generatedAt,
          latest_cursor: "evt_123",
          created_at: generatedAt,
          updated_at: generatedAt,
          archived_at: null,
          terminal_reason: null,
        },
      ],
      sessions: [sessionFixture],
      workers: [
        {
          worker_id: "macbook-worker",
          display_name: "MacBook Pro",
          status: "online",
          health: "healthy",
          last_seen_at: generatedAt,
          capabilities: ["code.edit", "shell.run"],
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
            active_sessions: 1,
            queued_sessions: 0,
          },
          repositories: [
            {
              repo: "roughcoder/jarvis",
              status: "ready",
              default_branch: "",
              is_default: true,
              can_start_work: true,
            },
          ],
          system: {
            hostname: "Neils-Mac-mini",
            platform: "darwin",
            arch: "arm64",
            memory_used_percent: 72.9,
          },
          public_metadata: {},
        },
      ],
      artifacts: [
        {
          artifact_id: "artifact_branch_1",
          run_id: runId,
          session_ref: sessionRef,
          kind: "branch",
          title: "jarvis/eng-42-worker-heartbeat",
          status: "ready",
          url: "https://github.com/roughcoder/jarvis/tree/jarvis/eng-42-worker-heartbeat",
          branch: "jarvis/eng-42-worker-heartbeat",
          created_at: generatedAt,
          updated_at: generatedAt,
        },
      ],
      requests: [
        {
          request_id: "approval_turn_1",
          session_ref: sessionRef,
          run_id: runId,
          kind: "approval",
          status: "pending",
          title: "Approve shell command",
          detail: "Run verification",
          created_at: generatedAt,
          payload: {
            request_kind: "command",
          },
        },
      ],
      checkpoints: [
        {
          session_ref: sessionRef,
          checkpoint_id: "ckpt_turn_1",
          label: "before review fixes",
          provider: "codex",
          restored: false,
        },
      ],
    });

    assert.strictEqual(parsed.runs[0]?.pending_approval_count, 1);
    assert.strictEqual(parsed.sessions[0]?.session_ref, sessionRef);
    assert.strictEqual(parsed.sessions[0]?.project_id, "jarvis");
    assert.strictEqual(parsed.sessions[0]?.parent_chat_id, "review_thread_42");
    assert.strictEqual(parsed.sessions[0]?.model, "gpt-5.5");
    assert.strictEqual(parsed.workers[0]?.engines[0]?.supports.resume, true);
    const worker = parsed.workers[0];
    assert.ok(worker);
    assert.strictEqual(worker.repositories?.at(0)?.repo, "roughcoder/jarvis");
    assert.strictEqual(worker.repositories?.at(0)?.default_branch, "");
    assert.strictEqual(worker.repositories?.at(0)?.is_default, true);
    assert.strictEqual(worker.repositories?.at(0)?.can_start_work, true);
    assert.strictEqual(worker.system?.hostname, "Neils-Mac-mini");
    assert.strictEqual(parsed.artifacts[0]?.kind, "branch");
    assert.strictEqual(parsed.requests?.[0]?.kind, "approval");
    assert.strictEqual(parsed.checkpoints?.[0]?.checkpoint_id, "ckpt_turn_1");
  }),
);

it.effect("retains worker-local sessions that are not linked to a run", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_worker_local",
      generated_at: generatedAt,
      sync: {
        mode: "fast",
        status: "fresh",
        synced_at: generatedAt,
        errors: [],
      },
      runs: [],
      sessions: [{ ...sessionFixture, run_id: null }],
      workers: [],
      artifacts: [],
    });

    assert.strictEqual(parsed.sessions.length, 1);
    assert.strictEqual(parsed.sessions[0]?.run_id, null);
  }),
);

it.effect("accepts live Jarvis terminal run snapshots with absent repo and branch labels", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_terminal",
      generated_at: generatedAt,
      sync: {
        mode: "fast",
        status: "fresh",
        synced_at: generatedAt,
        errors: [],
      },
      runs: [
        {
          authority: "jarvis",
          supported_controls: ["archive"],
          run_id: runId,
          title: "Orchestration smoke test",
          objective: "Verify worker dispatch",
          status: "terminal",
          phase: "needs_human",
          repo: "",
          branch: "",
          session_count: 0,
          active_session_count: 0,
          pending_input_count: 0,
          pending_approval_count: 0,
          artifact_count: 0,
          primary_artifact_ids: [],
          latest_activity_at: generatedAt,
          latest_cursor: "evt_terminal",
          created_at: generatedAt,
          updated_at: generatedAt,
          archived_at: null,
          terminal_reason: "Worker dispatch failed",
        },
      ],
      sessions: [],
      workers: [],
      artifacts: [],
    });

    assert.strictEqual(parsed.runs[0]?.status, "terminal");
    assert.strictEqual(parsed.runs[0]?.repo, "");
    assert.strictEqual(parsed.runs[0]?.branch, "");
  }),
);

it.effect("accepts live Jarvis active run snapshots with lightweight branch artifacts", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_active",
      generated_at: generatedAt,
      sync: {
        mode: "probe",
        status: "fresh",
        synced_at: generatedAt,
        errors: [],
      },
      runs: [
        {
          authority: "jarvis",
          supported_controls: ["archive"],
          run_id: runId,
          title: "Dogfood UI fleet Codex smoke test",
          objective: "Dogfood UI fleet Codex smoke test",
          status: "active",
          phase: "running",
          repo: "roughcoder/jarvis-cockpit",
          branch: "jarvis/dogfood",
          session_count: 1,
          active_session_count: 1,
          pending_input_count: 0,
          pending_approval_count: 0,
          artifact_count: 1,
          primary_artifact_ids: ["artifact_branch_1"],
          latest_activity_at: generatedAt,
          latest_cursor: "evt_active",
          created_at: generatedAt,
          updated_at: generatedAt,
          archived_at: null,
          terminal_reason: null,
        },
      ],
      sessions: [],
      workers: [],
      artifacts: [
        {
          artifact_id: "artifact_branch_1",
          run_id: runId,
          session_ref: sessionRef,
          kind: "branch",
          provider: "git",
          external_id: "jarvis/dogfood",
          is_primary: true,
          visibility: "public-safe",
          title: "jarvis/dogfood",
          status: "running",
          summary: "",
          url: "",
          branch: "jarvis/dogfood",
          commit_sha: "",
          created_at: generatedAt,
          updated_at: generatedAt,
          metadata: {},
        },
      ],
    });

    assert.strictEqual(parsed.runs[0]?.status, "active");
    assert.strictEqual(parsed.artifacts[0]?.summary, "");
    assert.strictEqual(parsed.artifacts[0]?.url, "");
    assert.strictEqual(parsed.artifacts[0]?.commit_sha, "");
  }),
);

it.effect("accepts current Jarvis snapshot edge-state literals", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_empty",
      generated_at: generatedAt,
      sync: {
        mode: "none",
        status: "stale",
        synced_at: null,
        errors: [],
      },
      runs: [
        {
          authority: "jarvis",
          supported_controls: ["archive"],
          run_id: runId,
          title: "Completed dogfood",
          objective: null,
          status: "completed",
          phase: null,
          repo: "roughcoder/jarvis-cockpit",
          branch: "jarvis/dogfood",
          session_count: 1,
          active_session_count: 0,
          pending_input_count: 0,
          pending_approval_count: 0,
          artifact_count: 0,
          primary_artifact_ids: [],
          latest_activity_at: generatedAt,
          latest_cursor: "",
          created_at: generatedAt,
          updated_at: generatedAt,
          archived_at: null,
          terminal_reason: null,
        },
      ],
      sessions: [
        {
          ...sessionFixture,
          status: "completed",
          latest_event_cursor: "",
          pending_approval_count: 0,
        },
      ],
      workers: [
        {
          worker_id: "offline-worker",
          display_name: "Offline worker",
          status: "offline",
          health: "unknown",
          last_seen_at: null,
          capabilities: [],
          engines: [],
          capacity: {
            max_sessions: 1,
            active_sessions: 0,
            queued_sessions: 0,
          },
          public_metadata: {},
        },
      ],
      artifacts: [],
    });

    assert.strictEqual(parsed.sync.status, "stale");
    assert.strictEqual(parsed.runs[0]?.latest_cursor, "");
    assert.strictEqual(parsed.sessions[0]?.latest_event_cursor, "");
    assert.strictEqual(parsed.workers[0]?.health, "unknown");
  }),
);

it.effect("rejects obsolete pre-merge Jarvis snapshot literals", () =>
  Effect.gen(function* () {
    yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_empty",
      generated_at: generatedAt,
      sync: {
        mode: "none",
        status: "skipped",
        synced_at: null,
        errors: [],
      },
      runs: [],
      sessions: [],
      workers: [],
      artifacts: [],
    }).pipe(Effect.flip);

    yield* decodeSnapshot({
      api_version: "v1",
      schema_version: 1,
      cursor: "evt_empty",
      generated_at: generatedAt,
      sync: {
        mode: "none",
        status: "stale",
        synced_at: null,
        errors: [],
      },
      runs: [],
      sessions: [],
      workers: [
        {
          worker_id: "offline-worker",
          display_name: "Offline worker",
          status: "offline",
          health: "unreachable",
          last_seen_at: null,
          capabilities: [],
          engines: [],
          capacity: {
            max_sessions: 1,
            active_sessions: 0,
            queued_sessions: 0,
          },
          public_metadata: {},
        },
      ],
      artifacts: [],
    }).pipe(Effect.flip);
  }),
);

it.effect("keeps provider payloads opaque inside event data", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvent(eventFixture);
    assert.deepStrictEqual(parsed.data.provider_payload, {
      provider_specific: true,
    });
  }),
);

it.effect("accepts unknown event types when the envelope is valid", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvent({
      ...eventFixture,
      type: "provider.future_event",
      data: {
        message: "future provider event",
      },
    });

    assert.strictEqual(parsed.type, "provider.future_event");
  }),
);

it.effect("accepts empty provider correlation ids on session events", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvent({
      ...eventFixture,
      type: "session.created",
      turn_id: "",
      message_id: "",
    });

    assert.strictEqual(parsed.turn_id, "");
    assert.strictEqual(parsed.message_id, "");
  }),
);

it.effect("rejects malformed event envelopes", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeEvent({
        ...eventFixture,
        event_id: "   ",
      }),
    );

    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("decodes paginated session events, requests, and checkpoints", () =>
  Effect.gen(function* () {
    const events = yield* decodeEventsPage({
      items: [
        eventFixture,
        {
          ...eventFixture,
          event_id: "evt_125",
          sequence: 3,
          type: "assistant.message",
          message_id: "message_1",
          data: {
            text: "Done.",
          },
        },
      ],
      cursor: "evt_125",
      has_more: false,
    });
    const requests = yield* decodeRequestsPage({
      items: [
        {
          request_id: "approval_turn_1",
          session_ref: sessionRef,
          run_id: runId,
          kind: "approval",
          status: "pending",
          title: "Approve shell command",
          detail: "Run verification",
          created_at: generatedAt,
          payload: {
            request_kind: "command",
          },
        },
      ],
      cursor: "evt_126",
      has_more: false,
    });
    const checkpoints = yield* decodeCheckpointsPage({
      items: [
        {
          session_ref: sessionRef,
          checkpoint_id: "ckpt_turn_1",
          label: "before review fixes",
          provider: "codex",
          restored: false,
          event: {
            type: "checkpoint.created",
            checkpoint_id: "ckpt_turn_1",
          },
        },
      ],
      cursor: "evt_127",
      has_more: false,
    });

    assert.strictEqual(events.items.length, 2);
    assert.strictEqual(requests.items[0]?.kind, "approval");
    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "ckpt_turn_1");
  }),
);

it.effect("decodes Jarvis session detail, requests, and checkpoints wire wrappers", () =>
  Effect.gen(function* () {
    const detail = yield* decodeSessionDetail({
      session: sessionFixture,
      raw: {
        session_id: "sess_123",
      },
    });
    const requests = yield* decodeRequestsResponse({
      requests: [
        {
          request_id: "approval_turn_1",
          session_ref: sessionRef,
          run_id: runId,
          kind: "approval",
          status: "pending",
          title: "Approve shell command",
          detail: "Run verification",
          created_at: generatedAt,
          payload: {
            request_kind: "command",
          },
        },
      ],
    });
    const checkpoints = yield* decodeCheckpointsResponse({
      checkpoints: [
        {
          session_ref: sessionRef,
          checkpoint_id: "ckpt_turn_1",
          label: "before review fixes",
          provider: "codex",
          restored: false,
        },
      ],
    });

    assert.strictEqual(detail.session.session_ref, sessionRef);
    assert.strictEqual(requests.requests[0]?.kind, "approval");
    assert.deepStrictEqual(checkpoints.checkpoints[0]?.event, {});
  }),
);

it.effect("decodes command inputs with cockpit metadata defaults", () =>
  Effect.gen(function* () {
    const start = yield* decodeStartWork({
      phrase: "next Linear ticket",
      source: "linear",
      repo: "roughcoder/jarvis",
      worker_id: "macbook-worker",
      engine: "codex",
      engine_strategy: "single",
      start: true,
    });
    const turn = yield* decodeTurn({
      prompt: "Continue from the current diff.",
    });
    const approval = yield* decodeApproval({
      request_id: "approval_1",
      decision: "approved",
      scope: "shell",
    });
    const input = yield* decodeUserInput({
      request_id: "input_1",
      text: "Use the existing orchestration store patterns.",
    });
    const deniedApproval = yield* decodeApproval({
      request_id: "approval_2",
      decision: "denied",
    });
    const restore = yield* decodeRestoreCheckpoint({
      checkpoint_id: "ckpt_turn_1",
    });
    const archive = yield* decodeArchive({
      idempotency_key: "cmd_archive",
    });

    assert.strictEqual(start.branch_strategy, "auto");
    assert.strictEqual(start.metadata?.surface, "jarvis-cockpit");
    assert.strictEqual(turn.metadata?.surface, "jarvis-cockpit");
    assert.strictEqual(approval.decision, "approved");
    assert.strictEqual(deniedApproval.decision, "denied");
    assert.strictEqual(input.text, "Use the existing orchestration store patterns.");
    assert.strictEqual(restore.metadata?.surface, "jarvis-cockpit");
    assert.strictEqual(archive.metadata?.surface, "jarvis-cockpit");
  }),
);

it.effect("decodes project thread turns with optional image attachments", () =>
  Effect.gen(function* () {
    const textOnly = yield* decodeProjectThreadTurn({
      text: "Continue the project conversation.",
      idempotency_key: "turn-text-only",
    });
    const encodedTextOnly = yield* encodeProjectThreadTurn(textOnly);
    const withAttachment = yield* decodeProjectThreadTurn({
      text: "Use this screenshot.",
      idempotency_key: "turn-with-attachment",
      attachments: [
        {
          kind: "image",
          mime_type: "image/png",
          name: "screenshot.png",
          data_url: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });
    const withWorkspace = yield* decodeProjectThreadTurn({
      text: "Inspect the runtime repo and summarize the failing tests.",
      idempotency_key: "turn-with-workspace",
      workspace: {
        repos: [{ name: "runtime", base_ref: "origin/main" }],
        engine: "codex",
      },
    });
    const encodedWithWorkspace = yield* encodeProjectThreadTurn(withWorkspace);
    const missingIdempotencyKey = yield* decodeProjectThreadTurn({
      text: "This must not dispatch twice.",
    }).pipe(Effect.flip);

    assert.strictEqual(textOnly.attachments, undefined);
    assert.strictEqual("workspace" in encodedTextOnly, false);
    assert.strictEqual(withAttachment.attachments?.[0]?.kind, "image");
    assert.strictEqual(withAttachment.attachments?.[0]?.mime_type, "image/png");
    assert.strictEqual(withAttachment.metadata?.surface, "jarvis-cockpit");
    assert.match(String(missingIdempotencyKey), /idempotency_key/u);
    assert.deepStrictEqual(encodedWithWorkspace.workspace, {
      repos: [{ name: "runtime", base_ref: "origin/main" }],
      engine: "codex",
    });
  }),
);

it.effect("decodes Jarvis start-work validation responses", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeStartWorkValidation({
      ok: true,
      api_version: "v1",
      schema_version: 1,
      validation: {
        can_start: false,
        source: "manual",
        operation: "start_next_work",
        repo: "",
        worker_id: "macbook-worker",
        engine: "codex",
        engines: ["codex"],
        engine_strategy: "single",
        landing_mode: "draft_pr",
        work_item: null,
        missing: ["repo"],
        missing_authority: [],
        reasons: ["work item has no repo/default repo; cannot start a coding worker"],
        notes: [],
      },
    });

    assert.strictEqual(parsed.validation?.can_start, false);
    assert.deepStrictEqual(parsed.validation?.missing, ["repo"]);
    assert.strictEqual(parsed.validation?.repo, "");
  }),
);

it.effect("accepts documented write success and failure response projections", () =>
  Effect.gen(function* () {
    const success = yield* decodeControlResult({
      ok: true,
      cursor: "evt_130",
      session: {
        session_ref: sessionRef,
      },
      events: [
        {
          type: "turn.started",
        },
      ],
      requests: [],
      artifacts: [],
    });
    const failure = yield* decodeControlResult({
      ok: false,
      error: {
        code: "session_active",
        message: "Session already has an active turn.",
        recoverable: true,
      },
    });

    assert.strictEqual(success.ok, true);
    assert.strictEqual(success.session?.session_ref, sessionRef);
    assert.strictEqual(success.events?.[0]?.type, "turn.started");
    assert.strictEqual(failure.error?.code, "session_active");
  }),
);

it.effect("decodes lifecycle delete inputs and reclamation responses", () =>
  Effect.gen(function* () {
    const input = yield* decodeDelete({});
    const result = yield* decodeLifecycleResult({
      ok: true,
      deleted: true,
      reclamation: {
        records: 1,
        events: 42,
        worktrees: 2,
        bytes: 5_557_453,
      },
    });

    assert.deepStrictEqual(input.metadata, { surface: "jarvis-cockpit" });
    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.reclamation.records, 1);
    assert.strictEqual(result.reclamation.events, 42);
    assert.strictEqual(result.reclamation.worktrees, 2);
  }),
);

it.effect("decodes SSE event envelopes with cursor-bearing payloads", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSseEvent({
      cursor: "evt_124",
      occurred_at: generatedAt,
      type: "session.event",
      run_id: runId,
      session_ref: sessionRef,
      payload: eventFixture,
    });

    assert.strictEqual(parsed.cursor, "evt_124");
    assert.strictEqual(parsed.type, "session.event");
  }),
);

it.effect(
  "tolerates 2026-07-07 live brain wire quirks (new controls, empty labels, null auth facts)",
  () =>
    Effect.gen(function* () {
      const parsed = yield* decodeSnapshot({
        api_version: "v1",
        schema_version: 1,
        cursor: "evt_200",
        generated_at: generatedAt,
        sync: { mode: "probe", status: "fresh", synced_at: generatedAt, errors: [] },
        runs: [
          {
            run_id: runId,
            title: "Legacy run without engine",
            status: "completed",
            // Live snapshots report "" (not null/absent) for unresolved engines.
            engine: "",
            // 2026-07-07 release added controls unknown to older clients.
            supported_controls: ["archive", "rename"],
            session_count: 0,
            created_at: generatedAt,
            updated_at: generatedAt,
          },
        ],
        sessions: [
          {
            ...sessionFixture,
            supported_controls: [
              "turn",
              "interrupt",
              "stop",
              "close",
              "archive",
              "unarchive",
              "rename",
            ],
          },
        ],
        workers: [
          {
            worker_id: "macbook-worker",
            display_name: "MacBook Pro",
            status: "online",
            health: "healthy",
            last_seen_at: generatedAt,
            capabilities: [],
            engines: [],
            capacity: { max_sessions: 4, active_sessions: 0, queued_sessions: 0 },
            // Live workers report null (not absent) for unknown auth facts.
            git_identity: {
              provider: "github",
              login: "",
              auth_state: null,
              connected: null,
              authenticated: null,
              auth_fresh: null,
              detail: "",
            },
            repo_access: [{ repo: "roughcoder/jarvis", accessible: null, cached: null }],
            public_metadata: {},
          },
        ],
        artifacts: [],
      });

      assert.strictEqual(parsed.runs[0]?.engine, "");
      assert.deepStrictEqual(parsed.runs[0]?.supported_controls, ["archive", "rename"]);
      assert.strictEqual(parsed.sessions[0]?.supported_controls.includes("unarchive"), true);
      assert.strictEqual(parsed.workers[0]?.git_identity?.authenticated, null);
      assert.strictEqual(parsed.workers[0]?.repo_access?.at(0)?.accessible, null);
    }),
);

it.effect("decodes root project threads that report empty parent_chat_id", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreads({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      threads: [
        {
          thread_id: "thread_root",
          project_id: "jarvis",
          session_id: "project:jarvis:orchestrator:thread_root",
          title: "Planning",
          // Root threads report "" (not null) for parent_chat_id on the wire.
          chat_id: "thread_root",
          parent_chat_id: "",
          created_at: generatedAt,
          updated_at: generatedAt,
        },
      ],
    });

    assert.strictEqual(parsed.threads[0]?.parent_chat_id, "");
  }),
);

it.effect("decodes universal durable conversation lifecycle fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreads({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      threads: [
        {
          conversation_id: "thread_durable",
          thread_id: "thread_durable",
          project_id: "jarvis",
          session_id: "project:jarvis:orchestrator:thread_durable",
          title: "Durable project conversation",
          lifecycle: "open",
          operational_state: "idle",
          status: "idle",
          ended_reason: null,
          last_turn_at: generatedAt,
          created_at: generatedAt,
          updated_at: generatedAt,
        },
      ],
    });

    const conversation = parsed.threads[0];
    assert.strictEqual(conversation?.conversation_id, "thread_durable");
    assert.strictEqual(conversation?.lifecycle, "open");
    assert.strictEqual(conversation?.operational_state, "idle");
    assert.strictEqual(conversation?.status, "idle");
    assert.strictEqual(conversation?.ended_reason, null);
    assert.strictEqual(conversation?.last_turn_at, generatedAt);
  }),
);

it.effect("preserves durable project-conversation message and activity identities", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreadDetail({
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        thread_id: "thread_durable",
        project_id: "jarvis",
        session_id: "project:jarvis:orchestrator:thread_durable",
        title: "Durable project conversation",
        created_at: generatedAt,
        updated_at: generatedAt,
        messages: [
          {
            event_id: "event-tool-result",
            message_id: "message-tool-result",
            call_id: "call-1",
            correlation_id: "correlation-1",
            sequence: 42,
            role: "assistant",
            content: "repository search",
            observed_at: generatedAt,
            type: "tool.result",
          },
        ],
      },
    });

    assert.deepStrictEqual(parsed.thread.messages[0], {
      event_id: "event-tool-result",
      message_id: "message-tool-result",
      call_id: "call-1",
      correlation_id: "correlation-1",
      sequence: 42,
      role: "assistant",
      content: "repository search",
      observed_at: generatedAt,
      type: "tool.result",
    });
  }),
);

it.effect("decodes conversation-scoped project thread control results", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeProjectThreadControl({
      ok: true,
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread_id: "thread_durable",
      control: {
        action: "interrupt",
        accepted: true,
        turn_id: "turn-42",
      },
      execution: {
        available: true,
        status: "running",
        active_turn: null,
        pending_requests: [],
        supported_controls: ["turn", "input", "approval", "interrupt", "stop"],
        supports: { steer: false, queue: false },
        diagnostic: null,
      },
    });

    assert.deepStrictEqual(parsed.control, {
      action: "interrupt",
      accepted: true,
      turn_id: "turn-42",
    });
    assert.strictEqual(parsed.execution.available, true);
    assert.ok(!("session_ref" in parsed));
  }),
);
