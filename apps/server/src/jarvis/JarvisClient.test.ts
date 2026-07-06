import { assert, it } from "@effect/vitest";
import * as NodeBuffer from "node:buffer";
import { DEFAULT_SERVER_SETTINGS, JarvisProjectId, JarvisWorkerId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  checkJarvisBrain,
  JarvisClientError,
  makeJarvisCockpitClient,
  makeJarvisFixtureClient,
  makeJarvisClient,
  makeJarvisWorkerSessionClient,
  resolveJarvisBrainConnection,
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
  archived_at: null,
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
  authority: "jarvis",
  supported_controls: [
    "turn",
    "input",
    "approval",
    "interrupt",
    "stop",
    "archive",
    "checkpoint_restore",
  ],
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
  archived_at: null,
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

it.effect("fixture client synthesizes distinct runs and sessions for start work", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();

    const result = yield* client.startWork({
      title: "Demo onboarding pivot",
      objective: "Replace local project onboarding with Start work",
      prompt: "Make fixture demos show a real-looking run.",
      repo: "roughcoder/jarvis-cockpit",
      branch_strategy: "auto",
    });
    const fixtureSnapshot = yield* client.getSnapshot();
    const generatedSessionRef = result.session?.session_ref ?? "";
    const generatedRun = fixtureSnapshot.runs[0];
    const generatedSession = fixtureSnapshot.sessions[0];

    assert.strictEqual(result.ok, true);
    assert.strictEqual(generatedRun?.title, "Demo onboarding pivot");
    assert.strictEqual(generatedRun?.objective, "Replace local project onboarding with Start work");
    assert.strictEqual(generatedRun?.repo, "roughcoder/jarvis-cockpit");
    assert.strictEqual(generatedSession?.title, "Demo onboarding pivot");
    assert.strictEqual(generatedSession?.run_id, generatedRun?.run_id);
    assert.strictEqual(generatedSession?.session_ref, generatedSessionRef);

    const sessionDetail = yield* client.getSession(generatedSessionRef);
    const events = yield* client.getSessionEvents(generatedSessionRef);
    assert.strictEqual(sessionDetail.session_ref, generatedSessionRef);
    assert.strictEqual(events.items[1]?.type, "turn.started");
    assert.match(String(events.items[1]?.data.prompt ?? ""), /fixture demos/);
    assert.strictEqual(events.items.at(-1)?.type, "turn.completed");
  }),
);

it.effect("fixture client routes start work to a selected worker", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();

    const result = yield* client.startWork({
      title: "Mac mini routing",
      prompt: "Verify selected worker routing.",
      repo: "roughcoder/jarvis-cockpit",
      worker_id: JarvisWorkerId.make("mac-mini-worker"),
      branch_strategy: "auto",
    });
    const fixtureSnapshot = yield* client.getSnapshot();
    const macMini = fixtureSnapshot.workers.find(
      (worker) => worker.worker_id === "mac-mini-worker",
    );
    const macBook = fixtureSnapshot.workers.find((worker) => worker.worker_id === "macbook-worker");
    const generatedSessionRef = result.session?.session_ref ?? "";
    const resultSessionWorkerId =
      result.session && "worker_id" in result.session ? result.session.worker_id : undefined;
    const events = yield* client.getSessionEvents(generatedSessionRef);
    const assistantMessage = events.items.find((event) => event.type === "assistant.message");

    assert.strictEqual(result.ok, true);
    assert.strictEqual(resultSessionWorkerId, JarvisWorkerId.make("mac-mini-worker"));
    assert.strictEqual(fixtureSnapshot.sessions[0]?.worker_id, "mac-mini-worker");
    assert.strictEqual(macMini?.capacity.active_sessions, 1);
    assert.strictEqual(macBook?.capacity.active_sessions, 1);
    assert.match(String(assistantMessage?.data.text ?? ""), /mac-mini-worker/);
  }),
);

