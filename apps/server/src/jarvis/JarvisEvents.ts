import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import {
  JarvisArtifact,
  type OrchestrationShellSnapshot,
  JarvisRun,
  JarvisRunsSnapshot,
  JarvisSessionCheckpoint,
  JarvisSessionRequest,
  JarvisWorkerProfile,
  JarvisWorkerSession,
} from "@t3tools/contracts";

import type { JarvisClient, JarvisClientError, JarvisCockpitEvent } from "./JarvisClient.ts";
import { mapJarvisRunsSnapshotToShellSnapshot } from "./JarvisProjectionMapper.ts";

const DEFAULT_FAILURE_THRESHOLD = 3;
const MAX_RECONNECT_DELAY = Duration.seconds(30);
const RESYNC_COOLDOWN = Duration.seconds(1);
export const JARVIS_SSE_THREAD_DEBOUNCE = Duration.millis(250);
export const JARVIS_SSE_SHELL_DEBOUNCE = Duration.millis(500);

interface JarvisEventsState {
  readonly subscribers: number;
  readonly fiber: Fiber.Fiber<void> | undefined;
}

interface AppliedJarvisSnapshotState {
  readonly snapshot: JarvisRunsSnapshot | undefined;
  readonly shellSnapshot?: OrchestrationShellSnapshot | undefined;
  readonly stale: boolean;
}

type ApplyEventResult =
  | { readonly _tag: "applied"; readonly snapshot: JarvisRunsSnapshot }
  | { readonly _tag: "resync"; readonly reason: string };

const decodeSnapshot = Schema.decodeUnknownSync(JarvisRunsSnapshot);
const decodeRun = Schema.decodeUnknownSync(JarvisRun);
const decodeSession = Schema.decodeUnknownSync(JarvisWorkerSession);
const decodeWorker = Schema.decodeUnknownSync(JarvisWorkerProfile);
const decodeArtifact = Schema.decodeUnknownSync(JarvisArtifact);
const decodeRequest = Schema.decodeUnknownSync(JarvisSessionRequest);
const decodeCheckpoint = Schema.decodeUnknownSync(JarvisSessionCheckpoint);

export interface JarvisEventsHub {
  /** A shared, fan-out stream of Jarvis change signals. */
  readonly changes: Stream.Stream<JarvisCockpitEvent>;
  /** True only while this connection has a validated authoritative projection cache. */
  readonly isLive: Effect.Effect<boolean>;
  /** The validated projection cache assembled from the current SSE connection. */
  readonly appliedSnapshot: Effect.Effect<Option.Option<JarvisRunsSnapshot>>;
  /** The shared shell projection derived once per applied snapshot. */
  readonly appliedShellSnapshot: Effect.Effect<Option.Option<OrchestrationShellSnapshot>>;
  /** Fetches one REST snapshot and replaces the cache if it diverged. */
  readonly reconcileSnapshot: Effect.Effect<JarvisRunsSnapshot, JarvisClientError>;
}

export interface MakeJarvisEventsHubOptions {
  readonly enabled?: boolean;
  readonly failureThreshold?: number;
  readonly restartWhen?: Stream.Stream<unknown>;
}

/**
 * Emit at most one signal per interval while retaining only one pending signal
 * behind a sequential refresh. A signal only prompts an authoritative re-read,
 * so dropping redundant signals is safe and keeps sustained bursts bounded.
 */
export function coalesceJarvisChanges(
  changes: Stream.Stream<JarvisCockpitEvent>,
  debounce: Duration.Duration = JARVIS_SSE_THREAD_DEBOUNCE,
): Stream.Stream<JarvisCockpitEvent> {
  return changes.pipe(
    Stream.rechunk(1),
    Stream.throttle({
      cost: () => 1,
      units: 1,
      duration: debounce,
      strategy: "enforce",
    }),
    Stream.buffer({ capacity: 1, strategy: "sliding" }),
  );
}

