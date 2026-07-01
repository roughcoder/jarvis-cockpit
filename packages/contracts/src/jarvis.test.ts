import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  JarvisApprovalInput,
  JarvisCockpitCatalog,
  JarvisCockpitEvent,
  JarvisControlResult,
  JarvisRestoreCheckpointInput,
  JarvisRunsSnapshot,
  JarvisSessionCheckpointsPage,
  JarvisSessionEvent,
  JarvisSessionEventsPage,
  JarvisSessionRequestsPage,
  JarvisStartWorkInput,
  JarvisTurnInput,
  JarvisUserInputInput,
} from "./jarvis.ts";

const decodeCatalog = Schema.decodeUnknownEffect(JarvisCockpitCatalog);
const decodeSnapshot = Schema.decodeUnknownEffect(JarvisRunsSnapshot);
const decodeEvent = Schema.decodeUnknownEffect(JarvisSessionEvent);
const decodeEventsPage = Schema.decodeUnknownEffect(JarvisSessionEventsPage);
const decodeRequestsPage = Schema.decodeUnknownEffect(JarvisSessionRequestsPage);
const decodeCheckpointsPage = Schema.decodeUnknownEffect(JarvisSessionCheckpointsPage);
const decodeStartWork = Schema.decodeUnknownEffect(JarvisStartWorkInput);
const decodeTurn = Schema.decodeUnknownEffect(JarvisTurnInput);
const decodeApproval = Schema.decodeUnknownEffect(JarvisApprovalInput);
const decodeUserInput = Schema.decodeUnknownEffect(JarvisUserInputInput);
const decodeRestoreCheckpoint = Schema.decodeUnknownEffect(JarvisRestoreCheckpointInput);
const decodeControlResult = Schema.decodeUnknownEffect(JarvisControlResult);
const decodeSseEvent = Schema.decodeUnknownEffect(JarvisCockpitEvent);

const generatedAt = "2026-07-01T12:00:00+00:00";
const sessionRef = "sessref_macbook-worker_sess_123";
const runId = "run_123";

const sessionFixture = {
  session_ref: sessionRef,
  worker_id: "macbook-worker",
  session_id: "sess_123",
  run_id: runId,
  title: "Codex implementation",
  provider: "codex",
  engine: "codex",
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
      engines: [{ id: "codex", label: "Codex" }],
      capabilities: [{ id: "code.edit", label: "Edit code" }],
      work_sources: [{ id: "manual", label: "Manual" }],
      engine_strategies: [{ id: "single", label: "Single" }],
      branch_strategies: [{ id: "auto", label: "Auto" }],
      landing_policies: [{ id: "branch_only", label: "Branch only" }],
      request_kinds: [{ id: "approval", label: "Approval" }],
      generated_at: generatedAt,
    });

    assert.strictEqual(parsed.api_version, "v1");
    assert.strictEqual(parsed.engines[0]?.id, "codex");
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
    });

    assert.strictEqual(parsed.runs[0]?.pending_approval_count, 1);
    assert.strictEqual(parsed.sessions[0]?.session_ref, sessionRef);
    assert.strictEqual(parsed.workers[0]?.engines[0]?.supports.resume, true);
    assert.strictEqual(parsed.artifacts[0]?.kind, "branch");
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

    assert.strictEqual(start.branch_strategy, "auto");
    assert.strictEqual(start.metadata?.surface, "jarvis-cockpit");
    assert.strictEqual(turn.metadata?.surface, "jarvis-cockpit");
    assert.strictEqual(approval.decision, "approved");
    assert.strictEqual(deniedApproval.decision, "denied");
    assert.strictEqual(input.text, "Use the existing orchestration store patterns.");
    assert.strictEqual(restore.metadata?.surface, "jarvis-cockpit");
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