it.effect("configured fixture clients share process-local state", () =>
  Effect.gen(function* () {
    const clientA = makeJarvisClient({
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: true,
    });
    const clientB = makeJarvisClient({
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: true,
    });

    const result = yield* clientA.startWork({
      title: "Shared fixture Mac mini",
      prompt: "Verify configured fixture state is shared.",
      repo: "roughcoder/jarvis-cockpit",
      worker_id: JarvisWorkerId.make("mac-mini-worker"),
      branch_strategy: "auto",
    });
    const fixtureSnapshot = yield* clientB.getSnapshot();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(fixtureSnapshot.sessions[0]?.session_ref, result.session?.session_ref);
    assert.strictEqual(
      fixtureSnapshot.sessions[0]?.worker_id,
      JarvisWorkerId.make("mac-mini-worker"),
    );
  }),
);

it.effect("fixture client mutates session state for stop and archive controls", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();

    const started = yield* client.startWork({
      title: "Archive Mac mini fixture",
      prompt: "Verify stop and archive update fixture state.",
      repo: "roughcoder/jarvis-cockpit",
      worker_id: JarvisWorkerId.make("mac-mini-worker"),
      branch_strategy: "auto",
    });
    const sessionRef = started.session?.session_ref ?? "";
    const stopped = yield* client.stopSession(sessionRef);
    const afterStop = yield* client.getSnapshot();
    const archived = yield* client.archiveSession(sessionRef);
    const afterArchive = yield* client.getSnapshot();

    assert.strictEqual(stopped.ok, true);
    assert.strictEqual(
      afterStop.sessions.find((session) => session.session_ref === sessionRef)?.status,
      "stopped",
    );
    assert.strictEqual(
      afterStop.workers.find((worker) => worker.worker_id === "mac-mini-worker")?.capacity
        .active_sessions,
      0,
    );
    assert.strictEqual(archived.ok, true);
    assert.strictEqual(
      afterArchive.sessions.find((session) => session.session_ref === sessionRef)?.archived_at,
      now,
    );
  }),
);

it.effect("fixture client manages projects with multiple repositories", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();

    const created = yield* client.createProject({
      id: JarvisProjectId.make("dogfood-fixture"),
      name: "Dogfood Fixture",
      repos: [
        { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true },
        { name: "runtime", remote: "roughcoder/jarvis", default: false },
      ],
    });
    const updated = yield* client.updateProject(created.id, {
      name: "Dogfood Fixture Updated",
      repos: [
        { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
        { name: "runtime", remote: "roughcoder/jarvis", default: true },
        { name: "docs", remote: "roughcoder/jarvis-docs", default: false },
      ],
    });
    const archived = yield* client.archiveProject(created.id);
    const activeProjects = yield* client.getProjects();
    const allProjects = yield* client.getProjects({ includeArchived: true });

    assert.strictEqual(created.repos.length, 2);
    assert.strictEqual(updated.name, "Dogfood Fixture Updated");
    assert.strictEqual(updated.repos.length, 3);
    assert.strictEqual(updated.repos.find((repo) => repo.default)?.remote, "roughcoder/jarvis");
    assert.strictEqual(archived.status, "archived");
    assert.strictEqual(
      activeProjects.some((project) => project.id === created.id),
      false,
    );
    assert.strictEqual(
      allProjects.some((project) => project.id === created.id),
      true,
    );
  }),
);

it.effect("fixture client archives project conversations", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const project = (yield* client.getProjects()).find(
      (candidate) => candidate.id === "jarvis-cockpit",
    );
    assert.ok(project);

    const thread = yield* client.createProjectThread(project.id, {
      title: "Archive me",
    });
    const beforeArchive = yield* client.getProjectThreads(project.id);
    const archived = yield* client.archiveProjectThread(project.id, thread.thread_id);
    const afterArchive = yield* client.getProjectThreads(project.id);

    assert.strictEqual(
      beforeArchive.some((candidate) => candidate.thread_id === thread.thread_id),
      true,
    );
    assert.strictEqual(archived.thread_id, thread.thread_id);
    assert.strictEqual(
      afterArchive.some((candidate) => candidate.thread_id === thread.thread_id),
      false,
    );
  }),
);

