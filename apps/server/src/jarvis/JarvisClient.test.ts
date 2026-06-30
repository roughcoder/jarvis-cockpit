import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  JarvisClientError,
  JarvisMissingContractError,
  makeJarvisFixtureClient,
  makeJarvisWorkerSessionClient,
} from "./JarvisClient.ts";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

it.effect("fixture client exposes a run snapshot and events", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const snapshot = yield* client.getSnapshot();
    const session = snapshot.sessions[0];
    assert.strictEqual(snapshot.runs.length, 1);
    assert.strictEqual(session?.provider, "codex");

    const events = yield* client.getSessionEvents(session?.session_id ?? "");
    assert.strictEqual(events.events[1]?.type, "turn.waiting_provider");

    const requests = yield* client.getRequests(session?.session_id);
    const checkpoints = yield* client.getCheckpoints(session?.session_id ?? "");
    assert.strictEqual(requests.requests[0]?.kind, "input");
    assert.strictEqual(checkpoints.checkpoints[0]?.checkpoint_id, "ckpt_fixture_1");
  }),
);

it.effect("worker-session client attaches bearer token and synthesizes a snapshot", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({
          sessions: [
            {
              session_id: "sess_1",
              provider: "codex",
              engine: "codex",
              status: "running",
              run_id: "run_1",
              repo: "roughcoder/jarvis",
              branch: "feature/a",
              cwd: "/tmp/work",
              title: "Run title",
              created_at: "2026-06-30T18:00:00+00:00",
              updated_at: "2026-06-30T18:01:00+00:00",
              metadata: {
                objective: "Do the work",
              },
            },
          ],
        });
      },
    });

    const snapshot = yield* client.getSnapshot();
    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/sessions");
    assert.strictEqual(requests[0]?.authorization, "Bearer worker-token");
    assert.strictEqual(snapshot.runs[0]?.run_id, "run_1");
    assert.strictEqual(snapshot.runs[0]?.objective, "Do the work");
  }),
);

it.effect("worker-session client hydrates documented session-list summaries", () =>
  Effect.gen(function* () {
    const requests: string[] = [];
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url) => {
        requests.push(String(url));
        if (String(url).endsWith("/sessions")) {
          return jsonResponse({
            sessions: [
              {
                session_id: "sess_1",
                status: "running",
              },
            ],
          });
        }
        return jsonResponse({
          session_id: "sess_1",
          provider: "codex",
          engine: "codex",
          status: "running",
          run_id: "run_1",
          repo: "roughcoder/jarvis",
          branch: "feature/a",
          cwd: "/tmp/work",
          title: "Run title",
          created_at: "2026-06-30T18:00:00+00:00",
          updated_at: "2026-06-30T18:01:00+00:00",
          metadata: {},
        });
      },
    });

    const snapshot = yield* client.getSnapshot();

    assert.deepStrictEqual(requests, [
      "http://jarvis.local:8787/sessions",
      "http://jarvis.local:8787/sessions/sess_1",
    ]);
    assert.strictEqual(snapshot.sessions[0]?.provider, "codex");
    assert.strictEqual(snapshot.runs[0]?.run_id, "run_1");
  }),
);

it.effect("worker-session client reads requests and checkpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string }> = [];
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
        });
        if (String(url).endsWith("/sessions/requests")) {
          return jsonResponse({
            requests: [
              {
                session_id: "sess_1",
                request_id: "approval_1",
                kind: "approval",
                status: "pending",
                event: {
                  type: "approval.requested",
                  request_id: "approval_1",
                },
              },
            ],
          });
        }
        if (String(url).endsWith("/sessions/sess_1/requests")) {
          return jsonResponse({
            requests: [
              {
                session_id: "sess_1",
                request_id: "input_1",
                kind: "input",
                status: "pending",
                event: {
                  type: "input.requested",
                  request_id: "input_1",
                },
              },
            ],
          });
        }
        return jsonResponse({
          checkpoints: [
            {
              session_id: "sess_1",
              checkpoint_id: "ckpt_1",
              label: "before review fixes",
              provider: "codex",
              restored: false,
              event: {
                type: "checkpoint.created",
                checkpoint_id: "ckpt_1",
              },
            },
          ],
        });
      },
    });

    const aggregateRequests = yield* client.getRequests();
    const sessionRequests = yield* client.getRequests("sess_1");
    const checkpoints = yield* client.getCheckpoints("sess_1");

    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/sessions/requests");
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/sessions/sess_1/requests");
    assert.strictEqual(requests[2]?.url, "http://jarvis.local:8787/sessions/sess_1/checkpoints");
    assert.strictEqual(aggregateRequests.requests[0]?.kind, "approval");
    assert.strictEqual(sessionRequests.requests[0]?.kind, "input");
    assert.strictEqual(checkpoints.checkpoints[0]?.checkpoint_id, "ckpt_1");
  }),
);

it.effect("worker-session client sends event cursors and checkpoint restore requests", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: string | null }> = [];
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        });
        if (String(url).includes("/events")) {
          return jsonResponse({ events: [] });
        }
        return jsonResponse({ ok: true });
      },
    });

    yield* client.getSessionEvents("sess_1", { after: "ev_1", limit: 25 });
    yield* client.restoreCheckpoint("sess_1", {
      checkpoint_id: "ckpt_1",
      metadata: {
        surface: "t3",
      },
    });

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/sessions/sess_1/events?after=ev_1&limit=25",
    );
    assert.strictEqual(
      requests[1]?.url,
      "http://jarvis.local:8787/sessions/sess_1/checkpoints/restore",
    );
    assert.strictEqual(requests[1]?.method, "POST");
    assert.match(requests[1]?.body ?? "", /ckpt_1/);
  }),
);

it.effect("worker-session client accepts lightweight documented control responses", () =>
  Effect.gen(function* () {
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse({
          ok: true,
          session: {
            session_id: "sess_1",
          },
          event: {
            type: "turn.started",
          },
          turn_id: "turn_1",
        }),
    });

    const result = yield* client.sendTurn("sess_1", {
      prompt: "continue",
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.session?.session_id, "sess_1");
    assert.strictEqual(result.event?.type, "turn.started");
  }),
);

it.effect("worker-session client preserves safe HTTP error bodies", () =>
  Effect.gen(function* () {
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () => jsonResponse({ error: "unauthorized" }, { status: 401 }),
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);
    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.status, 401);
    assert.match(error.responseBody ?? "", /unauthorized/);
  }),
);

it.effect("worker-session client reports resume as a missing contract", () =>
  Effect.gen(function* () {
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
    });
    const error = yield* client.resumeRun("run_1").pipe(Effect.flip);
    assert.ok(error instanceof JarvisMissingContractError);
    assert.match(error.missing, /No Jarvis resume endpoint/);
  }),
);
