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
        appliedShellSnapshot: Effect.succeed(Option.none()),
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

it.effect("publishes structured child-watch phase changes with unchanged prose", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const threads = yield* fixture.getProjectThreads("jarvis-cockpit");
      const thread = threads[0];
      assert.ok(thread);
      const base = yield* fixture.getProjectThread("jarvis-cockpit", thread.thread_id);
      const waitingMessage = {
        role: "system",
        peer_id: "jarvis",
        content: "Watching 2 child work session(s) for completion.",
        observed_at: base.created_at,
        type: "child_watch",
        watch_id: "watch-review",
        child_chat_ids: ["child-claude", "child-codex"],
        phase: "waiting",
      } as const;
      const initial = { ...base, messages: [waitingMessage] };
      const completedMessage = {
        ...waitingMessage,
        phase: "completed",
        completed_at: base.updated_at,
      } as const;
      const refreshed = { ...initial, messages: [completedMessage] };
      const client = {
        ...fixture,
        getProjectThread: (_projectId: string, _threadId: string) => Effect.succeed(refreshed),
      };
      const events: JarvisEventsHub = {
        changes: Stream.never,
        isLive: Effect.succeed(true),
        appliedSnapshot: Effect.succeed(Option.none()),
        appliedShellSnapshot: Effect.succeed(Option.none()),
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
      assert.deepStrictEqual(update, { kind: "snapshot", thread: refreshed });
    }).pipe(Effect.provide(TestClock.layer())),
  ),
);

it.effect("serializes SSE and polling refreshes for one project conversation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const fixture = makeJarvisFixtureClient();
      const threads = yield* fixture.getProjectThreads("jarvis-cockpit");
      const thread = threads[0];
      assert.ok(thread);
      const initial = yield* fixture.getProjectThread("jarvis-cockpit", thread.thread_id);
      const changes = yield* PubSub.unbounded<{
        readonly type: string;
        readonly cursor: string;
        readonly payload: object;
        readonly authoritative: boolean;
      }>();
      const firstRefreshGate = yield* Deferred.make<void>();
      const active = yield* Ref.make(0);
      const maxActive = yield* Ref.make(0);
      let reads = 0;
      const client = {
        ...fixture,
        getProjectThread: (_projectId: string, _threadId: string) =>
          Effect.gen(function* () {
            reads += 1;
            const call = reads;
            const nowActive = yield* Ref.updateAndGet(active, (count) => count + 1);
            yield* Ref.update(maxActive, (maximum) => Math.max(maximum, nowActive));
            if (call === 1) {
              yield* Deferred.await(firstRefreshGate);
            }
            yield* Ref.update(active, (count) => count - 1);
            return { ...initial, title: `Refresh ${call}` };
          }),
      };
      const events: JarvisEventsHub = {
        changes: Stream.fromPubSub(changes),
        isLive: Effect.succeed(true),
        appliedSnapshot: Effect.succeed(Option.none()),
        appliedShellSnapshot: Effect.succeed(Option.none()),
        reconcileSnapshot: fixture.getSnapshot(),
      };
      const updates = yield* Stream.runDrain(
        jarvisProjectThreadPollingStream(
          client,
          events,
          "jarvis-cockpit",
          thread.thread_id,
          initial,
        ),
      ).pipe(Effect.forkScoped);

      yield* Effect.yieldNow;
      yield* PubSub.publish(changes, {
        type: "session.event",
        cursor: "cursor-project-thread",
        payload: { project_id: "jarvis-cockpit", thread_id: thread.thread_id },
        authoritative: false,
      });
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(2));
      yield* Effect.yieldNow;
      assert.strictEqual(reads, 1);
      assert.strictEqual(yield* Ref.get(maxActive), 1);

      yield* Deferred.succeed(firstRefreshGate, undefined);
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.seconds(2));
      yield* Effect.yieldNow;
      assert.strictEqual(reads, 2);
      assert.strictEqual(yield* Ref.get(maxActive), 1);
      yield* Fiber.interrupt(updates);
    }).pipe(Effect.provide(TestClock.layer())),
  ),
);
