import { assert, it } from "@effect/vitest";
import {
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisSessionRequest,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeJarvisFixtureClient } from "./JarvisClient.ts";
import {
  loadJarvisReadModel,
  loadJarvisShellSnapshot,
  loadJarvisSummaryReadModel,
  loadJarvisThreadDetail,
  shouldUseJarvisCockpitReads,
} from "./JarvisOrchestrationReadModel.ts";

it("enables Jarvis cockpit reads only for Jarvis flags", () => {
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: false, jarvisFixtureMode: false }),
    false,
  );
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: true, jarvisFixtureMode: false }),
    true,
  );
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: false, jarvisFixtureMode: true }),
    true,
  );
});

it.effect("loads Jarvis fixture data as orchestration shell and read-model snapshots", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const shell = yield* loadJarvisShellSnapshot(client);
    const readModel = yield* loadJarvisReadModel(client);

    assert.strictEqual(shell.projects[0]?.id, "jarvis-run_run_fixture_dashboard");
    assert.strictEqual(
      shell.threads[0]?.id,
      "jarvis-session_sessref_macbook-worker_sess_fixture_codex",
    );
    assert.strictEqual(readModel.projects[0]?.deletedAt, null);
    assert.strictEqual(readModel.threads[0]?.activities.length, 2);
  }),
);

it.effect("loads Jarvis summary read models without hydrating session history", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let eventCalls = 0;
    let checkpointCalls = 0;
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string) => {
        void sessionRef;
        eventCalls += 1;
        return fixture.getSessionEvents(sessionRef);
      },
      getCheckpoints: (sessionRef: string) => {
        void sessionRef;
        checkpointCalls += 1;
        return fixture.getCheckpoints(sessionRef);
      },
    };

    const readModel = yield* loadJarvisSummaryReadModel(client);

    assert.strictEqual(readModel.threads[0]?.activities.length, 0);
    assert.strictEqual(eventCalls, 0);
    assert.strictEqual(checkpointCalls, 0);
  }),
);

it.effect("loads Jarvis thread detail only for Jarvis-provenance thread ids", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
    );
    const nonJarvisDetail = yield* loadJarvisThreadDetail(client, ThreadId.make("thread-local"));

    assert.strictEqual(Option.isSome(detail), true);
    assert.strictEqual(Option.isNone(nonJarvisDetail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.activities[1]?.summary, "Choose the next worker action.");
    }
  }),
);

it.effect("follows Jarvis session event pagination for thread details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let eventPageCalls = 0;
    const client = {
      ...fixture,
      getSessionEvents: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        eventPageCalls += 1;
        const baseEvent = {
          sequence: options?.after === "evt_page_1" ? 2 : 1,
          session_ref: sessionRef as JarvisSessionEvent["session_ref"],
          run_id: "run_fixture_dashboard" as JarvisSessionEvent["run_id"],
          occurred_at:
            options?.after === "evt_page_1"
              ? "2026-07-01T12:00:01+00:00"
              : "2026-07-01T12:00:00+00:00",
          turn_id: "turn_fixture_1",
          message_id: null,
          data:
            options?.after === "evt_page_1"
              ? { text: "Second page." }
              : { prompt: "First page prompt." },
        };
        return Effect.succeed(
          options?.after === "evt_page_1"
            ? {
                items: [
                  {
                    ...baseEvent,
                    event_id: "evt_page_2" as JarvisSessionEvent["event_id"],
                    type: "assistant.message",
                    message_id: "msg_page_2",
                  },
                ],
                cursor: "evt_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    ...baseEvent,
                    event_id: "evt_page_1" as JarvisSessionEvent["event_id"],
                    type: "turn.started",
                  },
                ],
                cursor: "evt_page_1",
                has_more: true,
              },
        );
      },
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
    );

    assert.strictEqual(eventPageCalls, 2);
    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.messages.length, 2);
      assert.strictEqual(detail.value.messages[0]?.text, "First page prompt.");
      assert.strictEqual(detail.value.messages[1]?.text, "Second page.");
    }
  }),
);

it.effect("follows Jarvis checkpoint pagination for thread details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let checkpointPageCalls = 0;
    const client = {
      ...fixture,
      getCheckpoints: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        checkpointPageCalls += 1;
        const checkpoint = {
          session_ref: sessionRef as JarvisSessionCheckpoint["session_ref"],
          label: null,
          provider: "codex",
          restored: false,
          event: {},
        };
        return Effect.succeed(
          options?.after === "ckpt_page_1"
            ? {
                items: [
                  {
                    ...checkpoint,
                    checkpoint_id: "ckpt_page_2",
                  },
                ],
                cursor: "ckpt_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    ...checkpoint,
                    checkpoint_id: "ckpt_page_1",
                  },
                ],
                cursor: "ckpt_page_1",
                has_more: true,
              },
        );
      },
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
    );

    assert.strictEqual(checkpointPageCalls, 2);
    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.checkpoints.length, 2);
      assert.match(detail.value.checkpoints[1]?.checkpointRef ?? "", /ckpt_page_2/);
    }
  }),
);

it.effect("hydrates pending Jarvis requests into thread detail activities", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string) => {
        void sessionRef;
        return Effect.succeed({ items: [], cursor: null, has_more: false });
      },
      getRequests: (sessionRef: string) =>
        Effect.succeed({
          items: [
            {
              request_id: "approval_pending_1" as JarvisSessionRequest["request_id"],
              session_ref: sessionRef as JarvisSessionRequest["session_ref"],
              run_id: "run_fixture_dashboard" as JarvisSessionRequest["run_id"],
              kind: "approval" as const,
              status: "pending" as const,
              title: "Approve verification",
              detail: "Run the test command",
              created_at: "2026-07-01T12:01:00+00:00",
              expires_at: null,
              questions: [],
              payload: {
                request_kind: "command",
              },
            },
          ],
          cursor: null,
          has_more: false,
        }),
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
    );

    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      const activity = detail.value.activities[0];
      assert.ok(activity);
      assert.strictEqual(activity?.kind, "approval.requested");
      assert.strictEqual(activity?.summary, "Run the test command");
      assert.deepStrictEqual(
        (activity.payload as Record<string, unknown>).requestId,
        "approval_pending_1",
      );
    }
  }),
);
