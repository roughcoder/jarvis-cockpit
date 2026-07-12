import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import type { JarvisClient, JarvisCockpitEvent } from "./JarvisClient.ts";

const DEFAULT_FAILURE_THRESHOLD = 3;
const MAX_RECONNECT_DELAY = Duration.seconds(30);

interface JarvisEventsState {
  readonly subscribers: number;
  readonly fiber: Fiber.Fiber<void> | undefined;
}

export interface JarvisEventsHub {
  /** A shared, fan-out stream of Jarvis change signals. */
  readonly changes: Stream.Stream<JarvisCockpitEvent>;
  /** True only after the current connection has received its authoritative snapshot. */
  readonly isLive: Effect.Effect<boolean>;
}

export interface MakeJarvisEventsHubOptions {
  readonly enabled?: boolean;
  readonly failureThreshold?: number;
}

export function debounceJarvisChanges(
  changes: Stream.Stream<JarvisCockpitEvent>,
): Stream.Stream<JarvisCockpitEvent> {
  return changes.pipe(Stream.debounce(Duration.millis(250)));
}

function reconnectDelay(failures: number): Duration.Duration {
  return Duration.millis(
    Math.min(Duration.toMillis(MAX_RECONNECT_DELAY), 1_000 * 2 ** Math.max(0, failures - 1)),
  );
}

/**
 * Owns exactly one SSE connection for the server lifetime while there are
 * subscribers. It intentionally emits every successfully parsed event: the
 * Cockpit snapshot is authoritative and unknown future event types are safe
 * only when they cause a refresh.
 */
export const makeJarvisEventsHub = Effect.fn("makeJarvisEventsHub")(function* (
  client: JarvisClient,
  options: MakeJarvisEventsHubOptions = {},
): Effect.fn.Return<JarvisEventsHub, never, Scope.Scope> {
  const enabled = options.enabled ?? process.env.JARVIS_EVENTS_SSE_ENABLED !== "false";
  const failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const events = yield* PubSub.unbounded<JarvisCockpitEvent>();
  const state = yield* Ref.make<JarvisEventsState>({ subscribers: 0, fiber: undefined });
  const live = yield* Ref.make(false);
  const lock = yield* Semaphore.make(1);
  const scope = yield* Scope.Scope;

  const runConnection = (failures: number): Effect.Effect<void, never> =>
    Stream.runForEach(client.streamCockpitEvents(), (event) =>
      Effect.gen(function* () {
        if (event.authoritative) {
          yield* Ref.set(live, true);
        }
        yield* PubSub.publish(events, event);
      }),
    ).pipe(
      Effect.matchCauseEffect({
        onSuccess: () => Effect.succeed(true),
        onFailure: (cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.succeed(false)
            : Effect.logWarning("Jarvis SSE connection ended; reconnecting", { cause }).pipe(
                Effect.as(true),
              ),
      }),
      Effect.flatMap((shouldReconnect) => {
        if (!shouldReconnect) {
          return Effect.void;
        }
        const nextFailures = failures + 1;
        const shouldFallback = nextFailures >= failureThreshold;
        return Effect.gen(function* () {
          if (shouldFallback) {
            yield* Ref.set(live, false);
          }
          yield* Effect.sleep(reconnectDelay(nextFailures));
          return yield* runConnection(nextFailures);
        });
      }),
    );

  const acquire = Semaphore.withPermits(
    lock,
    1,
    Effect.gen(function* () {
      const current = yield* Ref.get(state);
      if (current.subscribers > 0) {
        yield* Ref.set(state, { ...current, subscribers: current.subscribers + 1 });
        return;
      }
      if (!enabled) {
        yield* Ref.set(state, { subscribers: 1, fiber: undefined });
        return;
      }
      const fiber = yield* Effect.forkIn(runConnection(0), scope);
      yield* Ref.set(state, { subscribers: 1, fiber });
    }),
  );

  const release = Semaphore.withPermits(
    lock,
    1,
    Effect.gen(function* () {
      const current = yield* Ref.get(state);
      const subscribers = Math.max(0, current.subscribers - 1);
      if (subscribers > 0) {
        yield* Ref.set(state, { ...current, subscribers });
        return;
      }
      yield* Ref.set(live, false);
      yield* Ref.set(state, { subscribers: 0, fiber: undefined });
      if (current.fiber !== undefined) {
        yield* Fiber.interrupt(current.fiber);
      }
    }),
  );

  yield* Effect.addFinalizer(() =>
    Ref.get(state).pipe(
      Effect.flatMap((current) =>
        current.fiber === undefined ? Effect.void : Fiber.interrupt(current.fiber),
      ),
      Effect.andThen(PubSub.shutdown(events)),
    ),
  );

  return {
    changes: Stream.unwrap(
      Effect.gen(function* () {
        yield* acquire;
        yield* Effect.addFinalizer(() => release);
        return Stream.fromPubSub(events);
      }),
    ),
    isLive: Ref.get(live),
  };
});
