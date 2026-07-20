import { assert, it } from "@effect/vitest";
import {
  JarvisSessionCheckpoint,
  JarvisSessionEvent,
  JarvisSessionRequest,
  JarvisWorkerSession,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { JarvisClientError, makeJarvisFixtureClient } from "./JarvisClient.ts";
import {
  loadJarvisArchivedShellSnapshot,
  loadJarvisReadModel,
  loadJarvisShellSnapshot,
  loadJarvisSummaryReadModel,
  loadJarvisThreadDetail,
  makeJarvisSessionReadCache,
  shouldUseJarvisCockpitReads,
} from "./JarvisOrchestrationReadModel.ts";

it("enables Jarvis cockpit reads only for Jarvis flags", () => {
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: false, jarvisFixtureMode: false }),
    false,
  );
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: true, jarvisFixtureMode: false }),
    true,
  );
  assert.strictEqual(
    shouldUseJarvisCockpitReads({ jarvisCockpitEnabled: false, jarvisFixtureMode: true }),
    true,
  );
});

it.effect("loads Jarvis fixture data as orchestration shell and read-model snapshots", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const shell = yield* loadJarvisShellSnapshot(client);
    const readModel = yield* loadJarvisReadModel(client, makeJarvisSessionReadCache());

    assert.strictEqual(shell.projects[0]?.id, "jarvis-start");
    assert.strictEqual(shell.projects[1]?.id, "jarvis-run_run_fixture_dashboard");
    assert.strictEqual(
      shell.threads[0]?.id,
      "jarvis-session_sessref_macbook-worker_sess_fixture_codex",
    );
    assert.strictEqual(readModel.projects[0]?.deletedAt, null);
    // The fixture session emits two events (session.created, input.requested) but the activity
    // rail suppresses lifecycle events, so only the input request is presented.
    assert.strictEqual(readModel.threads[0]?.activities.length, 1);
    assert.strictEqual(
      readModel.threads[0]?.activities[0]?.summary,
      "Choose the next worker action.",
    );
  }),
);

it.effect("merges only new Jarvis session events after the retained event cursor", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const firstEvent = (yield* fixture.getSessionEvents(session.session_ref)).items[0];
    assert.ok(firstEvent);
    const secondEvent: JarvisSessionEvent = {
      ...firstEvent,
      event_id: JarvisSessionEvent.fields.event_id.make("evt_cursor_second"),
      sequence: firstEvent.sequence + 1,
      type: "assistant.message",
      message_id: "msg_cursor_second",
      data: { text: "Second incremental event." },
    };
    const eventAfters: Array<string | undefined> = [];
    const client = {
      ...fixture,
      getSessionEvents: (_sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        return Effect.succeed(
          options?.after === firstEvent.event_id
            ? { items: [secondEvent], cursor: secondEvent.event_id, has_more: false }
            : { items: [firstEvent], cursor: firstEvent.event_id, has_more: false },
        );
      },
    };
    const cache = makeJarvisSessionReadCache();

    const initial = yield* cache.read(client, {
      ...session,
      latest_event_cursor: firstEvent.event_id,
    });
    const incremental = yield* cache.read(client, {
      ...session,
      latest_event_cursor: secondEvent.event_id,
    });

    assert.deepStrictEqual(eventAfters, [undefined, firstEvent.event_id]);
    assert.deepStrictEqual(
      initial.events.items.map((event) => event.event_id),
      [firstEvent.event_id],
    );
    assert.deepStrictEqual(
      incremental.events.items.map((event) => event.event_id),
      [firstEvent.event_id, secondEvent.event_id],
    );
  }),
);