it.effect("cockpit client accepts project conversation archive response shapes", () =>
  Effect.gen(function* () {
    const thread = {
      thread_id: "thread_1",
      project_id: "jarvis",
      session_id: "project:jarvis:orchestrator:thread_1",
      title: "Archive me",
      created_at: now,
      updated_at: now,
      created_by: "fixture",
    };
    const responses = [
      { thread },
      thread,
      { api_version: "v1", schema_version: 1, threads: [thread] },
    ];
    const requests: Array<{
      readonly url: string;
      readonly body: { readonly metadata?: unknown };
    }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : {},
        });
        return jsonResponse(responses.shift());
      },
    });

    const envelope = yield* client.archiveProjectThread("jarvis", "thread_1");
    const bare = yield* client.archiveProjectThread("jarvis", "thread_1");
    const list = yield* client.archiveProjectThread("jarvis", "thread_1");

    assert.strictEqual(envelope.thread_id, "thread_1");
    assert.strictEqual(bare.thread_id, "thread_1");
    assert.strictEqual(list.thread_id, "thread_1");
    assert.deepStrictEqual(
      requests.map((request) => request.url),
      [
        "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive",
        "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive",
        "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive",
      ],
    );
    assert.deepStrictEqual(requests[0]?.body.metadata, { surface: "jarvis-cockpit" });
  }),
);

it.effect("cockpit client calls project registry write endpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{
      url: string;
      method: string;
      body:
        | {
            readonly metadata?: { readonly surface?: string };
          }
        | undefined;
    }> = [];
    const project = {
      id: "dogfood",
      name: "Dogfood",
      peer_id: "project:dogfood",
      aliases: [],
      owner: "fixture",
      members: ["fixture"],
      visibility: "household",
      status: "active",
      repos: [{ name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: true }],
      links: { urls: [] },
      files_root: "jarvis-workspace/projects/dogfood/files",
    };
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return jsonResponse({ api_version: "v1", schema_version: 1, project });
      },
    });

    yield* client.createProject({
      id: JarvisProjectId.make("dogfood"),
      name: "Dogfood",
      repos: project.repos,
    });
    yield* client.updateProject("dogfood", { repos: project.repos });
    yield* client.archiveProject("dogfood");
    yield* client.deleteProject("dogfood");

    assert.deepStrictEqual(
      requests.map((request) => [request.method, request.url]),
      [
        ["POST", "http://jarvis.local:8787/v1/projects"],
        ["PATCH", "http://jarvis.local:8787/v1/projects/dogfood"],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/archive"],
        ["DELETE", "http://jarvis.local:8787/v1/projects/dogfood"],
      ],
    );
    const firstRequest = requests[0];
    assert.ok(firstRequest);
    assert.strictEqual(firstRequest.body?.metadata, undefined);
  }),
);

