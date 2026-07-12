import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
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
  applyJarvisCockpitEvent,
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
        'id: cursor-1\nevent: snapshot\ndata: {"cursor":"cursor-1","run_id":"run-1",\n',
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
        malformed: false,
        run_id: "run-1",
      },
      {
        type: "future.event",
        cursor: "cursor-2",
        payload: undefined,
        authoritative: false,
        malformed: true,
      },
    ]);
  }),
);

it.effect("applies validated granular projection rows and removals at a shared tick cursor", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const run = snapshot.runs[0];
    const session = snapshot.sessions[0];
    const worker = snapshot.workers[0];
    const artifact = snapshot.artifacts[0];
    const request = snapshot.requests[0];
    const checkpoint = snapshot.checkpoints[0];
    assert.ok(run);
    assert.ok(session);
    assert.ok(worker);
    assert.ok(artifact);
    assert.ok(request);
    assert.ok(checkpoint);

    const tick = "evt_applied_3";
    let current = snapshot;
    const apply = (type: string, payload: unknown, extra: Record<string, string> = {}) => {
      const result = applyJarvisCockpitEvent(
        { snapshot: current, stale: false },
        { type, cursor: tick, payload, authoritative: false, ...extra },
      );
      assert.strictEqual(result._tag, "applied");
      if (result._tag === "applied") {
        current = result.snapshot;
      }
    };

    apply("run.updated", { ...run, title: "Applied run title" });
    apply("session.updated", { ...session, title: "Applied session title" });
    apply("worker.updated", { ...worker, display_name: "Applied worker" });
    apply("artifact.upserted", { ...artifact, title: "Applied artifact" });
    apply("checkpoint.updated", { ...checkpoint, label: "Applied checkpoint" });
    apply("request.updated", { ...request, title: "Applied request" });
    apply("request.updated", { request_id: request.request_id, status: "closed" });
    apply("artifact.removed", { artifact_id: artifact.artifact_id });

    assert.strictEqual(current.cursor, tick);
    assert.strictEqual(current.runs[0]?.title, "Applied run title");
    assert.strictEqual(current.sessions[0]?.title, "Applied session title");
    assert.strictEqual(current.workers[0]?.display_name, "Applied worker");
    assert.strictEqual(
      current.artifacts.some((item) => item.artifact_id === artifact.artifact_id),
      false,
    );
    assert.strictEqual(
      current.requests.some((item) => item.request_id === request.request_id),
      false,
    );
    assert.strictEqual(
      current.checkpoints.find((item) => item.checkpoint_id === checkpoint.checkpoint_id)?.label,
      "Applied checkpoint",
    );
  }),
);

it.effect("serves a validated applied snapshot without a REST refetch", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const snapshot = yield* fixture.getSnapshot();
      const run = snapshot.runs[0];
      assert.ok(run);
      let snapshotReads = 0;
      const hub = yield* makeJarvisEventsHub({
        ...fixture,
        getSnapshot: () => {
          snapshotReads += 1;
          return fixture.getSnapshot();
        },
        streamCockpitEvents: () =>
          Stream.concat(
            Stream.make(
              {
                type: "snapshot",
                cursor: snapshot.cursor,
                payload: snapshot,
                authoritative: true,
              },
              {
                type: "run.updated",
                cursor: "evt_applied_hub",
                payload: { ...run, title: "Applied by hub" },
                authoritative: false,
                run_id: run.run_id,
              },
            ),
            Stream.never,
          ),
      });
      const subscriber = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const applied = yield* hub.appliedSnapshot;
      assert.strictEqual(Option.getOrUndefined(applied)?.cursor, "evt_applied_hub");
      assert.strictEqual(Option.getOrUndefined(applied)?.runs[0]?.title, "Applied by hub");
      assert.strictEqual(snapshotReads, 0);
      yield* Fiber.interrupt(subscriber);
    }),
  ),
);

it.effect("resyncs from REST after a cursor mismatch or unknown SSE frame", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const snapshot = yield* fixture.getSnapshot();
      const restSnapshot = { ...snapshot, cursor: "evt_rest_resync" };
      let snapshotReads = 0;
      const client: JarvisClient = {
        ...fixture,
        getSnapshot: () => {
          snapshotReads += 1;
          return Effect.succeed(restSnapshot);
        },
        streamCockpitEvents: () =>
          Stream.concat(
            Stream.make(
              {
                type: "snapshot",
                cursor: "evt_envelope_mismatch",
                payload: snapshot,
                authoritative: true,
              },
              {
                type: "future.event",
                cursor: "evt_future",
                payload: {},
                authoritative: false,
              },
            ),
            Stream.never,
          ),
      };
      const hub = yield* makeJarvisEventsHub(client);
      const subscriber = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const applied = yield* hub.appliedSnapshot;
      assert.strictEqual(Option.getOrUndefined(applied)?.cursor, restSnapshot.cursor);
      assert.strictEqual(snapshotReads, 2);
      assert.strictEqual(yield* hub.isLive, true);
      yield* Fiber.interrupt(subscriber);
    }),
  ),
);

