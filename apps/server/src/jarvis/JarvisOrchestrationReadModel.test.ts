import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
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
