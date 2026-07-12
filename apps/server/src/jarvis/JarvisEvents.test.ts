import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import {
  JarvisClientError,
  type JarvisClient,
  makeJarvisFixtureClient,
  parseJarvisCockpitSse,
} from "./JarvisClient.ts";
import {
  coalesceJarvisChanges,
  JARVIS_SSE_SHELL_DEBOUNCE,
  makeJarvisEventsHub,
} from "./JarvisEvents.ts";

const encoder = new TextEncoder();

async function* chunks(values: ReadonlyArray<string>): AsyncGenerator<Uint8Array> {
  for (const value of values) {
    yield encoder.encode(value);
  }
}

it.effect("parses split, multi-line Jarvis SSE frames and ignores heartbeat comments", () =>
  Effect.promise(async () => {
    const events = [];
    for await (const event of parseJarvisCockpitSse(
      chunks([
        ": heartbeat\r\n\r\n",
        'id: cursor-1\nevent: snapshot\ndata: {"cursor":"cursor-1",\n',
        'data: "type":"snapshot","payload":{"runs":[]}}\n\n',
        "id: cursor-2\nevent: future.event\ndata: not-json\n\n",
      ]),
    )) {
      events.push(event);
    }

    assert.deepStrictEqual(events, [
      {
        type: "snapshot",
        cursor: "cursor-1",
        payload: { runs: [] },
        authoritative: true,
      },
      {
        type: "future.event",
        cursor: "cursor-2",
        payload: undefined,
        authoritative: false,
      },
    ]);
  }),
);

it.effect(
  "shares one connection, reconnects with backoff, and marks fallback while unavailable",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let opens = 0;
        const fixture = makeJarvisFixtureClient();
        const client: JarvisClient = {
          ...fixture,
          streamCockpitEvents: () => {
            opens += 1;
            return opens === 1
              ? Stream.fail(
                  new JarvisClientError({ operation: "cockpit.events", message: "offline" }),
                )
              : Stream.concat(
                  Stream.make({
                    type: "snapshot",
                    cursor: "cursor-1",
                    payload: {},
                    authoritative: true,
                  }),
                  Stream.never,
                );
          },
        };
        const hub = yield* makeJarvisEventsHub(client, { failureThreshold: 1 });
        const first = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);
        const second = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);

        yield* Effect.yieldNow;
        assert.strictEqual(opens, 1);
        assert.strictEqual(yield* hub.isLive, false);

        yield* TestClock.adjust("1 second");
        yield* Effect.yieldNow;
        assert.strictEqual(opens, 2);
        assert.strictEqual(yield* hub.isLive, true);

        yield* Fiber.interrupt(first);
        yield* Fiber.interrupt(second);
      }).pipe(Effect.provide(TestClock.layer())),
    ),
);

it.effect("does not open SSE when disabled, preserving polling fallback", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let opens = 0;
      const fixture = makeJarvisFixtureClient();
      const hub = yield* makeJarvisEventsHub(
        {
          ...fixture,
          streamCockpitEvents: () => {
            opens += 1;
            return Stream.never;
          },
        } satisfies JarvisClient,
        { enabled: false },
      );
      const subscriber = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      assert.strictEqual(opens, 0);
      assert.strictEqual(yield* hub.isLive, false);
      yield* Fiber.interrupt(subscriber);
    }),
  ),
);

it.effect("coalesces shell change bursts before a refresh", () =>
  Effect.gen(function* () {
    const change = {
      type: "unknown.future.event",
      cursor: "cursor-1",
      payload: {},
      authoritative: false,
    };
    const emitted = yield* Stream.runCollect(
      coalesceJarvisChanges(
        Stream.make(change, { ...change, cursor: "cursor-2" }, change),
        JARVIS_SSE_SHELL_DEBOUNCE,
      ),
    );
    assert.strictEqual(emitted.length, 1);
  }),
);

it.effect("keeps at most one change-triggered refresh pending behind a slow refresh", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const changes = yield* PubSub.unbounded<{
        readonly type: string;
        readonly cursor: string;
        readonly payload: object;
        readonly authoritative: boolean;
      }>();
      const firstRefresh = yield* Deferred.make<void>();
      const calls = yield* Ref.make(0);
      const refresh = Ref.updateAndGet(calls, (count) => count + 1).pipe(
        Effect.flatMap((count) => (count === 1 ? Deferred.await(firstRefresh) : Effect.void)),
      );
      const consumer = yield* Stream.runDrain(
        coalesceJarvisChanges(Stream.fromPubSub(changes), Duration.millis(1)).pipe(
          Stream.mapEffect(() => refresh, { concurrency: 1 }),
        ),
      ).pipe(Effect.forkScoped);
      const change = {
        type: "snapshot",
        cursor: "cursor-1",
        payload: {},
        authoritative: true,
      };

      yield* PubSub.publish(changes, change);
      yield* Effect.sleep("10 millis");
      yield* PubSub.publishAll(changes, [
        { ...change, cursor: "cursor-2" },
        { ...change, cursor: "cursor-3" },
        { ...change, cursor: "cursor-4" },
      ]);
      yield* Effect.sleep("10 millis");
      yield* Deferred.succeed(firstRefresh, undefined);
      yield* Effect.sleep("10 millis");

      assert.strictEqual(yield* Ref.get(calls), 2);
      yield* Fiber.interrupt(consumer);
    }),
  ),
);