it.effect("cockpit client calls project memory and file endpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{
      url: string;
      method: string;
      contentType: string | null;
      bodyKind: "json" | "form" | "none";
      body?: unknown;
    }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers);
        let bodyKind: "json" | "form" | "none" = "none";
        let body: unknown;
        if (init?.body instanceof FormData) {
          bodyKind = "form";
          body = {
            title: init.body.get("title"),
            artifact_type: init.body.get("artifact_type"),
            idempotency_key: init.body.get("idempotency_key"),
            metadata: init.body.get("metadata"),
            file: await (init.body.get("file") as Blob).text(),
          };
        } else if (init?.body) {
          bodyKind = "json";
          body = JSON.parse(String(init.body));
        }
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          contentType: headers.get("content-type"),
          bodyKind,
          body,
        });
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/files") && (init?.method ?? "GET") === "GET") {
          return jsonResponse({
            api_version: "v1",
            schema_version: 1,
            project_id: "dogfood",
            files: [{ doc_id: "spec-1", title: "Spec", retracted: false }],
          });
        }
        return jsonResponse({ ok: true, result: "done", doc_id: "spec-1" });
      },
    });

    yield* client.recordProjectFinding("dogfood", { content: "Finding" });
    yield* client.recordProjectDecision("dogfood", { content: "Decision" });
    yield* client.forgetProjectMemory("dogfood", { query: "old", confirm: true });
    yield* client.correctProjectMemory("dogfood", {
      query: "old",
      replacement: "new",
      confirm: true,
    });
    const files = yield* client.getProjectFiles("dogfood", { includeRetracted: true });
    yield* client.uploadProjectFile("dogfood", {
      filename: "spec.md",
      content_base64: NodeBuffer.Buffer.from("# Spec").toString("base64"),
      title: "Spec",
      artifact_type: "spec",
      mime_type: "text/markdown",
      idempotency_key: "upload-spec-1",
      metadata: { surface: "jarvis-cockpit", source: "test" },
    });
    yield* client.retractProjectFile("dogfood", "spec-1", {
      reason: "Superseded by a newer spec",
    });

    assert.deepStrictEqual(
      requests.map((request) => [request.method, request.url]),
      [
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/findings"],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/decisions"],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/memory/forget"],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/memory/correct"],
        ["GET", "http://jarvis.local:8787/v1/projects/dogfood/files?include_retracted=true"],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/files"],
        ["DELETE", "http://jarvis.local:8787/v1/projects/dogfood/files/spec-1"],
      ],
    );
    assert.strictEqual(files[0]?.doc_id, "spec-1");
    assert.strictEqual(requests[0]?.bodyKind, "json");
    assert.strictEqual(
      (requests[0]?.body as { metadata?: { surface?: string } } | undefined)?.metadata?.surface,
      "jarvis-cockpit",
    );
    assert.strictEqual(requests[5]?.bodyKind, "form");
    assert.strictEqual(requests[5]?.contentType, null);
    assert.deepStrictEqual(requests[5]?.body, {
      title: "Spec",
      artifact_type: "spec",
      idempotency_key: "upload-spec-1",
      metadata: '{"surface":"jarvis-cockpit","source":"test"}',
      file: "# Spec",
    });
    assert.deepStrictEqual(requests[6]?.body, {
      reason: "Superseded by a newer spec",
      metadata: { surface: "jarvis-cockpit" },
    });
  }),
);

it.effect("cockpit client decodes JSON project thread turn responses", () =>
  Effect.gen(function* () {
    const requests: Array<{ body: unknown }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (_url, init) => {
        requests.push({
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return jsonResponse({
          ok: true,
          text: "Project reply",
          events: [{ event: "thread.reply", data: { text: "Project reply" } }],
        });
      },
    });

    const result = yield* client.sendProjectThreadTurn("dogfood", "thread-1", {
      text: "What changed?",
      idempotency_key: "turn-1",
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.text, "Project reply");
    assert.strictEqual(result.events[0]?.event, "thread.reply");
    assert.deepStrictEqual(requests[0]?.body, {
      text: "What changed?",
      idempotency_key: "turn-1",
      metadata: { surface: "jarvis-cockpit" },
    });
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
    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/cockpit/snapshot?sync=probe");
    assert.strictEqual(requests[0]?.authorization, "Bearer worker-token");
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
    assert.strictEqual(parsedSnapshot.runs[0]?.objective, "Do the work");
  }),
);

it.effect("cockpit client prefers OAuth token over legacy bearer token", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () => Effect.succeed("oauth-token"),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse(snapshot);
      },
    });

    yield* client.getSnapshot();

    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
  }),
);