it.effect("replaces mutable Jarvis requests instead of retaining resolved rows", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    const request = snapshot.requests?.[0];
    assert.ok(session);
    assert.ok(request);
    const requestAfters: Array<string | undefined> = [];
    let readCount = 0;
    const client = {
      ...fixture,
      getRequests: (_sessionRef: string, options?: { readonly after?: string }) => {
        requestAfters.push(options?.after);
        readCount += 1;
        return Effect.succeed({
          items: readCount === 1 ? [request] : [],
          cursor: readCount === 1 ? request.request_id : null,
          has_more: false,
        });
      },
    };
    const cache = makeJarvisSessionReadCache();

    const initial = yield* cache.read(client, session);
    const refreshed = yield* cache.read(client, session);

    assert.deepStrictEqual(initial.requests.items, [request]);
    assert.deepStrictEqual(refreshed.requests.items, []);
    assert.deepStrictEqual(requestAfters, [undefined, undefined]);
  }),
);

it.effect("serves terminal Jarvis session history from the final cached fetch", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const eventAfters: Array<string | undefined> = [];
    const checkpointAfters: Array<string | undefined> = [];
    const requestAfters: Array<string | undefined> = [];
    const client = {
      ...fixture,
      getSnapshot: () =>
        fixture.getSnapshot().pipe(
          Effect.map((snapshot) => ({
            ...snapshot,
            sessions: snapshot.sessions.map((session) => ({
              ...session,
              status: "completed" as const,
            })),
          })),
        ),
      getSessionEvents: (sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        return fixture.getSessionEvents(sessionRef, options);
      },
      getCheckpoints: (sessionRef: string, options?: { readonly after?: string }) => {
        checkpointAfters.push(options?.after);
        return fixture.getCheckpoints(sessionRef, options);
      },
      getRequests: (sessionRef: string, options?: { readonly after?: string }) => {
        requestAfters.push(options?.after);
        return fixture.getRequests(sessionRef, options);
      },
    };
    const cache = makeJarvisSessionReadCache();

    yield* loadJarvisReadModel(client, cache);
    yield* loadJarvisReadModel(client, cache);

    assert.deepStrictEqual(eventAfters, [undefined, undefined]);
    assert.deepStrictEqual(checkpointAfters, [undefined, undefined]);
    assert.deepStrictEqual(requestAfters, [undefined, undefined]);
  }),
);

it.effect("prunes Jarvis session history that is absent from a later snapshot", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const eventAfters: Array<string | undefined> = [];
    let includeSession = true;
    const client = {
      ...fixture,
      getSnapshot: () =>
        fixture.getSnapshot().pipe(
          Effect.map((current) => ({
            ...current,
            sessions: includeSession ? current.sessions : [],
          })),
        ),
      getSessionEvents: (sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        return fixture.getSessionEvents(sessionRef, options);
      },
    };
    const cache = makeJarvisSessionReadCache();

    yield* loadJarvisReadModel(client, cache);
    includeSession = false;
    yield* loadJarvisReadModel(client, cache);
    yield* cache.read(client, session);

    assert.deepStrictEqual(eventAfters, [undefined, undefined, undefined]);
  }),
);

it.effect("keeps only the most recently read Jarvis session histories", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const baseSession = snapshot.sessions[0];
    assert.ok(baseSession);
    const baseEvent = (yield* fixture.getSessionEvents(baseSession.session_ref)).items[0];
    assert.ok(baseEvent);
    const session = (suffix: string): JarvisWorkerSession => ({
      ...baseSession,
      session_ref: `sessref_cache_${suffix}` as JarvisWorkerSession["session_ref"],
      session_id: `sess_cache_${suffix}` as JarvisWorkerSession["session_id"],
      latest_event_cursor: `evt_cache_${suffix}`,
    });
    const sessions = [session("a"), session("b"), session("c")];
    const eventAfters = new Map<string, Array<string | undefined>>();
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string, options?: { readonly after?: string }) => {
        const calls = eventAfters.get(sessionRef) ?? [];
        calls.push(options?.after);
        eventAfters.set(sessionRef, calls);
        if (options?.after !== undefined) {
          return Effect.succeed({ items: [], cursor: null, has_more: false });
        }
        const eventId = JarvisSessionEvent.fields.event_id.make(
          `evt_cache_${sessionRef.slice("sessref_cache_".length)}`,
        );
        return Effect.succeed({
          items: [
            {
              ...baseEvent,
              event_id: eventId,
              session_ref: sessionRef as typeof baseEvent.session_ref,
            },
          ],
          cursor: eventId,
          has_more: false,
        });
      },
    };
    const cache = makeJarvisSessionReadCache({ maxSessions: 2 });
    const [sessionA, sessionB, sessionC] = sessions;
    assert.ok(sessionA && sessionB && sessionC);

    yield* cache.read(client, sessionA);
    yield* cache.read(client, sessionB);
    yield* cache.read(client, sessionA);
    yield* cache.read(client, sessionC);
    yield* cache.read(client, sessionB);

    assert.deepStrictEqual(eventAfters.get(sessionA.session_ref), [undefined, "evt_cache_a"]);
    assert.deepStrictEqual(eventAfters.get(sessionB.session_ref), [undefined, undefined]);
  }),
);

