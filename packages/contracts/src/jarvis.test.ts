import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  JarvisApprovalInput,
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

const generatedAt = "2026-06-30T18:00:00+00:00";

const sessionFixture = {
  session_id: "sess_1760000000_abcd1234",
  provider: "codex",
  engine: "codex",
  status: "running",
  run_id: "run_1760000000_abcd1234",
  repo: "roughcoder/jarvis",
  branch: "jarvis/eng-42-worker-heartbeat",
  cwd: "/worker/worktrees/jarvis-eng-42-worker-heartbeat",
  title: "Add worker heartbeat status",
  created_at: generatedAt,
  updated_at: generatedAt,
  metadata: {
    surface: "t3",
  },
};

const eventFixture = {
  event_id: "ev_1760000001_abcd1234",
  session_id: "sess_1760000000_abcd1234",
  type: "turn.started",
  time: "2026-06-30T18:00:01+00:00",
  data: {
    turn_id: "turn_1",
    prompt: "Continue from the current diff and run the tests.",
    provider_payload: {
      provider_specific: true,
    },
  },
};

it.effect("decodes a Jarvis aggregate snapshot fixture", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeSnapshot({
      runs: [
        {
          run_id: "run_1760000000_abcd1234",
          title: "Worker heartbeat",
          objective: "Add worker heartbeat status",
          status: "running",
          repo: "roughcoder/jarvis",
          branch: "jarvis/eng-42-worker-heartbeat",
          cwd: "/Users/neilbarton/Development/jarvis",
          worker_count: 1,
          session_count: 1,
          needs_input: false,
          needs_approval: true,
          created_at: generatedAt,
          updated_at: generatedAt,
          metadata: {
            surface: "t3",
          },
        },
      ],
      sessions: [sessionFixture],
      workers: [
        {
          worker_id: "worker_local_mac",
          label: "Local Mac",
          status: "online",
          providers: ["codex", "claude"],
          engines: ["codex", "claude"],
          active_session_count: 1,
          updated_at: generatedAt,
        },
      ],
      artifacts: [
        {
          artifact_id: "artifact_branch_1",
          run_id: "run_1760000000_abcd1234",
          session_id: "sess_1760000000_abcd1234",
          kind: "branch",
          title: "jarvis/eng-42-worker-heartbeat",
          url: "https://github.com/roughcoder/jarvis/tree/jarvis/eng-42-worker-heartbeat",
          created_at: generatedAt,
        },
      ],
      generated_at: generatedAt,
    });

    assert.strictEqual(parsed.runs[0]?.needs_approval, true);
    assert.strictEqual(parsed.sessions[0]?.provider, "codex");
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

it.effect("decodes a worker-session events page", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEventsPage({
      session_id: "sess_1760000000_abcd1234",
      events: [
        eventFixture,
        {
          event_id: "ev_1760000002_abcd1234",
          session_id: "sess_1760000000_abcd1234",
          type: "turn.waiting_provider",
          time: "2026-06-30T18:00:02+00:00",
          data: {
            turn_id: "turn_1",
            message: "provider adapter not attached yet",
          },
        },
      ],
      cursor: null,
    });

    assert.strictEqual(parsed.events.length, 2);
  }),
);

it.effect("decodes pending request and checkpoint projections", () =>
  Effect.gen(function* () {
    const requests = yield* decodeRequestsPage({
      requests: [
        {
          session_id: "sess_1760000000_abcd1234",
          request_id: "approval_turn_1",
          kind: "approval",
          status: "pending",
          event: {
            type: "approval.requested",
            request_id: "approval_turn_1",
          },
        },
      ],
    });
    const checkpoints = yield* decodeCheckpointsPage({
      checkpoints: [
        {
          session_id: "sess_1760000000_abcd1234",
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
    });

    assert.strictEqual(requests.requests[0]?.kind, "approval");
    assert.strictEqual(checkpoints.checkpoints[0]?.checkpoint_id, "ckpt_turn_1");
  }),
);

it.effect("decodes command inputs with defaults", () =>
  Effect.gen(function* () {
    const start = yield* decodeStartWork({
      title: "Worker heartbeat",
      objective: "Add worker heartbeat status",
      prompt: "Inspect the repo and implement the worker heartbeat.",
      metadata: {
        surface: "t3",
      },
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
    assert.deepStrictEqual(turn.metadata, {});
    assert.strictEqual(approval.decision, "approved");
    assert.strictEqual(deniedApproval.decision, "denied");
    assert.strictEqual(input.text, "Use the existing orchestration store patterns.");
    assert.deepStrictEqual(restore.metadata, {});
  }),
);