it.effect("cockpit client falls back to legacy bearer token when OAuth is unavailable", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () => Effect.map(Effect.void, () => undefined),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse(snapshot);
      },
    });

    yield* client.getSnapshot();

    assert.strictEqual(requests[0]?.authorization, "Bearer legacy-token");
  }),
);

it.effect("cockpit client falls back to legacy bearer token when OAuth issuance fails", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () =>
        Effect.fail(
          new JarvisClientError({
            operation: "test",
            message: "OAuth unavailable.",
          }),
        ),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse(snapshot);
      },
    });

    yield* client.getSnapshot();

    assert.strictEqual(requests[0]?.authorization, "Bearer legacy-token");
  }),
);

it.effect("cockpit client retries the legacy bearer token when OAuth is rejected", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () => Effect.succeed("oauth-token"),
      fetch: async (_url, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        requests.push({ authorization });
        return authorization === "Bearer oauth-token"
          ? jsonResponse({ error: "bad token" }, { status: 401 })
          : jsonResponse(snapshot);
      },
    });

    const parsedSnapshot = yield* client.getSnapshot();

    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
    assert.strictEqual(requests[1]?.authorization, "Bearer legacy-token");
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
  }),
);

it.effect("cockpit client does not retry the legacy bearer token when OAuth is forbidden", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () => Effect.succeed("oauth-token"),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({ error: "forbidden" }, { status: 403 });
      },
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);

    assert.strictEqual(error.status, 403);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
  }),
);

it.effect("configured OAuth tokens are not sent to saved settings URLs", () =>
  Effect.gen(function* () {
    let oauthRequested = false;
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      requests.push({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return jsonResponse(snapshot);
    }) as typeof fetch;
    const client = makeJarvisClient({
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: false,
      getSettings: Effect.succeed({
        ...DEFAULT_SERVER_SETTINGS,
        jarvis: {
          ...DEFAULT_SERVER_SETTINGS.jarvis,
          apiBaseUrl: "https://attacker.example",
        },
      }),
      oauthAccessToken: () =>
        Effect.sync(() => {
          oauthRequested = true;
          return "oauth-token";
        }),
    });

    const parsedSnapshot = yield* client.getSnapshot().pipe(
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );

    assert.strictEqual(oauthRequested, false);
    assert.strictEqual(requests[0]?.url, "https://attacker.example/v1/cockpit/snapshot?sync=probe");
    assert.strictEqual(requests[0]?.authorization, null);
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
  }),
);

it.effect("configured OAuth tokens are sent to the default brain URL", () =>
  Effect.gen(function* () {
    let oauthRequested = false;
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url, init) => {
      requests.push({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return jsonResponse(snapshot);
    }) as typeof fetch;
    const client = makeJarvisClient({
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: false,
      oauthAccessToken: () =>
        Effect.sync(() => {
          oauthRequested = true;
          return "oauth-token";
        }),
    });

    const parsedSnapshot = yield* client.getSnapshot().pipe(
      Effect.ensuring(
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }),
      ),
    );

    assert.strictEqual(oauthRequested, true);
    assert.strictEqual(requests[0]?.url, "http://127.0.0.1:8791/v1/cockpit/snapshot?sync=probe");
    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
  }),
);

it("reports OAuth configured for the default brain URL", () => {
  const connection = resolveJarvisBrainConnection(
    {
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: false,
      jarvisOAuthAudience: "jarvis-brain",
      jarvisOAuthJarvisUser: "neil",
    },
    DEFAULT_SERVER_SETTINGS,
  );

  assert.strictEqual(connection.apiBaseUrl, "http://127.0.0.1:8791");
  assert.strictEqual(connection.oauthTokenConfigured, true);
  assert.strictEqual(connection.oauthTokenSource, "environment");
});