it.effect("reconciliation replaces an applied snapshot when the REST cursor diverges", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const snapshot = yield* fixture.getSnapshot();
      const restSnapshot = {
        ...snapshot,
        cursor: "evt_reconciled",
        runs: snapshot.runs.map((run) => ({ ...run, title: "REST reconciliation title" })),
      };
      const hub = yield* makeJarvisEventsHub({
        ...fixture,
        getSnapshot: () => Effect.succeed(restSnapshot),
        streamCockpitEvents: () =>
          Stream.concat(
            Stream.make({
              type: "snapshot",
              cursor: snapshot.cursor,
              payload: snapshot,
              authoritative: true,
            }),
            Stream.never,
          ),
      });
      const subscriber = yield* Stream.runDrain(hub.changes).pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      const reconciled = yield* hub.reconcileSnapshot;
      const applied = yield* hub.appliedSnapshot;
      assert.strictEqual(reconciled.cursor, restSnapshot.cursor);
      assert.strictEqual(
        Option.getOrUndefined(applied)?.runs[0]?.title,
        "REST reconciliation title",
      );
      yield* Fiber.interrupt(subscriber);
    }),
  ),
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
      assert.strictEqual(Option.isNone(yield* hub.appliedSnapshot), true);
      yield* Fiber.interrupt(subscriber);
    }),
  ),
);

it.effect("coalesces shell change bursts before a refresh", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const changes = yield* PubSub.unbounded<{
        readonly type: string;
        readonly cursor: string;
        readonly payload: object;
        readonly authoritative: boolean;
      }>();
      const subscription = yield* PubSub.subscribe(changes);
      const refreshes = yield* Ref.make(0);
      const consumer = yield* Stream.runDrain(
        coalesceJarvisChanges(
          Stream.fromSubscription(subscription),
          JARVIS_SSE_SHELL_DEBOUNCE,
        ).pipe(Stream.mapEffect(() => Ref.update(refreshes, (count) => count + 1))),
      ).pipe(Effect.forkScoped);
      const change = {
        type: "snapshot",
        cursor: "cursor-1",
        payload: {},
        authoritative: true,
      };

      yield* Effect.yieldNow;
      yield* PubSub.publishAll(changes, [change, { ...change, cursor: "cursor-2" }, change]);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(JARVIS_SSE_SHELL_DEBOUNCE);
      yield* Effect.yieldNow;

      assert.strictEqual(yield* Ref.get(refreshes), 1);
      yield* Fiber.interrupt(consumer);
    }).pipe(Effect.provide(TestClock.layer())),
  ),
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
      const subscription = yield* PubSub.subscribe(changes);
      const firstRefresh = yield* Deferred.make<void>();
      const calls = yield* Ref.make(0);
      const refresh = Ref.updateAndGet(calls, (count) => count + 1).pipe(
        Effect.flatMap((count) => (count === 1 ? Deferred.await(firstRefresh) : Effect.void)),
      );
      const consumer = yield* Stream.runDrain(
        coalesceJarvisChanges(Stream.fromSubscription(subscription), Duration.millis(1)).pipe(
          Stream.mapEffect(() => refresh, { concurrency: 1 }),
        ),
      ).pipe(Effect.forkScoped);
      const change = {
        type: "snapshot",
        cursor: "cursor-1",
        payload: {},
        authoritative: true,
      };

      yield* Effect.yieldNow;
      yield* PubSub.publish(changes, change);
      yield* TestClock.adjust(Duration.millis(1));
      yield* Effect.yieldNow;
      yield* PubSub.publishAll(changes, [
        { ...change, cursor: "cursor-2" },
        { ...change, cursor: "cursor-3" },
        { ...change, cursor: "cursor-4" },
      ]);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.millis(1));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(firstRefresh, undefined);
      yield* Effect.yieldNow;

      assert.strictEqual(yield* Ref.get(calls), 2);
      yield* Fiber.interrupt(consumer);
    }).pipe(Effect.provide(TestClock.layer())),
  ),
);
