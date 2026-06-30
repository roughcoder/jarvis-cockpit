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
          client
            .getSessionEvents(session.session_id)
            .pipe(Effect.map((page) => [session.session_id, page.events] as const)),
        ),
      ).pipe(
        Effect.map((entries) =>
          mapJarvisRunsSnapshotToReadModel({
            snapshot,
            eventsBySession: new Map(entries),
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
  const sessionId = jarvisSessionIdFromThreadId(threadId);
  if (sessionId === null) {
    return Effect.succeed(Option.none());
  }

  return Effect.all({
    snapshot: client.getSnapshot(),
    session: client.getSession(sessionId),
    eventsPage: client.getSessionEvents(sessionId),
  }).pipe(
    Effect.map(({ snapshot, session, eventsPage }) => {
      const run = snapshot.runs.find((candidate) => candidate.run_id === session.run_id);
      return Option.some(
        mapJarvisSessionToThreadDetail({
          session,
          ...(run ? { run } : {}),
          events: eventsPage.events,
        }),
      );
    }),
  );
}
