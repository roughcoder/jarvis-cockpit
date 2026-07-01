import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  JarvisClientError,
  makeJarvisCockpitClient,
  makeJarvisFixtureClient,
  makeJarvisWorkerSessionClient,
} from "./JarvisClient.ts";

const now = "2026-07-01T12:00:00+00:00";
const sessionRef = "sessref_macbook-worker_sess_1";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

const worker = {
  worker_id: "macbook-worker",
  display_name: "MacBook Pro",
  status: "online",
  health: "healthy",
  last_seen_at: now,
  capabilities: ["code.edit"],
  engines: [
    {
      engine: "codex",
      display_name: "Codex",
      status: "available",
      default: true,
      supports: {
        streaming: true,
        resume: true,
        interrupt: true,
        approval_requests: true,
        input_requests: true,
        checkpoints: true,
      },
    },
  ],
  capacity: {
    max_sessions: 4,
    active_sessions: 1,
    queued_sessions: 0,
  },
  public_metadata: {},
};

const run = {
  run_id: "run_1",
  title: "Run title",
  objective: "Do the work",
  status: "running",
  phase: "implementing",
  repo: "roughcoder/jarvis",
  branch: "feature/a",
  session_count: 1,
  active_session_count: 1,
  pending_input_count: 0,
  pending_approval_count: 0,
  artifact_count: 0,
  primary_artifact_ids: [],
  latest_activity_at: now,
  latest_cursor: "evt_1",
  created_at: now,
  updated_at: now,
  terminal_reason: null,
};

const session = {
  session_ref: sessionRef,
  worker_id: "macbook-worker",
  session_id: "sess_1",
  run_id: "run_1",
  title: "Codex implementation",
  provider: "codex",
  engine: "codex",
  status: "running",
  repo: "roughcoder/jarvis",
  branch: "feature/a",
  cwd_label: "jarvis",
  latest_event_cursor: "evt_1",
  pending_input_count: 0,
  pending_approval_count: 0,
  checkpoint_count: 1,
  created_at: now,
  updated_at: now,
};

const snapshot = {
  api_version: "v1",
  schema_version: 1,
  cursor: "evt_1",
  generated_at: now,
  sync: {
    mode: "fast",
    status: "fresh",
    synced_at: now,
    errors: [],
  },
  runs: [run],
  sessions: [session],
  workers: [worker],
  artifacts: [],
};

it.effect("fixture client exposes a v1 run snapshot and paginated details", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const fixtureSnapshot = yield* client.getSnapshot();
    const fixtureSession = fixtureSnapshot.sessions[0];
    assert.strictEqual(fixtureSnapshot.api_version, "v1");
    assert.strictEqual(fixtureSnapshot.runs.length, 1);
    assert.strictEqual(fixtureSession?.provider, "codex");

    const events = yield* client.getSessionEvents(fixtureSession?.session_ref ?? "");
    assert.strictEqual(events.items[1]?.type, "input.requested");

    const requests = yield* client.getRequests(fixtureSession?.session_ref ?? "");
    const checkpoints = yield* client.getCheckpoints(fixtureSession?.session_ref ?? "");
    assert.strictEqual(requests.items[0]?.kind, "input");
    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "ckpt_fixture_1");
  }),
);

it.effect("cockpit client attaches bearer token and reads the v1 snapshot endpoint", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse(snapshot);
      },
    });

    const parsedSnapshot = yield* client.getSnapshot();
    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/cockpit/snapshot?sync=fast");
    assert.strictEqual(requests[0]?.authorization, "Bearer worker-token");
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
    assert.strictEqual(parsedSnapshot.runs[0]?.objective, "Do the work");
  }),
);

it.effect("worker-session client export remains an alias for cockpit v1 live mode", () =>
  Effect.gen(function* () {
    const requests: string[] = [];
    const client = makeJarvisWorkerSessionClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url) => {
        requests.push(String(url));
        return jsonResponse(snapshot);
      },
    });

    yield* client.getSnapshot();

    assert.deepStrictEqual(requests, ["http://jarvis.local:8787/v1/cockpit/snapshot?sync=fast"]);
  }),
);

it.effect("cockpit client reads session requests and checkpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
        });
        if (String(url).endsWith("/requests")) {
          return jsonResponse({
            items: [
              {
                request_id: "approval_1",
                session_ref: sessionRef,
                run_id: "run_1",
                kind: "approval",
                status: "pending",
                title: "Approve command",
                created_at: now,
                payload: {
                  request_kind: "command",
                },
              },
            ],
            cursor: "evt_2",
            has_more: false,
          });
        }
        return jsonResponse({
          items: [
            {
              session_ref: sessionRef,
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
          cursor: "evt_3",
          has_more: false,
        });
      },
    });

    const sessionRequests = yield* client.getRequests(sessionRef);
    const checkpoints = yield* client.getCheckpoints(sessionRef);

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/requests",
    );
    assert.strictEqual(
      requests[1]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/checkpoints",
    );
    assert.strictEqual(sessionRequests.items[0]?.kind, "approval");
    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "ckpt_1");
  }),
);

it.effect("cockpit client sends event cursors and checkpoint restore requests", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        });
        if (String(url).includes("/events")) {
          return jsonResponse({ items: [], cursor: "evt_1", has_more: false });
        }
        return jsonResponse({ ok: true, cursor: "evt_2" });
      },
    });

    yield* client.getSessionEvents(sessionRef, { after: "evt_1", limit: 25 });
    yield* client.restoreCheckpoint(sessionRef, {
      checkpoint_id: "ckpt_1",
      metadata: {
        surface: "t3",
      },
    });

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/events?after=evt_1&limit=25",
    );
    assert.strictEqual(
      requests[1]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/checkpoints/restore",
    );
    assert.strictEqual(requests[1]?.method, "POST");
    assert.match(requests[1]?.body ?? "", /ckpt_1/);
    assert.match(requests[1]?.body ?? "", /jarvis-cockpit/);
  }),
);

it.effect("cockpit client posts work, resume, and exact-session turn intents", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : null,
        });
        return jsonResponse({ ok: true, cursor: "evt_2", session: { session_ref: sessionRef } });
      },
    });

    yield* client.startWork({
      phrase: "next Linear ticket",
      source: "linear",
      repo: "roughcoder/jarvis",
      branch_strategy: "auto",
    });
    yield* client.resumeRun("run_1", {
      prompt: "Continue from the current diff.",
    });
    const turnResult = yield* client.sendTurn(sessionRef, {
      prompt: "Keep going.",
    });

    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/work/start");
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/work/resume");
    assert.strictEqual(
      requests[2]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/turns",
    );
    assert.match(requests[0]?.body ?? "", /jarvis-cockpit/);
    assert.strictEqual(turnResult.ok, true);
    assert.strictEqual(turnResult.session?.session_ref, sessionRef);
  }),
);

it.effect("cockpit client preserves safe HTTP error bodies", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () => jsonResponse({ error: "unauthorized" }, { status: 401 }),
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);
    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.status, 401);
    assert.match(error.responseBody ?? "", /unauthorized/);
  }),
);
