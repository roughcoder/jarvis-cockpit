import type {
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { JarvisClient, JarvisClientError } from "./JarvisClient.ts";
import {
  jarvisSessionIdFromThreadId,
  mapJarvisRunsSnapshotToReadModel,
  mapJarvisRunsSnapshotToShellSnapshot,
  mapJarvisSessionToThreadDetail,
} from "./JarvisProjectionMapper.ts";

export function shouldUseJarvisCockpitReads(config: {
  readonly jarvisCockpitEnabled: boolean;
  readonly jarvisFixtureMode: boolean;
}): boolean {
  return config.jarvisCockpitEnabled || config.jarvisFixtureMode;
}

export function loadJarvisShellSnapshot(
  client: JarvisClient,
): Effect.Effect<OrchestrationShellSnapshot, JarvisClientError> {
  return client.getSnapshot().pipe(Effect.map(mapJarvisRunsSnapshotToShellSnapshot));
}

export function loadJarvisReadModel(
  client: JarvisClient,
): Effect.Effect<OrchestrationReadModel, JarvisClientError> {
  return client.getSnapshot().pipe(
    Effect.flatMap((snapshot) =>
      Effect.all(
        snapshot.sessions.map((session) =>
          Effect.all({
            events: client.getSessionEvents(session.session_ref),
            checkpoints: client.getCheckpoints(session.session_ref),
          }).pipe(
            Effect.map(({ events, checkpoints }) => ({
              sessionRef: session.session_ref,
              events: events.items,
              checkpoints: checkpoints.items,
            })),
          ),
        ),
      ).pipe(
        Effect.map((entries) =>
          mapJarvisRunsSnapshotToReadModel({
            snapshot,
            eventsBySession: new Map(entries.map((entry) => [entry.sessionRef, entry.events])),
            checkpointsBySession: new Map(
              entries.map((entry) => [entry.sessionRef, entry.checkpoints]),
            ),
          }),
        ),
      ),
    ),
  );
}

export function loadJarvisThreadDetail(
  client: JarvisClient,
  threadId: ThreadId,
): Effect.Effect<Option.Option<OrchestrationThread>, JarvisClientError> {
  const sessionRef = jarvisSessionIdFromThreadId(threadId);
  if (sessionRef === null) {
    return Effect.succeed(Option.none());
  }

  return Effect.all({
    snapshot: client.getSnapshot(),
    session: client.getSession(sessionRef),
    eventsPage: client.getSessionEvents(sessionRef),
    checkpointsPage: client.getCheckpoints(sessionRef),
  }).pipe(
    Effect.map(({ snapshot, session, eventsPage, checkpointsPage }) => {
      const run = snapshot.runs.find((candidate) => candidate.run_id === session.run_id);
      return Option.some(
        mapJarvisSessionToThreadDetail({
          session,
          ...(run ? { run } : {}),
          events: eventsPage.items,
          checkpoints: checkpointsPage.items,
        }),
      );
    }),
  );
}