it("does not report OAuth configured when the effective brain URL cannot receive OAuth", () => {
  const connection = resolveJarvisBrainConnection(
    {
      jarvisCockpitEnabled: true,
      jarvisApiBaseUrl: undefined,
      jarvisApiToken: undefined,
      jarvisFixtureMode: false,
      jarvisOAuthAudience: "jarvis-brain",
      jarvisOAuthJarvisUser: "neil",
    },
    {
      ...DEFAULT_SERVER_SETTINGS,
      jarvis: {
        ...DEFAULT_SERVER_SETTINGS.jarvis,
        apiBaseUrl: "https://attacker.example",
      },
    },
  );

  assert.strictEqual(connection.oauthTokenConfigured, false);
});

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

    assert.deepStrictEqual(requests, ["http://jarvis.local:8787/v1/cockpit/snapshot?sync=probe"]);
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
        const requestUrl = new URL(String(url));
        if (requestUrl.pathname.endsWith("/requests") && requestUrl.searchParams.has("after")) {
          return jsonResponse({
            items: [
              {
                request_id: "input_2",
                session_ref: sessionRef,
                run_id: "run_1",
                kind: "input",
                status: "pending",
                title: "Need input",
                created_at: now,
                payload: {},
              },
            ],
            cursor: "input_2",
            has_more: false,
          });
        }
        if (requestUrl.pathname.endsWith("/requests")) {
          return jsonResponse({
            requests: [
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
            },
          ],
          cursor: "ckpt_1",
          has_more: false,
        });
      },
    });

    const sessionRequests = yield* client.getRequests(sessionRef);
    const pagedRequests = yield* client.getRequests(sessionRef, { after: "approval_1", limit: 50 });
    const checkpoints = yield* client.getCheckpoints(sessionRef);

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/requests",
    );
    assert.strictEqual(
      requests[1]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/requests?after=approval_1&limit=50",
    );
    assert.strictEqual(
      requests[2]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/checkpoints",
    );
    assert.strictEqual(sessionRequests.items[0]?.kind, "approval");
    assert.strictEqual(pagedRequests.items[0]?.kind, "input");
    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "ckpt_1");
    assert.strictEqual(checkpoints.has_more, false);
  }),
);

it.effect("cockpit client accepts documented checkpoint wire wrappers", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse({
          checkpoints: [
            {
              session_ref: sessionRef,
              checkpoint_id: "provider:ckpt_1",
              label: "before review fixes",
              provider: "codex",
              restored: false,
            },
          ],
        }),
    });

    const checkpoints = yield* client.getCheckpoints(sessionRef);

    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "provider:ckpt_1");
    assert.strictEqual(checkpoints.cursor, null);
    assert.strictEqual(checkpoints.has_more, false);
  }),
);

it.effect("cockpit client unwraps Jarvis session detail responses", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse({
          session,
          raw: {
            session_id: "sess_1",
          },
        }),
    });

    const parsedSession = yield* client.getSession(sessionRef);

    assert.strictEqual(parsedSession.session_ref, sessionRef);
    assert.strictEqual(parsedSession.title, "Codex implementation");
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
        if (String(url).includes("/checkpoints") && init?.method !== "POST") {
          return jsonResponse({ items: [], cursor: "ckpt_1", has_more: false });
        }
        return jsonResponse({ ok: true, cursor: "evt_2" });
      },
    });

    yield* client.getSessionEvents(sessionRef, { after: "evt_1", limit: 25 });
    yield* client.getCheckpoints(sessionRef, { after: "ckpt_1", limit: 10 });
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
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/checkpoints?after=ckpt_1&limit=10",
    );
    assert.strictEqual(
      requests[2]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/checkpoints/restore",
    );
    assert.strictEqual(requests[2]?.method, "POST");
    assert.match(requests[2]?.body ?? "", /ckpt_1/);
    assert.match(requests[2]?.body ?? "", /jarvis-cockpit/);
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
      run_id: "wrong_run",
    });
    yield* client.resumeRun("run_2", {
      prompt: "",
      run_id: "wrong_run",
    });
    const turnResult = yield* client.sendTurn(sessionRef, {
      prompt: "Keep going.",
    });

    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/work/start");
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/work/resume");
    assert.strictEqual(
      requests[3]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/turns",
    );
    assert.match(requests[0]?.body ?? "", /jarvis-cockpit/);
    assert.match(requests[1]?.body ?? "", /"run_id":"run_1"/);
    assert.strictEqual((requests[1]?.body ?? "").includes("wrong_run"), false);
    assert.match(requests[2]?.body ?? "", /"run_id":"run_2"/);
    assert.match(requests[2]?.body ?? "", /"prompt":"Continue from the current state\."/);
    assert.strictEqual((requests[2]?.body ?? "").includes("wrong_run"), false);
    assert.strictEqual(turnResult.ok, true);
    assert.strictEqual(turnResult.session?.session_ref, sessionRef);
  }),
);

