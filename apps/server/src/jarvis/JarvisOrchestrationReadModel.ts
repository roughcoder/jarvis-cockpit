import { JarvisSessionEvent } from "@t3tools/contracts";
import type {
  JarvisSessionCheckpoint,
  JarvisSessionRequest,
  JarvisWorkerSession,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { JarvisClient, JarvisClientError } from "./JarvisClient.ts";
import {
  activeJarvisSessionsForSnapshot,
  jarvisSessionIdFromThreadId,
  mapJarvisArchivedRunsSnapshotToShellSnapshot,
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
const DEFAULT_JARVIS_SESSION_HISTORY_MAX_ITEMS = 2_000;

interface JarvisCursorPage<Item> {
  readonly items: ReadonlyArray<Item>;
  readonly cursor?: string | null | undefined;
  readonly has_more: boolean;
}

interface JarvisRetainedHistory<Item> {
  readonly items: ReadonlyArray<Item>;
  readonly cursor: string | null;
}

interface JarvisSessionHistory {
  readonly events: JarvisRetainedHistory<JarvisSessionEvent>;
  readonly checkpoints: JarvisRetainedHistory<JarvisSessionCheckpoint>;
  readonly requests: JarvisRetainedHistory<JarvisSessionRequest>;
}

export interface JarvisSessionReadCache {
  readonly read: (
    client: JarvisClient,
    session: Pick<JarvisWorkerSession, "session_ref" | "latest_event_cursor">,
  ) => Effect.Effect<JarvisSessionHistory, JarvisClientError>;
  readonly evict: (sessionRef: string) => void;
}

function configuredJarvisSessionHistoryMaxItems(): number {
  const configured = Number.parseInt(process.env.JARVIS_SESSION_HISTORY_MAX_ITEMS ?? "", 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_JARVIS_SESSION_HISTORY_MAX_ITEMS;
}

function cursorFor<Item>(
  items: ReadonlyArray<Item>,
  itemId: (item: Item) => string,
): string | null {
  const last = items.at(-1);
  return last === undefined ? null : itemId(last);
}

function mergeRetainedHistory<Item>(input: {
  readonly existing: JarvisRetainedHistory<Item> | undefined;
  readonly incoming: ReadonlyArray<Item>;
  readonly itemId: (item: Item) => string;
  readonly maxItems: number;
  readonly replace: boolean;
}): JarvisRetainedHistory<Item> {
  const merged = input.replace ? [...input.incoming] : [...(input.existing?.items ?? [])];
  const seen = new Set(merged.map(input.itemId));
  for (const item of input.replace ? [] : input.incoming) {
    if (!seen.has(input.itemId(item))) {
      merged.push(item);
      seen.add(input.itemId(item));
    }
  }
  const items =
    merged.length > input.maxItems ? merged.slice(merged.length - input.maxItems) : merged;
  return {
    items,
    cursor: cursorFor(items, input.itemId) ?? input.existing?.cursor ?? null,
  };
}

function loadJarvisCursorPages<Item>(input: {
  readonly loadPage: (
    after: string | undefined,
  ) => Effect.Effect<JarvisCursorPage<Item>, JarvisClientError>;
  readonly itemId: (item: Item) => string;
  readonly maxPages: number;
  readonly after?: string;
  readonly pagesLoaded?: number;
  readonly accumulated?: ReadonlyArray<Item>;
}): Effect.Effect<ReadonlyArray<Item>, JarvisClientError> {
  const after = input.after;
  const pagesLoaded = input.pagesLoaded ?? 0;
  const accumulated = input.accumulated ?? [];
  return input.loadPage(after).pipe(
    Effect.flatMap((page) => {
      const next = [...accumulated, ...page.items];
      const pageCursor = page.cursor ?? cursorFor(page.items, input.itemId) ?? after;
      if (
        !page.has_more ||
        pageCursor === undefined ||
        pageCursor === null ||
        pageCursor === after ||
        pagesLoaded + 1 >= input.maxPages
      ) {
        return Effect.succeed(next);
      }
      return loadJarvisCursorPages({
        ...input,
        after: pageCursor,
        pagesLoaded: pagesLoaded + 1,
        accumulated: next,
      });
    }),
  );
}

function isCursorResetError(error: JarvisClientError): boolean {
  return error.status !== null && error.status >= 400 && error.status < 500;
}

function eventGapDetected(
  existing: JarvisRetainedHistory<JarvisSessionEvent>,
  incoming: ReadonlyArray<JarvisSessionEvent>,
  latestEventCursor: string | null | undefined,
): boolean {
  if (incoming.length === 0) {
    return latestEventCursor != null && latestEventCursor !== existing.cursor;
  }
  const lastRetainedEvent = existing.items.at(-1);
  const firstIncomingEvent = incoming[0];
  return (
    lastRetainedEvent !== undefined &&
    firstIncomingEvent !== undefined &&
    firstIncomingEvent.sequence !== lastRetainedEvent.sequence + 1
  );
}

function refreshJarvisHistory<Item>(input: {
  readonly existing: JarvisRetainedHistory<Item> | undefined;
  readonly loadPage: (
    after: string | undefined,
  ) => Effect.Effect<JarvisCursorPage<Item>, JarvisClientError>;
  readonly itemId: (item: Item) => string;
  readonly maxItems: number;
  readonly maxPages: number;
  readonly gapDetected?: (incoming: ReadonlyArray<Item>) => boolean;
}): Effect.Effect<JarvisRetainedHistory<Item>, JarvisClientError> {
  const loadFull = () =>
    loadJarvisCursorPages({
      loadPage: input.loadPage,
      itemId: input.itemId,
      maxPages: input.maxPages,
    }).pipe(
      Effect.map((items) =>
        mergeRetainedHistory({
          existing: undefined,
          incoming: items,
          itemId: input.itemId,
          maxItems: input.maxItems,
          replace: true,
        }),
      ),
    );

  const existing = input.existing;
  if (existing === undefined || existing.cursor === null) {
    return loadFull();
  }

  return loadJarvisCursorPages({
    loadPage: input.loadPage,
    itemId: input.itemId,
    maxPages: input.maxPages,
    after: existing.cursor,
  }).pipe(
    Effect.flatMap((incoming) => {
      if (input.gapDetected?.(incoming) === true) {
        return loadFull();
      }
      return Effect.succeed(
        mergeRetainedHistory({
          existing,
          incoming,
          itemId: input.itemId,
          maxItems: input.maxItems,
          replace: false,
        }),
      );
    }),
    Effect.catch((error) => (isCursorResetError(error) ? loadFull() : Effect.fail(error))),
  );
}

export function makeJarvisSessionReadCache(
  input: {
    readonly maxItems?: number;
  } = {},
): JarvisSessionReadCache {
  const maxItems = input.maxItems ?? DEFAULT_JARVIS_SESSION_HISTORY_MAX_ITEMS;
  const histories = new Map<string, JarvisSessionHistory>();

  const read = Effect.fn("JarvisSessionReadCache.read")(function* (
    client: JarvisClient,
    session: Pick<JarvisWorkerSession, "session_ref" | "latest_event_cursor">,
  ) {
    const existing = histories.get(session.session_ref);
    const [events, checkpoints, requests] = yield* Effect.all([
      refreshJarvisHistory({
        existing: existing?.events,
        loadPage: (after) =>
          client.getSessionEvents(session.session_ref, {
            ...(after ? { after } : {}),
            limit: JARVIS_SESSION_EVENTS_PAGE_LIMIT,
          }),
        itemId: (event) => event.event_id,
        maxItems,
        maxPages: JARVIS_SESSION_EVENTS_MAX_PAGES,
        gapDetected: (incoming) =>
          eventGapDetected(
            existing?.events ?? { items: [], cursor: null },
            incoming,
            session.latest_event_cursor,
          ),
      }),
      refreshJarvisHistory({
        existing: existing?.checkpoints,
        // Requests and checkpoints have the same after-cursor API as events.
        loadPage: (after) =>
          client.getCheckpoints(session.session_ref, {
            ...(after ? { after } : {}),
            limit: JARVIS_SESSION_CHECKPOINTS_PAGE_LIMIT,
          }),
        itemId: (checkpoint) => checkpoint.checkpoint_id,
        maxItems,
        maxPages: JARVIS_SESSION_CHECKPOINTS_MAX_PAGES,
      }),
      refreshJarvisHistory({
        existing: existing?.requests,
        loadPage: (after) =>
          client.getRequests(session.session_ref, {
            ...(after ? { after } : {}),
            limit: JARVIS_SESSION_REQUESTS_PAGE_LIMIT,
          }),
        itemId: (request) => request.request_id,
        maxItems,
        maxPages: JARVIS_SESSION_REQUESTS_MAX_PAGES,
      }),
    ]);
    const history = { events, checkpoints, requests };
    histories.set(session.session_ref, history);
    return history;
  });

  return {
    read,
    evict: (sessionRef) => {
      histories.delete(sessionRef);
    },
  };
}

const jarvisSessionReadCache = makeJarvisSessionReadCache({
  maxItems: configuredJarvisSessionHistoryMaxItems(),
});

function isTerminalJarvisSession(session: Pick<JarvisWorkerSession, "status">): boolean {
  return (
    session.status === "completed" || session.status === "failed" || session.status === "stopped"
  );
}

function loadCachedJarvisSessionHistory(
  client: JarvisClient,
  session: Pick<JarvisWorkerSession, "session_ref" | "latest_event_cursor" | "status">,
  cache: JarvisSessionReadCache,
): Effect.Effect<JarvisSessionHistory, JarvisClientError> {
  return cache
    .read(client, session)
    .pipe(
      Effect.tap(() =>
        isTerminalJarvisSession(session)
          ? Effect.sync(() => cache.evict(session.session_ref))
          : Effect.void,
      ),
    );
}

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
  return client.getSnapshot().pipe(Effect.map(mapJarvisArchivedRunsSnapshotToShellSnapshot));
}

export function loadJarvisReadModel(
  client: JarvisClient,
  cache: JarvisSessionReadCache = jarvisSessionReadCache,
): Effect.Effect<OrchestrationReadModel, JarvisClientError> {
  return client.getSnapshot().pipe(
    Effect.flatMap((snapshot) =>
      Effect.all(
        activeJarvisSessionsForSnapshot(snapshot).map((session) =>
          loadCachedJarvisSessionHistory(client, session, cache).pipe(
            Effect.map(({ events, checkpoints, requests }) => ({
              sessionRef: session.session_ref,
              events: appendPendingRequestEvents(events.items, requests.items),
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
  cache: JarvisSessionReadCache = jarvisSessionReadCache,
): Effect.Effect<Option.Option<OrchestrationThread>, JarvisClientError> {
  const sessionRef = jarvisSessionIdFromThreadId(threadId);
  if (sessionRef === null) {
    return Effect.succeed(Option.none());
  }

  return Effect.all({
    snapshot: client.getSnapshot(),
    session: client.getSession(sessionRef),
  }).pipe(
    Effect.flatMap(({ snapshot, session }) =>
      loadCachedJarvisSessionHistory(client, session, cache).pipe(
        Effect.map(({ events, checkpoints, requests }) => ({
          snapshot,
          session,
          events: events.items,
          checkpoints: checkpoints.items,
          requests: requests.items,
        })),
      ),
    ),
    Effect.map(({ snapshot, session, events, checkpoints, requests }) => {
      if (session.run_id === null) {
        return Option.none();
      }
      const linkedSession = { ...session, run_id: session.run_id };
      const run = snapshot.runs.find((candidate) => candidate.run_id === linkedSession.run_id);
      return Option.some(
        mapJarvisSessionToThreadDetail({
          session: linkedSession,
          ...(run ? { run } : {}),
          events: appendPendingRequestEvents(events, requests),
          checkpoints,
        }),
      );
    }),
  );
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

export function loadAllJarvisSessionCheckpoints(
  client: JarvisClient,
  sessionRef: string,
): Effect.Effect<ReadonlyArray<JarvisSessionCheckpoint>, JarvisClientError> {
  return loadJarvisCursorPages({
    loadPage: (after) =>
      client.getCheckpoints(sessionRef, {
        ...(after ? { after } : {}),
        limit: JARVIS_SESSION_CHECKPOINTS_PAGE_LIMIT,
      }),
    itemId: (checkpoint) => checkpoint.checkpoint_id,
    maxPages: JARVIS_SESSION_CHECKPOINTS_MAX_PAGES,
  });
}