it.effect("trims retained Jarvis session history from the front at the configured cap", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const firstEvent = (yield* fixture.getSessionEvents(session.session_ref)).items[0];
    assert.ok(firstEvent);
    const secondEvent: JarvisSessionEvent = {
      ...firstEvent,
      event_id: JarvisSessionEvent.fields.event_id.make("evt_cursor_trim_second"),
      sequence: firstEvent.sequence + 1,
      type: "assistant.message",
      message_id: "msg_cursor_trim_second",
      data: { text: "Second retained event." },
    };
    const client = {
      ...fixture,
      getSessionEvents: (_sessionRef: string, options?: { readonly after?: string }) =>
        Effect.succeed(
          options?.after === firstEvent.event_id
            ? { items: [secondEvent], cursor: secondEvent.event_id, has_more: false }
            : { items: [firstEvent], cursor: firstEvent.event_id, has_more: false },
        ),
    };
    const cache = makeJarvisSessionReadCache({ maxItems: 1 });

    yield* cache.read(client, { ...session, latest_event_cursor: firstEvent.event_id });
    const trimmed = yield* cache.read(client, {
      ...session,
      latest_event_cursor: secondEvent.event_id,
    });

    assert.deepStrictEqual(
      trimmed.events.items.map((event) => event.event_id),
      [secondEvent.event_id],
    );
  }),
);

it.effect("falls back to one full Jarvis event read when the retained cursor has a gap", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const firstEvent = (yield* fixture.getSessionEvents(session.session_ref)).items[0];
    assert.ok(firstEvent);
    const secondEvent: JarvisSessionEvent = {
      ...firstEvent,
      event_id: JarvisSessionEvent.fields.event_id.make("evt_cursor_gap_second"),
      sequence: firstEvent.sequence + 1,
      type: "assistant.message",
      message_id: "msg_cursor_gap_second",
      data: { text: "Recovered after cursor reset." },
    };
    const eventAfters: Array<string | undefined> = [];
    let fullReadCount = 0;
    const client = {
      ...fixture,
      getSessionEvents: (_sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        if (options?.after === firstEvent.event_id) {
          return Effect.succeed({ items: [], cursor: null, has_more: false });
        }
        fullReadCount += 1;
        return Effect.succeed({
          items: fullReadCount === 1 ? [firstEvent] : [firstEvent, secondEvent],
          cursor: fullReadCount === 1 ? firstEvent.event_id : secondEvent.event_id,
          has_more: false,
        });
      },
    };
    const cache = makeJarvisSessionReadCache();

    yield* cache.read(client, { ...session, latest_event_cursor: firstEvent.event_id });
    const recovered = yield* cache.read(client, {
      ...session,
      latest_event_cursor: secondEvent.event_id,
    });

    assert.deepStrictEqual(eventAfters, [undefined, firstEvent.event_id, undefined]);
    assert.deepStrictEqual(
      recovered.events.items.map((event) => event.event_id),
      [firstEvent.event_id, secondEvent.event_id],
    );
  }),
);

