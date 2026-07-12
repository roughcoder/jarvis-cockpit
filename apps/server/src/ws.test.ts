import { assert, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { makeJarvisFixtureClient } from "./jarvis/JarvisClient.ts";
import type { JarvisEventsHub } from "./jarvis/JarvisEvents.ts";
import { jarvisProjectThreadPollingStream } from "./ws.ts";

it.effect("polls project conversations while SSE is live without matching thread frames", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const threads = yield* fixture.getProjectThreads("jarvis-cockpit");
      const thread = threads[0];
      assert.ok(thread);
      const initial = yield* fixture.getProjectThread("jarvis-cockpit", thread.thread_id);
      const refreshed = { ...initial, title: "Updated from another device" };
      let reads = 0;
      const client = {
        ...fixture,
        getProjectThread: (_projectId: string, _threadId: string) => {
          reads += 1;
          return Effect.succeed(refreshed);
        },
      };
      const events: JarvisEventsHub = {
        changes: Stream.never,
        isLive: Effect.succeed(true),
        appliedSnapshot: Effect.succeed(Option.none()),
        reconcileSnapshot: fixture.getSnapshot(),
      };
      const updates = yield* Stream.runCollect(
        jarvisProjectThreadPollingStream(
          client,
          events,
          "jarvis-cockpit",
          thread.thread_id,
          initial,
        ).pipe(Stream.take(1)),
      ).pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(2));
      const [update] = yield* Fiber.join(updates);
      const { messages: _messages, ...threadUpdate } = refreshed;
      assert.strictEqual(reads, 1);
      assert.deepStrictEqual(update, {
        kind: "thread-updated",
        thread: threadUpdate,
      });
    }).pipe(Effect.provide(TestClock.layer())),
  ),
);
