import { JarvisSessionEvent } from "@t3tools/contracts";
import type {
  JarvisSessionCheckpoint,
  JarvisSessionRequest,
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
const JARVIS_SESSION_REQUESTS_PAGE_LIMIT = 100;
const JARVIS_SESSION_REQUESTS_MAX_PAGES = 100;

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

export function loadJarvisArchivedShellSnapshot(
  client: JarvisClient,
): Effect.Effect<OrchestrationShellSnapshot, JarvisClientError> {
  return loadJarvisShellSnapshot(client).pipe(Effect.map(toArchivedShellSnapshot));
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
            requests: loadAllJarvisSessionRequests(client, session.session_ref),
          }).pipe(
            Effect.map(({ events, checkpoints, requests }) => ({
              sessionRef: session.session_ref,
              events: appendPendingRequestEvents(events, requests),
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
    requests: loadAllJarvisSessionRequests(client, sessionRef),
  }).pipe(
    Effect.map(({ snapshot, session, events, checkpoints, requests }) => {
      const run = snapshot.runs.find((candidate) => candidate.run_id === session.run_id);
      return Option.some(
        mapJarvisSessionToThreadDetail({
          session,
          ...(run ? { run } : {}),
          events: appendPendingRequestEvents(events, requests),
          checkpoints,
        }),
      );
    }),
  );
}

function loadAllJarvisSessionRequests(
  client: JarvisClient,
  sessionRef: string,
): Effect.Effect<ReadonlyArray<JarvisSessionRequest>, JarvisClientError> {
  const loadPage = (
    after: string | undefined,
    pagesLoaded: number,
    accumulated: ReadonlyArray<JarvisSessionRequest>,
  ): Effect.Effect<ReadonlyArray<JarvisSessionRequest>, JarvisClientError> =>
    client
      .getRequests(sessionRef, {
        ...(after ? { after } : {}),
        limit: JARVIS_SESSION_REQUESTS_PAGE_LIMIT,
      })
      .pipe(
        Effect.flatMap((page) => {
          const next = [...accumulated, ...page.items];
          if (
            !page.has_more ||
            page.cursor === undefined ||
            page.cursor === null ||
            page.cursor === after ||
            pagesLoaded + 1 >= JARVIS_SESSION_REQUESTS_MAX_PAGES
          ) {
            return Effect.succeed(next);
          }
          return loadPage(page.cursor, pagesLoaded + 1, next);
        }),
      );

  return loadPage(undefined, 0, []);
}

function toArchivedShellSnapshot(snapshot: OrchestrationShellSnapshot): OrchestrationShellSnapshot {
  const threads = snapshot.threads.filter((thread) => thread.archivedAt !== null);
  const projectIds = new Set(threads.map((thread) => thread.projectId));
  return {
    ...snapshot,
    projects: snapshot.projects.filter((project) => projectIds.has(project.id)),
    threads,
  };
}

function appendPendingRequestEvents(
  events: ReadonlyArray<JarvisSessionEvent>,
  requests: ReadonlyArray<JarvisSessionRequest>,
): ReadonlyArray<JarvisSessionEvent> {
  const existingPendingRequestIds = new Set(
    events
      .filter((event) => event.type === "approval.requested" || event.type === "input.requested")
      .map((event) => readRequestId(event))
      .filter((requestId): requestId is string => requestId !== null),
  );
  const syntheticEvents = requests
    .filter((request) => request.status === "pending")
    .filter((request) => !existingPendingRequestIds.has(request.request_id))
    .map(
      (request, index): JarvisSessionEvent => ({
        event_id: JarvisSessionEvent.fields.event_id.make(`request:${request.request_id}`),
        sequence: Number.MAX_SAFE_INTEGER - requests.length + index,
        session_ref: request.session_ref,
        run_id: request.run_id,
        type: request.kind === "approval" ? "approval.requested" : "input.requested",
        occurred_at: request.created_at,
        turn_id: null,
        message_id: null,
        data: {
          ...request.payload,
          request_id: request.request_id,
          title: request.title,
          detail: request.detail ?? request.title,
          summary: request.detail ?? request.title,
          ...((request.questions ?? []).length > 0 ? { questions: request.questions } : {}),
        },
      }),
    );
  return syntheticEvents.length > 0 ? [...events, ...syntheticEvents] : events;
}

function readRequestId(event: JarvisSessionEvent): string | null {
  const snake = event.data.request_id;
  if (typeof snake === "string" && snake.trim().length > 0) {
    return snake;
  }
  const camel = event.data.requestId;
  return typeof camel === "string" && camel.trim().length > 0 ? camel : null;
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