it.effect("does not treat an empty latest Jarvis event cursor as a gap", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const firstEvent = (yield* fixture.getSessionEvents(session.session_ref)).items[0];
    assert.ok(firstEvent);
    const eventAfters: Array<string | undefined> = [];
    const client = {
      ...fixture,
      getSessionEvents: (_sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        return Effect.succeed(
          options?.after === firstEvent.event_id
            ? { items: [], cursor: null, has_more: false }
            : { items: [firstEvent], cursor: firstEvent.event_id, has_more: false },
        );
      },
    };
    const cache = makeJarvisSessionReadCache();

    yield* cache.read(client, { ...session, latest_event_cursor: firstEvent.event_id });
    yield* cache.read(client, { ...session, latest_event_cursor: "" });

    assert.deepStrictEqual(eventAfters, [undefined, firstEvent.event_id]);
  }),
);

it.effect("falls back to a full Jarvis event read after a rejected retained cursor", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const snapshot = yield* fixture.getSnapshot();
    const session = snapshot.sessions[0];
    assert.ok(session);
    const firstEvent = (yield* fixture.getSessionEvents(session.session_ref)).items[0];
    assert.ok(firstEvent);
    const eventAfters: Array<string | undefined> = [];
    const client = {
      ...fixture,
      getSessionEvents: (_sessionRef: string, options?: { readonly after?: string }) => {
        eventAfters.push(options?.after);
        return options?.after === firstEvent.event_id
          ? Effect.fail(
              new JarvisClientError({
                operation: "sessions.events",
                status: 410,
                message: "The cursor belongs to a restarted Jarvis process.",
              }),
            )
          : Effect.succeed({ items: [firstEvent], cursor: firstEvent.event_id, has_more: false });
      },
    };
    const cache = makeJarvisSessionReadCache();

    yield* cache.read(client, { ...session, latest_event_cursor: firstEvent.event_id });
    yield* cache.read(client, { ...session, latest_event_cursor: firstEvent.event_id });

    assert.deepStrictEqual(eventAfters, [undefined, firstEvent.event_id, undefined]);
  }),
);

it.effect("loads Jarvis summary read models without hydrating session history", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let eventCalls = 0;
    let checkpointCalls = 0;
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string) => {
        void sessionRef;
        eventCalls += 1;
        return fixture.getSessionEvents(sessionRef);
      },
      getCheckpoints: (sessionRef: string) => {
        void sessionRef;
        checkpointCalls += 1;
        return fixture.getCheckpoints(sessionRef);
      },
    };

    const readModel = yield* loadJarvisSummaryReadModel(client);

    assert.strictEqual(readModel.threads[0]?.activities.length, 0);
    assert.strictEqual(eventCalls, 0);
    assert.strictEqual(checkpointCalls, 0);
  }),
);

it.effect("loads Jarvis read models without hydrating archived session details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let eventCalls = 0;
    let checkpointCalls = 0;
    let requestCalls = 0;
    const client = {
      ...fixture,
      getSnapshot: () =>
        fixture.getSnapshot().pipe(
          Effect.map((snapshot) => {
            const activeSession = snapshot.sessions[0];
            assert.ok(activeSession);
            const archivedSession: JarvisWorkerSession = {
              ...activeSession,
              session_ref:
                "sessref_macbook-worker_sess_archived" as JarvisWorkerSession["session_ref"],
              session_id: "sess_archived" as JarvisWorkerSession["session_id"],
              archived_at: "2026-07-01T12:02:00+00:00",
            };
            return {
              ...snapshot,
              sessions: [activeSession, archivedSession],
            };
          }),
        ),
      getSessionEvents: (sessionRef: string) => {
        eventCalls += 1;
        return fixture.getSessionEvents(sessionRef);
      },
      getCheckpoints: (sessionRef: string) => {
        checkpointCalls += 1;
        return fixture.getCheckpoints(sessionRef);
      },
      getRequests: (sessionRef: string) => {
        requestCalls += 1;
        return fixture.getRequests(sessionRef);
      },
    };

    const readModel = yield* loadJarvisReadModel(client, makeJarvisSessionReadCache());

    assert.strictEqual(readModel.threads.length, 1);
    assert.strictEqual(eventCalls, 1);
    assert.strictEqual(checkpointCalls, 1);
    assert.strictEqual(requestCalls, 1);
  }),
);

