import { assert, it } from "@effect/vitest";
import { JarvisSessionEvent, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeJarvisFixtureClient } from "./JarvisClient.ts";
import {
  loadJarvisReadModel,
  loadJarvisShellSnapshot,
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