it.effect("cockpit client validates work and leaves default repo selection to Jarvis", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; body: string | null }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: typeof init?.body === "string" ? init.body : null,
        });
        if (String(url).endsWith("/v1/work/validate")) {
          return jsonResponse({
            ok: true,
            api_version: "v1",
            schema_version: 1,
            validation: {
              can_start: true,
              source: "manual",
              operation: "start_next_work",
              repo: "roughcoder/jarvis",
              worker_id: "macbook-worker",
              engine: "codex",
              engines: ["codex"],
              engine_strategy: "single",
              landing_mode: "draft_pr",
              work_item: null,
              missing: [],
              missing_authority: [],
              reasons: [],
              notes: [],
            },
          });
        }
        return jsonResponse({ ok: true, cursor: "evt_2", session: { session_ref: sessionRef } });
      },
    });

    const validation = yield* client.validateWork({
      phrase: "Dogfood cockpit start.",
      source: "manual",
      branch_strategy: "auto",
    });
    yield* client.startWork({
      phrase: "Dogfood cockpit start.",
      source: "manual",
      branch_strategy: "auto",
    });
    yield* client.startWork({
      phrase: "Explicit repo wins.",
      source: "manual",
      repo: "roughcoder/jarvis",
      branch_strategy: "auto",
    });

    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/work/validate");
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/work/start");
    assert.strictEqual((requests[1]?.body ?? "").includes("roughcoder/jarvis-cockpit"), false);
    assert.match(requests[1]?.body ?? "", /jarvis-cockpit/);
    assert.match(requests[2]?.body ?? "", /"repo":"roughcoder\/jarvis"/);
    assert.strictEqual(validation.validation?.can_start, true);
  }),
);

it.effect("cockpit client posts Jarvis-owned archive intents", () =>
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
        return jsonResponse({ ok: true, cursor: "evt_archive" });
      },
    });

    yield* client.archiveSession(sessionRef, {
      idempotency_key: "cmd_archive_session",
    });
    yield* client.archiveRun("run_1", {
      idempotency_key: "cmd_archive_run",
    });

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/archive",
    );
    assert.strictEqual(requests[0]?.method, "POST");
    assert.match(requests[0]?.body ?? "", /cmd_archive_session/);
    assert.match(requests[0]?.body ?? "", /jarvis-cockpit/);
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/runs/run_1/archive");
    assert.match(requests[1]?.body ?? "", /cmd_archive_run/);
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

it.effect("cockpit client includes Jarvis missing-authority details in HTTP errors", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse(
          { error: { code: "forbidden", message: "missing authority: project.create" } },
          { status: 403 },
        ),
    });

    const error = yield* client.createProject({ name: "Nope" }).pipe(Effect.flip);
    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.status, 403);
    assert.match(error.message, /HTTP 403: missing authority: project\.create/);
  }),
);

it.effect("cockpit client preserves HTTP status for non-JSON error bodies", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        new Response("upstream unavailable", {
          status: 503,
          headers: { "content-type": "text/plain" },
        }),
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);
    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.status, 503);
    assert.match(error.responseBody ?? "", /upstream unavailable/);
  }),
);