it.effect("loads archived Jarvis shell snapshots from Jarvis projection state", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const client = {
      ...fixture,
      getSnapshot: () =>
        fixture.getSnapshot().pipe(
          Effect.map((snapshot) => ({
            ...snapshot,
            sessions: snapshot.sessions.map((session) => ({
              ...session,
              archived_at: "2026-07-01T12:02:00+00:00",
            })),
          })),
        ),
    };

    const archived = yield* loadJarvisArchivedShellSnapshot(client);

    assert.strictEqual(archived.projects[0]?.id, "jarvis-run_run_fixture_dashboard");
    assert.strictEqual(
      archived.threads[0]?.id,
      "jarvis-session_sessref_macbook-worker_sess_fixture_codex",
    );
    assert.strictEqual(archived.threads[0]?.archivedAt, "2026-07-01T12:02:00+00:00");
  }),
);

it.effect("loads Jarvis thread detail only for Jarvis-provenance thread ids", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
      makeJarvisSessionReadCache(),
    );
    const nonJarvisDetail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("thread-local"),
      makeJarvisSessionReadCache(),
    );

    assert.strictEqual(Option.isSome(detail), true);
    assert.strictEqual(Option.isNone(nonJarvisDetail), true);
    if (Option.isSome(detail)) {
      // session.created is filtered out of the activity rail, so the input request is first.
      assert.strictEqual(detail.value.activities[0]?.summary, "Choose the next worker action.");
    }
  }),
);

it.effect("follows Jarvis request pagination for thread details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let requestPageCalls = 0;
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string) => {
        void sessionRef;
        return Effect.succeed({ items: [], cursor: null, has_more: false });
      },
      getRequests: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        requestPageCalls += 1;
        const request = {
          session_ref: sessionRef as JarvisSessionRequest["session_ref"],
          run_id: "run_fixture_dashboard" as JarvisSessionRequest["run_id"],
          kind: "approval" as const,
          status: "pending" as const,
          title: "Approve verification",
          created_at: "2026-07-01T12:01:00+00:00",
          expires_at: null,
          questions: [],
          payload: {
            request_kind: "command",
          },
        };
        return Effect.succeed(
          options?.after === "request_page_1"
            ? {
                items: [
                  {
                    ...request,
                    request_id: "request_page_2" as JarvisSessionRequest["request_id"],
                    detail: "Second approval",
                  },
                ],
                cursor: "request_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    ...request,
                    request_id: "request_page_1" as JarvisSessionRequest["request_id"],
                    detail: "First approval",
                  },
                ],
                cursor: "request_page_1",
                has_more: true,
              },
        );
      },
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
      makeJarvisSessionReadCache(),
    );

    assert.strictEqual(requestPageCalls, 2);
    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.activities.length, 2);
      assert.strictEqual(detail.value.activities[1]?.summary, "Second approval");
    }
  }),
);