function reconnectDelay(failures: number): Duration.Duration {
  return Duration.millis(
    Math.min(Duration.toMillis(MAX_RECONNECT_DELAY), 1_000 * 2 ** Math.max(0, failures - 1)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upsert<Row>(
  rows: ReadonlyArray<Row>,
  row: Row,
  key: (value: Row) => string,
): ReadonlyArray<Row> {
  const rowKey = key(row);
  const index = rows.findIndex((candidate) => key(candidate) === rowKey);
  return index === -1
    ? [...rows, row]
    : rows.map((candidate, candidateIndex) => (candidateIndex === index ? row : candidate));
}

function remove<Row>(rows: ReadonlyArray<Row>, key: string, rowKey: (value: Row) => string) {
  return rows.filter((row) => rowKey(row) !== key);
}

function eventCursor(event: JarvisCockpitEvent): string | undefined {
  return event.cursor?.trim() || undefined;
}

function resync(reason: string): ApplyEventResult {
  return { _tag: "resync", reason };
}

/**
 * Applies only fully validated SSE projection rows. Jarvis intentionally omits
 * `prev_cursor` from granular envelopes: its server-side subscriber gate proves
 * the chain, and all rows from one tick share the resulting cursor. We therefore
 * require a seeded snapshot and allow repeated cursors within a tick. Unknown
 * well-formed frames advance the cursor without mutating known projections;
 * malformed or invalid known frames require an authoritative resync.
 */
export function applyJarvisCockpitEvent(
  state: AppliedJarvisSnapshotState,
  event: JarvisCockpitEvent,
): ApplyEventResult {
  if (event.malformed) {
    return resync("malformed SSE frame");
  }

  const cursor = eventCursor(event);
  if (event.type === "snapshot") {
    if (cursor === undefined) {
      return resync("snapshot without cursor");
    }
    try {
      const snapshot = decodeSnapshot(event.payload);
      return snapshot.cursor === cursor
        ? { _tag: "applied", snapshot }
        : resync("snapshot cursor does not match envelope cursor");
    } catch {
      return resync("invalid snapshot payload");
    }
  }

  const current = state.snapshot;
  if (state.stale || current === undefined) {
    return resync("granular frame arrived before an authoritative snapshot");
  }
  if (cursor === undefined) {
    return resync("granular frame without cursor");
  }

  const replace = (patch: Partial<JarvisRunsSnapshot>): ApplyEventResult => ({
    _tag: "applied",
    snapshot: { ...current, ...patch, cursor },
  });

  try {
    switch (event.type) {
      case "run.updated": {
        const row = decodeRun(event.payload);
        return replace({ runs: upsert(current.runs, row, (value) => value.run_id) });
      }
      case "session.updated": {
        const row = decodeSession(event.payload);
        return replace({ sessions: upsert(current.sessions, row, (value) => value.session_ref) });
      }
      case "worker.updated": {
        const row = decodeWorker(event.payload);
        return replace({ workers: upsert(current.workers, row, (value) => value.worker_id) });
      }
      case "artifact.upserted": {
        const row = decodeArtifact(event.payload);
        return replace({ artifacts: upsert(current.artifacts, row, (value) => value.artifact_id) });
      }
      case "artifact.removed": {
        const artifactId =
          event.artifact_id ?? (isRecord(event.payload) ? event.payload.artifact_id : undefined);
        return typeof artifactId === "string" && artifactId.length > 0
          ? replace({
              artifacts: remove(current.artifacts, artifactId, (value) => value.artifact_id),
            })
          : resync("artifact removal without artifact_id");
      }
      case "request.updated": {
        if (!isRecord(event.payload)) {
          return resync("invalid request payload");
        }
        const requestId =
          event.request_id ??
          (typeof event.payload.request_id === "string" ? event.payload.request_id : undefined);
        if (typeof requestId !== "string" || requestId.length === 0) {
          return resync("request update without request_id");
        }
        if (event.payload.status === "closed") {
          return replace({
            requests: remove(current.requests ?? [], requestId, (value) => value.request_id),
          });
        }
        const row = decodeRequest(event.payload);
        return replace({
          requests: upsert(current.requests ?? [], row, (value) => value.request_id),
        });
      }
      case "checkpoint.updated": {
        const row = decodeCheckpoint(event.payload);
        return replace({
          checkpoints: upsert(
            current.checkpoints ?? [],
            row,
            (value) => `${value.session_ref}:${value.checkpoint_id}`,
          ),
        });
      }
      // Timeline events intentionally do not mutate shell projections. They do
      // advance the cached cursor and are used for targeted thread invalidation.
      case "run.event":
      case "session.event":
        return isRecord(event.payload) ? replace({}) : resync(`${event.type} without payload`);
      default:
        return replace({});
    }
  } catch {
    return resync(`invalid ${event.type} payload`);
  }
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
  const appliedState = yield* Ref.make<AppliedJarvisSnapshotState>({
    snapshot: undefined,
    shellSnapshot: undefined,
    stale: true,
  });
  const appliedLock = yield* Semaphore.make(1);
  const lastResyncAt = yield* Ref.make<number | undefined>(undefined);
  const resyncScheduled = yield* Ref.make(false);
  const scope = yield* Scope.Scope;

  const replaceAppliedSnapshot = (snapshot: JarvisRunsSnapshot) =>
    Ref.set(appliedState, {
      snapshot,
      shellSnapshot: mapJarvisRunsSnapshotToShellSnapshot(snapshot),
      stale: false,
    });

  const markAppliedSnapshotStale = Ref.update(appliedState, (current) => ({
    ...current,
    stale: true,
  }));

  const resyncSnapshot = (reason: string): Effect.Effect<void, never> =>
    client.getSnapshot().pipe(
      Effect.tap((snapshot) => replaceAppliedSnapshot(snapshot)),
      Effect.tap(() => Ref.set(live, true)),
      Effect.asVoid,
      Effect.catch((cause) =>
        Effect.logWarning("Jarvis SSE projection resync failed; falling back to REST polling", {
          cause,
          reason,
        }),
      ),
    );

  const requestResync = (reason: string): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      const now = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      const previous = yield* Ref.get(lastResyncAt);
      const remaining =
        previous === undefined ? 0 : Duration.toMillis(RESYNC_COOLDOWN) - (now - previous);
      if (remaining <= 0) {
        yield* Ref.set(lastResyncAt, now);
        yield* resyncSnapshot(reason);
        return;
      }
      if (yield* Ref.get(resyncScheduled)) {
        return;
      }
      yield* Ref.set(resyncScheduled, true);
      yield* Effect.forkIn(
        Effect.sleep(Duration.millis(remaining)).pipe(
          Effect.andThen(
            Semaphore.withPermits(
              appliedLock,
              1,
              Effect.gen(function* () {
                yield* Ref.set(
                  lastResyncAt,
                  yield* Effect.clockWith((clock) => clock.currentTimeMillis),
                );
                yield* resyncSnapshot(reason);
              }),
            ),
          ),
          Effect.ensuring(Ref.set(resyncScheduled, false)),
        ),
        scope,
      );
    });

  const applyEvent = (event: JarvisCockpitEvent): Effect.Effect<boolean, never> =>
    Semaphore.withPermits(
      appliedLock,
      1,
      Effect.gen(function* () {
        const result = applyJarvisCockpitEvent(yield* Ref.get(appliedState), event);
        if (result._tag === "applied") {
          yield* replaceAppliedSnapshot(result.snapshot);
          yield* Ref.set(live, true);
          return event.type === "snapshot";
        }
        yield* markAppliedSnapshotStale;
        yield* Ref.set(live, false);
        yield* Effect.logWarning("Discarding applied Jarvis SSE projection", {
          cursor: event.cursor,
          reason: result.reason,
          type: event.type,
        });
        yield* requestResync(result.reason);
        return false;
      }),
    );

  const reconcileSnapshot = Semaphore.withPermits(
    appliedLock,
    1,
    Effect.gen(function* () {
      const fetched = yield* client.getSnapshot();
      const current = yield* Ref.get(appliedState);
      if (current.snapshot?.cursor !== fetched.cursor) {
        yield* Effect.logWarning("Jarvis SSE projection diverged from REST reconciliation", {
          appliedCursor: current.snapshot?.cursor,
          restCursor: fetched.cursor,
        });
      }
      yield* replaceAppliedSnapshot(fetched);
      return fetched;
    }),
  );

  const runConnection = (failures: number): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      const connectionHealthy = yield* Ref.make(false);
      const restartRequested = yield* Ref.make(false);
      const restartEffect = options.restartWhen?.pipe(
        Stream.take(1),
        Stream.runDrain,
        Effect.tap(() => Ref.set(restartRequested, true)),
      );
      const eventStream =
        restartEffect === undefined
          ? client.streamCockpitEvents()
          : client.streamCockpitEvents().pipe(Stream.interruptWhen(restartEffect));
      const connection = Stream.runForEach(eventStream, (event) =>
        Effect.gen(function* () {
          if (yield* applyEvent(event)) {
            yield* Ref.set(connectionHealthy, true);
          }
          yield* PubSub.publish(events, event);
        }),
      );
      const shouldReconnect = yield* connection.pipe(
        Effect.matchCauseEffect({
          onSuccess: () => Effect.succeed(true),
          onFailure: (cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.succeed(false)
              : Effect.logWarning("Jarvis SSE connection ended; reconnecting", { cause }).pipe(
                  Effect.as(true),
                ),
        }),
      );
      if (!shouldReconnect) {
        return;
      }
      yield* markAppliedSnapshotStale;
      yield* Ref.set(live, false);
      if (yield* Ref.get(restartRequested)) {
        return yield* runConnection(0);
      }
      const nextFailures = (yield* Ref.get(connectionHealthy)) ? 1 : failures + 1;
      if (nextFailures >= failureThreshold) {
        yield* Effect.logWarning("Jarvis SSE remains unavailable; REST polling stays active", {
          failures: nextFailures,
        });
      }
      yield* Effect.sleep(reconnectDelay(nextFailures));
      return yield* runConnection(nextFailures);
    });

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
      yield* markAppliedSnapshotStale;
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
    appliedSnapshot: Ref.get(appliedState).pipe(
      Effect.map((current) =>
        current.stale || current.snapshot === undefined
          ? Option.none<JarvisRunsSnapshot>()
          : Option.some(current.snapshot),
      ),
    ),
    appliedShellSnapshot: Ref.get(appliedState).pipe(
      Effect.map((current) =>
        current.stale || current.shellSnapshot === undefined
          ? Option.none<OrchestrationShellSnapshot>()
          : Option.some(current.shellSnapshot),
      ),
    ),
    reconcileSnapshot,
  };
});