it.effect("cockpit client normalizes empty run ids in session events", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse({
          items: [
            {
              event_id: "evt_1",
              sequence: 1,
              session_ref: sessionRef,
              run_id: "",
              type: "assistant.message",
              occurred_at: now,
              turn_id: "",
              message_id: "",
              data: {},
            },
          ],
          cursor: null,
          has_more: false,
        }),
    });

    const page = yield* client.getSessionEvents(sessionRef);

    assert.strictEqual(page.items[0]?.run_id, `session:${sessionRef}`);
  }),
);

it.effect("Jarvis health checks do not mint OAuth tokens for arbitrary URLs", () =>
  Effect.gen(function* () {
    let oauthRequested = false;
    const requests: Array<{ url: string; authorization: string | null }> = [];

    const result = yield* checkJarvisBrain({
      config: {
        jarvisCockpitEnabled: true,
        jarvisApiBaseUrl: new URL("http://jarvis.local:8787"),
        jarvisApiToken: undefined,
        jarvisFixtureMode: false,
      },
      settings: DEFAULT_SERVER_SETTINGS,
      apiBaseUrl: "https://attacker.example",
      oauthAccessToken: Effect.sync(() => {
        oauthRequested = true;
        return "oauth-token";
      }),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({ ok: true });
      },
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(oauthRequested, false);
    assert.strictEqual(requests[0]?.url, "https://attacker.example/v1/health");
    assert.strictEqual(requests[0]?.authorization, null);
  }),
);

it.effect("Jarvis health checks retry the legacy token after OAuth rejection", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];

    const result = yield* checkJarvisBrain({
      config: {
        jarvisCockpitEnabled: true,
        jarvisApiBaseUrl: new URL("http://jarvis.local:8787"),
        jarvisApiToken: "legacy-token",
        jarvisFixtureMode: false,
      },
      settings: DEFAULT_SERVER_SETTINGS,
      oauthAccessToken: Effect.succeed("oauth-token"),
      fetch: async (_url, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        requests.push({ authorization });
        return authorization === "Bearer oauth-token"
          ? jsonResponse({ error: "bad token" }, { status: 401 })
          : jsonResponse({ ok: true });
      },
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
    assert.strictEqual(requests[1]?.authorization, "Bearer legacy-token");
  }),
);

it.effect("Jarvis health checks do not retry the legacy token after OAuth is forbidden", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];

    const result = yield* checkJarvisBrain({
      config: {
        jarvisCockpitEnabled: true,
        jarvisApiBaseUrl: new URL("http://jarvis.local:8787"),
        jarvisApiToken: "legacy-token",
        jarvisFixtureMode: false,
      },
      settings: DEFAULT_SERVER_SETTINGS,
      oauthAccessToken: Effect.succeed("oauth-token"),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({ error: "forbidden" }, { status: 403 });
      },
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 403);
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0]?.authorization, "Bearer oauth-token");
  }),
);

it.effect("Jarvis health checks fall back to the legacy token when OAuth minting fails", () =>
  Effect.gen(function* () {
    const requests: Array<{ authorization: string | null }> = [];

    const result = yield* checkJarvisBrain({
      config: {
        jarvisCockpitEnabled: true,
        jarvisApiBaseUrl: new URL("http://jarvis.local:8787"),
        jarvisApiToken: "legacy-token",
        jarvisFixtureMode: false,
      },
      settings: DEFAULT_SERVER_SETTINGS,
      oauthAccessToken: Effect.fail(
        new JarvisClientError({
          operation: "jarvis.oauth",
          message: "OAuth minting failed.",
        }),
      ),
      fetch: async (_url, init) => {
        requests.push({
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return jsonResponse({ ok: true });
      },
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(requests[0]?.authorization, "Bearer legacy-token");
  }),
);