it.effect("follows Jarvis session event pagination for thread details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let eventPageCalls = 0;
    const client = {
      ...fixture,
      getSessionEvents: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        eventPageCalls += 1;
        const baseEvent = {
          sequence: options?.after === "evt_page_1" ? 2 : 1,
          session_ref: sessionRef as JarvisSessionEvent["session_ref"],
          run_id: "run_fixture_dashboard" as JarvisSessionEvent["run_id"],
          occurred_at:
            options?.after === "evt_page_1"
              ? "2026-07-01T12:00:01+00:00"
              : "2026-07-01T12:00:00+00:00",
          turn_id: "turn_fixture_1",
          message_id: undefined,
          data:
            options?.after === "evt_page_1"
              ? { text: "Second page." }
              : { prompt: "First page prompt." },
        };
        return Effect.succeed(
          options?.after === "evt_page_1"
            ? {
                items: [
                  {
                    ...baseEvent,
                    event_id: "evt_page_2" as JarvisSessionEvent["event_id"],
                    type: "assistant.message",
                    message_id: "msg_page_2",
                  },
                ],
                cursor: "evt_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    ...baseEvent,
                    event_id: "evt_page_1" as JarvisSessionEvent["event_id"],
                    type: "turn.started",
                  },
                ],
                cursor: "evt_page_1",
                has_more: true,
              },
        );
      },
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
      makeJarvisSessionReadCache(),
    );

    assert.strictEqual(eventPageCalls, 2);
    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.messages.length, 2);
      assert.strictEqual(detail.value.messages[0]?.text, "First page prompt.");
      assert.strictEqual(detail.value.messages[1]?.text, "Second page.");
    }
  }),
);

it.effect("follows Jarvis checkpoint pagination for thread details", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    let checkpointPageCalls = 0;
    const client = {
      ...fixture,
      getCheckpoints: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        checkpointPageCalls += 1;
        const checkpoint = {
          session_ref: sessionRef as JarvisSessionCheckpoint["session_ref"],
          label: null,
          provider: "codex",
          restored: false,
          event: {},
        };
        return Effect.succeed(
          options?.after === "ckpt_page_1"
            ? {
                items: [
                  {
                    ...checkpoint,
                    checkpoint_id: "ckpt_page_2",
                  },
                ],
                cursor: "ckpt_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    ...checkpoint,
                    checkpoint_id: "ckpt_page_1",
                  },
                ],
                cursor: "ckpt_page_1",
                has_more: true,
              },
        );
      },
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
      makeJarvisSessionReadCache(),
    );

    assert.strictEqual(checkpointPageCalls, 2);
    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      assert.strictEqual(detail.value.checkpoints.length, 2);
      assert.match(detail.value.checkpoints[1]?.checkpointRef ?? "", /ckpt_page_2/);
    }
  }),
);

it.effect("hydrates pending Jarvis requests into thread detail activities", () =>
  Effect.gen(function* () {
    const fixture = makeJarvisFixtureClient();
    const client = {
      ...fixture,
      getSessionEvents: (sessionRef: string) => {
        void sessionRef;
        return Effect.succeed({ items: [], cursor: null, has_more: false });
      },
      getRequests: (sessionRef: string) =>
        Effect.succeed({
          items: [
            {
              request_id: "approval_pending_1" as JarvisSessionRequest["request_id"],
              session_ref: sessionRef as JarvisSessionRequest["session_ref"],
              run_id: "run_fixture_dashboard" as JarvisSessionRequest["run_id"],
              kind: "approval" as const,
              status: "pending" as const,
              title: "Approve verification",
              detail: "Run the test command",
              created_at: "2026-07-01T12:01:00+00:00",
              expires_at: null,
              questions: [],
              payload: {
                request_kind: "command",
              },
            },
          ],
          cursor: null,
          has_more: false,
        }),
    };

    const detail = yield* loadJarvisThreadDetail(
      client,
      ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex"),
      makeJarvisSessionReadCache(),
    );

    assert.strictEqual(Option.isSome(detail), true);
    if (Option.isSome(detail)) {
      const activity = detail.value.activities[0];
      assert.ok(activity);
      assert.strictEqual(activity?.kind, "approval.requested");
      assert.strictEqual(activity?.summary, "Run the test command");
      assert.deepStrictEqual(
        (activity.payload as Record<string, unknown>).requestId,
        "approval_pending_1",
      );
    }
  }),
);
