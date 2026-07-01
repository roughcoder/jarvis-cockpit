import type {
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
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

const JARVIS_SESSION_EVENTS_PAGE_LIMIT = 100;
const JARVIS_SESSION_EVENTS_MAX_PAGES = 100;
const JARVIS_SESSION_CHECKPOINTS_PAGE_LIMIT = 100;
const JARVIS_SESSION_CHECKPOINTS_MAX_PAGES = 100;

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
            events: loadAllJarvisSessionEvents(client, session.session_ref),
            checkpoints: loadAllJarvisSessionCheckpoints(client, session.session_ref),
          }).pipe(
            Effect.map(({ events, checkpoints }) => ({
              sessionRef: session.session_ref,
              events,
              checkpoints,
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

export function loadJarvisSummaryReadModel(
  client: JarvisClient,
): Effect.Effect<OrchestrationReadModel, JarvisClientError> {
  return client.getSnapshot().pipe(
    Effect.map((snapshot) =>
      mapJarvisRunsSnapshotToReadModel({
        snapshot,
        eventsBySession: new Map(),
        checkpointsBySession: new Map(),
      }),
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
    events: loadAllJarvisSessionEvents(client, sessionRef),
    checkpoints: loadAllJarvisSessionCheckpoints(client, sessionRef),
  }).pipe(
    Effect.map(({ snapshot, session, events, checkpoints }) => {
      const run = snapshot.runs.find((candidate) => candidate.run_id === session.run_id);
      return Option.some(
        mapJarvisSessionToThreadDetail({
          session,
          ...(run ? { run } : {}),
          events,
          checkpoints,
        }),
      );
    }),
  );
}

function loadAllJarvisSessionEvents(
  client: JarvisClient,
  sessionRef: string,
): Effect.Effect<ReadonlyArray<JarvisSessionEvent>, JarvisClientError> {
  const loadPage = (
    after: string | undefined,
    pagesLoaded: number,
    accumulated: ReadonlyArray<JarvisSessionEvent>,
  ): Effect.Effect<ReadonlyArray<JarvisSessionEvent>, JarvisClientError> =>
    client
      .getSessionEvents(sessionRef, {
        ...(after ? { after } : {}),
        limit: JARVIS_SESSION_EVENTS_PAGE_LIMIT,
      })
      .pipe(
        Effect.flatMap((page) => {
          const next = [...accumulated, ...page.items];
          if (
            !page.has_more ||
            page.cursor === undefined ||
            page.cursor === null ||
            page.cursor === after ||
            pagesLoaded + 1 >= JARVIS_SESSION_EVENTS_MAX_PAGES
          ) {
            return Effect.succeed(next);
          }
          return loadPage(page.cursor, pagesLoaded + 1, next);
        }),
      );

  return loadPage(undefined, 0, []);
}

export function loadAllJarvisSessionCheckpoints(
  client: JarvisClient,
  sessionRef: string,
): Effect.Effect<ReadonlyArray<JarvisSessionCheckpoint>, JarvisClientError> {
  const loadPage = (
    after: string | undefined,
    pagesLoaded: number,
    accumulated: ReadonlyArray<JarvisSessionCheckpoint>,
  ): Effect.Effect<ReadonlyArray<JarvisSessionCheckpoint>, JarvisClientError> =>
    client
      .getCheckpoints(sessionRef, {
        ...(after ? { after } : {}),
        limit: JARVIS_SESSION_CHECKPOINTS_PAGE_LIMIT,
      })
      .pipe(
        Effect.flatMap((page) => {
          const next = [...accumulated, ...page.items];
          if (
            !page.has_more ||
            page.cursor === undefined ||
            page.cursor === null ||
            page.cursor === after ||
            pagesLoaded + 1 >= JARVIS_SESSION_CHECKPOINTS_MAX_PAGES
          ) {
            return Effect.succeed(next);
          }
          return loadPage(page.cursor, pagesLoaded + 1, next);
        }),
      );

  return loadPage(undefined, 0, []);
}
