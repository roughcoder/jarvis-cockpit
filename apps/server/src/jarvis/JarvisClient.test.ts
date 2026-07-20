import { assert, it } from "@effect/vitest";
import * as NodeBuffer from "node:buffer";
import {
  DEFAULT_SERVER_SETTINGS,
  JarvisProjectId,
  JarvisRequestId,
  JarvisWorkerId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import {
  checkJarvisBrain,
  JarvisClientError,
  makeJarvisCockpitClient,
  makeJarvisFixtureClient,
  makeJarvisClient,
  makeJarvisWorkerSessionClient,
  resolveJarvisBrainConnection,
  snapshotWithValidSessions,
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
        models: [
          { id: "gpt-5.5", label: "GPT-5.5" },
          { id: "gpt-5.6", label: "GPT-5.6" },
        ],
        default_model: "gpt-5.5",
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
    const fixtureSession = fixtureSnapshot.sessions.find(
      (session) => session.session_id === "sess_fixture_codex",
    );
    assert.strictEqual(fixtureSnapshot.api_version, "v1");
    assert.strictEqual(fixtureSnapshot.runs.length, 2);
    assert.ok(
      fixtureSnapshot.sessions.some(
        (session) => session.session_id === "sess_fixture_completed_codex",
      ),
    );
    assert.strictEqual(fixtureSession?.provider, "codex");

    const events = yield* client.getSessionEvents(fixtureSession?.session_ref ?? "");
    assert.strictEqual(events.items[1]?.type, "input.requested");

    const requests = yield* client.getRequests(fixtureSession?.session_ref ?? "");
    const checkpoints = yield* client.getCheckpoints(fixtureSession?.session_ref ?? "");
    assert.strictEqual(requests.items[0]?.kind, "input");
    assert.strictEqual(checkpoints.items[0]?.checkpoint_id, "ckpt_fixture_1");
  }),
);

it.effect("fixture client can expose connected workers without projects", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient({ emptyProjects: true });

    const fixtureSnapshot = yield* client.getSnapshot();
    const projects = yield* client.getProjects();

    assert.strictEqual(fixtureSnapshot.runs.length, 0);
    assert.strictEqual(fixtureSnapshot.sessions.length, 0);
    assert.strictEqual(fixtureSnapshot.workers.length, 2);
    assert.strictEqual(projects.length, 0);
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
    const withArchived = yield* client.getProjectThreads(project.id, { includeArchived: true });
    const detail = yield* client.getProjectThread(project.id, thread.thread_id);
    const unarchived = yield* client.unarchiveProjectThread(project.id, thread.thread_id);
    const afterUnarchive = yield* client.getProjectThreads(project.id);

    assert.strictEqual(
      beforeArchive.some((candidate) => candidate.thread_id === thread.thread_id),
      true,
    );
    assert.strictEqual(archived.thread_id, thread.thread_id);
    assert.strictEqual(archived.archived_at, now);
    assert.strictEqual(
      afterArchive.some((candidate) => candidate.thread_id === thread.thread_id),
      false,
    );
    assert.strictEqual(
      withArchived.some((candidate) => candidate.thread_id === thread.thread_id),
      true,
    );
    assert.strictEqual(detail.thread_id, thread.thread_id);
    assert.deepStrictEqual(detail.messages, []);
    assert.strictEqual(unarchived.archived_at, "");
    assert.strictEqual(
      afterUnarchive.some((candidate) => candidate.thread_id === thread.thread_id),
      true,
    );
  }),
);

it.effect("fixture client records project conversation workspace escalation", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const thread = yield* client.createProjectThread("jarvis-cockpit", {
      title: "Escalate me",
    });

    yield* client.sendProjectThreadTurn("jarvis-cockpit", thread.thread_id, {
      text: "Inspect runtime.",
      model: "gpt-5.6-sol",
      effort: "xhigh",
      speed: "priority",
      idempotency_key: "fixture-workspace-escalation",
      workspace: {
        repos: [{ name: "runtime", base_ref: "origin/main" }],
        engine: "codex",
      },
    });
    const detail = yield* client.getProjectThread("jarvis-cockpit", thread.thread_id);

    assert.strictEqual(detail.workspace?.engine, "codex");
    assert.strictEqual(detail.model, "gpt-5.6-sol");
    assert.strictEqual(detail.effort, "xhigh");
    assert.strictEqual(detail.speed, "priority");
    assert.strictEqual(detail.workspace?.worktrees[0]?.name, "runtime");
    assert.strictEqual(detail.workspace?.worktrees[0]?.base_ref, "origin/main");
  }),
);

it.effect("fixture client gives repeated project turns distinct durable message identity", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();
    const thread = yield* client.createProjectThread("jarvis-cockpit", {
      title: "Repeated prompts",
    });

    // The same prompt twice is the case that used to collapse: with no message_id and a frozen
    // observed_at the client replay key was byte-identical, so the adapter deduplicated the
    // second turn out of the timeline entirely.
    yield* client.sendProjectThreadTurn("jarvis-cockpit", thread.thread_id, {
      text: "Say the same thing.",
      idempotency_key: "fixture-repeat-1",
    });
    yield* client.sendProjectThreadTurn("jarvis-cockpit", thread.thread_id, {
      text: "Say the same thing.",
      idempotency_key: "fixture-repeat-2",
    });
    const detail = yield* client.getProjectThread("jarvis-cockpit", thread.thread_id);

    const messageIds = detail.messages.map((message) => message.message_id);
    assert.strictEqual(detail.messages.length, 4);
    assert.strictEqual(new Set(messageIds).size, 4, "every fixture message needs a unique id");
    assert.isTrue(
      messageIds.every((messageId) => typeof messageId === "string" && messageId.length > 0),
    );

    // Ordering must come from real identity, not a content hash tiebreak.
    const sequences = detail.messages.map((message) => message.sequence ?? -1);
    assert.deepStrictEqual(
      sequences,
      [...sequences].sort((left, right) => left - right),
    );
    assert.strictEqual(new Set(sequences).size, 4);

    const observedAt = detail.messages.map((message) => Date.parse(message.observed_at));
    assert.deepStrictEqual(
      observedAt,
      [...observedAt].sort((left, right) => left - right),
    );
    assert.strictEqual(new Set(observedAt).size, 4, "timestamps must advance, not tie");
  }),
);

it.effect("cockpit client accepts project conversation detail and archive response shapes", () =>
  Effect.gen(function* () {
    const workspace = {
      worker_id: "macbook-worker",
      session_id: "conv_thread_1",
      engine: "codex",
      workspace_id: "jarvis-thread-1",
      root_label: "jarvis-thread-1",
      cwd_label: "jarvis-thread-1",
      status: "ready",
      provision_phase: "running",
      worktrees: [
        {
          name: "runtime",
          repo: "roughcoder/jarvis",
          path_label: "runtime",
          branch: "jarvis/jarvis-thread-runtime",
          base_ref: "origin/main",
          status: "ready",
          provision_phase: "running",
        },
      ],
    };
    const thread = {
      thread_id: "thread_1",
      project_id: "jarvis",
      session_id: "project:jarvis:orchestrator:thread_1",
      title: "Archive me",
      created_at: now,
      updated_at: now,
      created_by: "fixture",
      archived_at: "",
      archived_by: "",
      archive_reason: "",
      workspace,
    };
    const detail = {
      api_version: "v1",
      schema_version: 1,
      project_id: "jarvis",
      thread: {
        ...thread,
        messages: [
          {
            role: "user",
            peer_id: "neil",
            content: "Hello",
            observed_at: now,
          },
          {
            role: "assistant",
            peer_id: "jarvis",
            content: "Hi",
            observed_at: now,
          },
        ],
      },
    };
    const responses = [
      { api_version: "v1", schema_version: 1, project_id: "jarvis", threads: [thread] },
      detail,
      { thread },
      thread,
      { api_version: "v1", schema_version: 1, threads: [thread] },
      { thread: { ...thread, archived_at: "" } },
    ];
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly body: { readonly metadata?: unknown };
    }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : {},
        });
        return jsonResponse(responses.shift());
      },
    });

    const listed = yield* client.getProjectThreads("jarvis", { includeArchived: true });
    const opened = yield* client.getProjectThread("jarvis", "thread_1");
    const envelope = yield* client.archiveProjectThread("jarvis", "thread_1");
    const bare = yield* client.archiveProjectThread("jarvis", "thread_1");
    const list = yield* client.archiveProjectThread("jarvis", "thread_1");
    const unarchived = yield* client.unarchiveProjectThread("jarvis", "thread_1");

    assert.strictEqual(listed[0]?.thread_id, "thread_1");
    assert.strictEqual(listed[0]?.workspace?.worktrees[0]?.base_ref, "origin/main");
    assert.strictEqual(opened.messages[0]?.content, "Hello");
    assert.strictEqual(opened.workspace?.engine, "codex");
    assert.strictEqual(envelope.thread_id, "thread_1");
    assert.strictEqual(bare.thread_id, "thread_1");
    assert.strictEqual(bare.workspace?.workspace_id, "jarvis-thread-1");
    assert.strictEqual(list.thread_id, "thread_1");
    assert.strictEqual(unarchived.thread_id, "thread_1");
    assert.strictEqual(unarchived.workspace?.status, "ready");
    assert.deepStrictEqual(
      requests.map((request) => [request.method, request.url]),
      [
        ["GET", "http://jarvis.local:8787/v1/projects/jarvis/threads?include_archived=true"],
        ["GET", "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1"],
        ["POST", "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive"],
        ["POST", "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive"],
        ["POST", "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/archive"],
        ["POST", "http://jarvis.local:8787/v1/projects/jarvis/threads/thread_1/unarchive"],
      ],
    );
    assert.deepStrictEqual(requests[2]?.body.metadata, { surface: "jarvis-cockpit" });
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
      idempotencyKey: string | null;
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
          idempotencyKey: headers.get("x-idempotency-key"),
          bodyKind,
          body,
        });
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/files") && (init?.method ?? "GET") === "GET") {
          const query = new URL(String(url)).searchParams.get("query") ?? undefined;
          return jsonResponse({
            api_version: "v1",
            schema_version: 1,
            project_id: "dogfood",
            ...(query === undefined ? {} : { query }),
            files: [{ doc_id: "spec-1", filename: "spec.md", title: "Spec", retracted: false }],
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
    const filesResponse = yield* client.getProjectFilesResponse("dogfood", {
      includeRetracted: true,
      query: "Launch spec",
    });
    const files = filesResponse.files;
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
        [
          "GET",
          "http://jarvis.local:8787/v1/projects/dogfood/files?include_retracted=true&query=Launch+spec",
        ],
        ["POST", "http://jarvis.local:8787/v1/projects/dogfood/files"],
        ["DELETE", "http://jarvis.local:8787/v1/projects/dogfood/files/spec-1"],
      ],
    );
    assert.strictEqual(filesResponse.query, "Launch spec");
    assert.strictEqual(files[0]?.doc_id, "spec-1");
    assert.strictEqual(files[0]?.filename, "spec.md");
    assert.strictEqual(requests[0]?.bodyKind, "json");
    assert.strictEqual(
      (requests[0]?.body as { metadata?: { surface?: string } } | undefined)?.metadata?.surface,
      "jarvis-cockpit",
    );
    assert.strictEqual(requests[5]?.bodyKind, "form");
    assert.strictEqual(requests[5]?.contentType, null);
    assert.strictEqual(requests[5]?.idempotencyKey, "upload-spec-1");
    assert.deepStrictEqual(requests[5]?.body, {
      title: "Spec",
      artifact_type: "spec",
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
      model: "gpt-5.6",
      effort: "high",
      speed: "standard",
      idempotency_key: "turn-1",
      workspace: {
        repos: [{ name: "runtime", base_ref: "origin/main" }],
        engine: "codex",
      },
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.text, "Project reply");
    assert.strictEqual(result.events[0]?.event, "thread.reply");
    assert.deepStrictEqual(requests[0]?.body, {
      text: "What changed?",
      model: "gpt-5.6",
      effort: "high",
      speed: "standard",
      idempotency_key: "turn-1",
      workspace: {
        repos: [{ name: "runtime", base_ref: "origin/main" }],
        engine: "codex",
      },
      metadata: { surface: "jarvis-cockpit" },
    });
  }),
);

it.effect("cockpit client calls conversation-scoped project thread control endpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const execution = {
      available: true,
      status: "running",
      active_turn: null,
      pending_requests: [],
      supported_controls: ["turn", "input", "approval", "interrupt", "stop"],
      supports: { steer: false, queue: false },
      diagnostic: null,
    };
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const action = new URL(String(url)).pathname.split("/").at(-1);
        return jsonResponse({
          ok: true,
          api_version: "v1",
          schema_version: 1,
          project_id: "dogfood/review",
          thread_id: "thread #1",
          control:
            action === "interrupt"
              ? { action, accepted: true, turn_id: "turn-1" }
              : { action, accepted: true, request_id: `request-${action}` },
          execution,
        });
      },
    });

    yield* client.respondProjectThreadApproval("dogfood/review", "thread #1", {
      request_id: JarvisRequestId.make("request-approval"),
      decision: "approved",
      idempotency_key: "approval-command",
    });
    yield* client.respondProjectThreadInput("dogfood/review", "thread #1", {
      request_id: JarvisRequestId.make("request-input"),
      answers: { choice: ["ship"] },
      text: "Ship it",
      idempotency_key: "input-command",
    });
    yield* client.interruptProjectThread("dogfood/review", "thread #1", {
      turn_id: "turn-1",
      idempotency_key: "interrupt-command",
    });

    assert.deepStrictEqual(requests, [
      {
        url: "http://jarvis.local:8787/v1/projects/dogfood%2Freview/threads/thread%20%231/approval",
        method: "POST",
        body: {
          request_id: "request-approval",
          decision: "approved",
          idempotency_key: "approval-command",
        },
      },
      {
        url: "http://jarvis.local:8787/v1/projects/dogfood%2Freview/threads/thread%20%231/input",
        method: "POST",
        body: {
          request_id: "request-input",
          answers: { choice: ["ship"] },
          text: "Ship it",
          idempotency_key: "input-command",
        },
      },
      {
        url: "http://jarvis.local:8787/v1/projects/dogfood%2Freview/threads/thread%20%231/interrupt",
        method: "POST",
        body: {
          turn_id: "turn-1",
          idempotency_key: "interrupt-command",
        },
      },
    ]);
  }),
);

it.effect("cockpit client preserves project thread control HTTP errors", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        jsonResponse(
          { error: { code: "request_not_pending", message: "Approval is no longer pending" } },
          { status: 409 },
        ),
    });

    const error = yield* client
      .respondProjectThreadApproval("dogfood", "thread-1", {
        request_id: JarvisRequestId.make("request-approval"),
        decision: "approved",
        idempotency_key: "approval-command",
      })
      .pipe(Effect.flip);

    assert.strictEqual(error.operation, "projects.threads.approval");
    assert.strictEqual(error.status, 409);
    assert.match(error.message, /409/u);
  }),
);

it.effect("cockpit client fails project turns when SSE reports a turn error", () =>
  Effect.gen(function* () {
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async () =>
        new Response(
          [
            'event: thread.turn.started\ndata: {"type":"thread.turn.started","payload":{"thread_id":"thread-1"}}',
            'data: {"type":"thread.turn.error","payload":{"error":{"code":"memory_unavailable","message":"orchestrator turn failed","recoverable":true},"private_detail":"must not leak"}}',
            "",
          ].join("\n\n"),
          { headers: { "content-type": "text/event-stream" } },
        ),
    });

    const error = yield* client
      .sendProjectThreadTurn("dogfood", "thread-1", {
        text: "Continue",
        idempotency_key: "turn-error-redaction",
      })
      .pipe(Effect.flip);

    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.operation, "projects.threads.turn");
    assert.match(error.message, /memory_unavailable/);
    assert.match(error.message, /orchestrator turn failed/);
    assert.ok(!/private_detail|must not leak/u.test(error.message));
    assert.strictEqual(error.responseBody, null);
  }),
);

it.effect("cockpit client renames project threads with a PATCH request", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return jsonResponse({
          ok: true,
          project_id: "dogfood",
          thread: {
            thread_id: "thread-1",
            project_id: "dogfood",
            session_id: "project:dogfood:orchestrator:thread-1",
            title: "Renamed thread",
            status: "completed",
            ended_reason: "completed",
            created_at: now,
            updated_at: now,
            created_by: "neil",
            workspace: {
              engine: "codex",
              status: "ready",
              provision_phase: "running",
              worktrees: [],
            },
          },
        });
      },
    });

    const result = yield* client.renameProjectThread("dogfood", "thread-1", {
      title: "Renamed thread",
      idempotency_key: "rename-1",
    });

    assert.strictEqual(result.title, "Renamed thread");
    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.ended_reason, "completed");
    assert.strictEqual(result.workspace?.engine, "codex");
    assert.deepStrictEqual(requests[0], {
      url: "http://jarvis.local:8787/v1/projects/dogfood/threads/thread-1",
      method: "PATCH",
      body: {
        title: "Renamed thread",
        idempotency_key: "rename-1",
        metadata: { surface: "jarvis-cockpit" },
      },
    });
  }),
);

it.effect("cockpit client attaches bearer token and selects the snapshot sync mode", () =>
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
    yield* client.getSnapshot({ sync: "probe" });
    assert.strictEqual(requests[0]?.url, "http://jarvis.local:8787/v1/cockpit/snapshot?sync=fast");
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/cockpit/snapshot?sync=probe");
    assert.strictEqual(requests[0]?.authorization, "Bearer worker-token");
    assert.strictEqual(parsedSnapshot.runs[0]?.run_id, "run_1");
    assert.strictEqual(parsedSnapshot.runs[0]?.objective, "Do the work");
    assert.deepStrictEqual(parsedSnapshot.workers[0]?.engines[0]?.models, [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.6", label: "GPT-5.6" },
    ]);
    assert.strictEqual(parsedSnapshot.workers[0]?.engines[0]?.default_model, "gpt-5.5");
  }),
);

it.effect("cockpit client sends idempotency keys when pruning worker worktrees", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return jsonResponse({
          ok: true,
          worker_id: "macbook-worker",
          reclamation: { records: 0, events: 0, worktrees: 1, bytes: 4096 },
          pruned: [{ name: "old", bytes: 4096 }],
          refused: [],
          worktree_inventory: {
            root: "/tmp/worker/worktrees",
            count: 0,
            disk_bytes: 0,
            stale_count: 0,
            orphan_count: 0,
            status: "measured",
          },
        });
      },
    });

    const response = yield* client.pruneWorkerWorktrees({
      workerId: "macbook-worker",
      idempotencyKey: "prune-1",
    });

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/workers/macbook-worker/worktrees/prune",
    );
    assert.strictEqual(requests[0]?.method, "POST");
    assert.deepStrictEqual(requests[0]?.body, { idempotency_key: "prune-1" });
    assert.strictEqual(response.reclamation?.worktrees, 1);
    assert.strictEqual(response.worktree_inventory?.count, 0);
  }),
);

it.effect("cockpit client calls retention plan, prune, and settings endpoints", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (String(url).endsWith("/v1/retention/prune")) {
          return jsonResponse({
            ok: true,
            deleted: { archived: 3, chat: 2, tree: 1 },
            child_runs: 1,
            bytes_reclaimed: 40_009_728,
            kept: 42,
          });
        }
        if (init?.method === "PUT") {
          return jsonResponse({
            ok: true,
            settings: {
              enabled: true,
              interval_s: 21_600,
              archived_ttl_days: 14,
              chat_ttl_days: 10,
              tree_ttl_days: 7,
            },
            source: { chat_ttl_days: "override" },
          });
        }
        if (String(url).endsWith("/v1/retention/settings")) {
          return jsonResponse({
            ok: true,
            settings: {
              enabled: true,
              interval_s: 21_600,
              archived_ttl_days: 14,
              chat_ttl_days: 7,
              tree_ttl_days: 7,
            },
            source: { enabled: "env" },
          });
        }
        return jsonResponse({
          ok: true,
          plan: {
            classes: [{ name: "archived", ttl_days: 14, count: 3, bytes: 24_576_000 }],
            total_count: 3,
            total_bytes: 24_576_000,
            kept: 42,
          },
          auto: {
            enabled: true,
            interval_s: 21_600,
            last_run_at: null,
            last_result: null,
          },
        });
      },
    });

    const plan = yield* client.getRetentionPlan();
    const settings = yield* client.getRetentionSettings();
    const updated = yield* client.updateRetentionSettings({
      idempotency_key: "settings-1",
      chat_ttl_days: 10,
      tree_ttl_days: null,
    });
    const pruned = yield* client.pruneRetention({ idempotency_key: "prune-1" });

    assert.strictEqual(plan.plan?.total_count, 3);
    assert.strictEqual(settings.settings.chat_ttl_days, 7);
    assert.strictEqual(updated.settings.chat_ttl_days, 10);
    assert.strictEqual(pruned.deleted.tree, 1);
    assert.deepStrictEqual(
      requests.map((request) => [request.method, request.url, request.body]),
      [
        ["GET", "http://jarvis.local:8787/v1/retention/plan", null],
        ["GET", "http://jarvis.local:8787/v1/retention/settings", null],
        [
          "PUT",
          "http://jarvis.local:8787/v1/retention/settings",
          {
            idempotency_key: "settings-1",
            chat_ttl_days: 10,
            tree_ttl_days: null,
          },
        ],
        ["POST", "http://jarvis.local:8787/v1/retention/prune", { idempotency_key: "prune-1" }],
      ],
    );
  }),
);

it.effect("fixture client serves deterministic retention data and editable settings", () =>
  Effect.gen(function* () {
    const client = makeJarvisFixtureClient();

    const plan = yield* client.getRetentionPlan();
    const pruned = yield* client.pruneRetention({ idempotency_key: "fixture-prune" });
    const updated = yield* client.updateRetentionSettings({
      idempotency_key: "settings-1",
      chat_ttl_days: 0,
    });
    const disabledPlan = yield* client.getRetentionPlan();
    const reset = yield* client.updateRetentionSettings({
      idempotency_key: "settings-2",
      chat_ttl_days: null,
    });

    assert.strictEqual(plan.plan?.total_count, 6);
    assert.strictEqual(plan.settings?.archived_ttl_days, 14);
    assert.deepStrictEqual(pruned.deleted, { archived: 3, chat: 2, tree: 1 });
    assert.strictEqual(updated.source.chat_ttl_days, "override");
    assert.strictEqual(
      disabledPlan.plan?.classes.find((row) => row.name === "chat")?.disabled,
      true,
    );
    assert.strictEqual(disabledPlan.plan?.total_count, 4);
    assert.strictEqual(reset.settings.chat_ttl_days, 7);
    assert.strictEqual(reset.source.chat_ttl_days, "env");
  }),
);

it.effect("cockpit client incrementally reads authenticated SSE frames", () =>
  Effect.gen(function* () {
    const requests: Array<{ url: string; accept: string | null; authorization: string | null }> =
      [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "worker-token",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          accept: new Headers(init?.headers).get("accept"),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'id: cursor-1\nevent: snapshot\ndata: {"cursor":"cursor-1","type":"snapshot","payload":{}}\n\n',
              ),
            );
            controller.close();
          },
        });
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      },
    });

    const events = yield* Stream.runCollect(client.streamCockpitEvents());

    assert.deepStrictEqual(
      [...events],
      [
        {
          type: "snapshot",
          cursor: "cursor-1",
          payload: {},
          authoritative: true,
          malformed: false,
        },
      ],
    );
    assert.deepStrictEqual(requests, [
      {
        url: "http://jarvis.local:8787/v1/cockpit/events?sync=fast",
        accept: "text/event-stream",
        authorization: "Bearer worker-token",
      },
    ]);
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

it.effect("cockpit client times out JSON requests that never settle", () =>
  Effect.gen(function* () {
    let requestSignal: AbortSignal | null | undefined;
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      requestTimeoutMs: 10,
      fetch: async (_url, init) => {
        requestSignal = init?.signal;
        return await new Promise<Response>(() => undefined);
      },
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);

    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.operation, "cockpit.snapshot");
    assert.strictEqual(error.status, null);
    assert.strictEqual(error.responseBody, null);
    assert.match(error.message, /timed out after 10 ms/u);
    assert.strictEqual(requestSignal?.aborted, true);
  }),
);

it.effect("cockpit client gives an auth retry one shared JSON request timeout", () =>
  Effect.gen(function* () {
    const requestSignals: AbortSignal[] = [];
    const authorizations: Array<string | null> = [];
    const client = makeJarvisCockpitClient({
      baseUrl: new URL("http://jarvis.local:8787"),
      token: "legacy-token",
      tokenProvider: () => Effect.succeed("oauth-token"),
      requestTimeoutMs: 10,
      fetch: async (_url, init) => {
        const signal = init?.signal;
        if (signal !== undefined && signal !== null) {
          requestSignals.push(signal);
        }
        const authorization = new Headers(init?.headers).get("authorization");
        authorizations.push(authorization);
        if (authorization === "Bearer oauth-token") {
          return jsonResponse({ error: "bad token" }, { status: 401 });
        }
        return await new Promise<Response>(() => undefined);
      },
    });

    const error = yield* client.getSnapshot().pipe(Effect.flip);

    assert.match(error.message, /timed out after 10 ms/u);
    assert.deepStrictEqual(authorizations, ["Bearer oauth-token", "Bearer legacy-token"]);
    assert.strictEqual(requestSignals.length, 2);
    assert.strictEqual(requestSignals[0], requestSignals[1]);
    assert.strictEqual(requestSignals[1]?.aborted, true);
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
    assert.strictEqual(requests[0]?.url, "https://attacker.example/v1/cockpit/snapshot?sync=fast");
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
    assert.strictEqual(requests[0]?.url, "http://127.0.0.1:8791/v1/cockpit/snapshot?sync=fast");
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

it.effect("cockpit client sends lifecycle delete and close requests", () =>
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
        return jsonResponse({
          ok: true,
          deleted: true,
          reclamation: {
            records: 1,
            events: 2,
            worktrees: 1,
            bytes: 4096,
          },
        });
      },
    });

    const sessionDelete = yield* client.deleteSession(sessionRef, {
      idempotency_key: "cmd_delete_session",
    });
    yield* client.deleteRun("run_1", {
      idempotency_key: "cmd_delete_run",
    });
    yield* client.closeSession(sessionRef, {
      idempotency_key: "cmd_close_session",
    });

    assert.strictEqual(
      requests[0]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1",
    );
    assert.strictEqual(requests[0]?.method, "DELETE");
    assert.match(requests[0]?.body ?? "", /cmd_delete_session/);
    assert.strictEqual(requests[1]?.url, "http://jarvis.local:8787/v1/runs/run_1");
    assert.strictEqual(requests[1]?.method, "DELETE");
    assert.match(requests[1]?.body ?? "", /cmd_delete_run/);
    assert.strictEqual(
      requests[2]?.url,
      "http://jarvis.local:8787/v1/sessions/sessref_macbook-worker_sess_1/close",
    );
    assert.strictEqual(requests[2]?.method, "POST");
    assert.match(requests[2]?.body ?? "", /cmd_close_session/);
    assert.strictEqual(sessionDelete.reclamation.worktrees, 1);
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

it.effect("cockpit client decodes empty ids in session events as absent", () =>
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

    // Absent rather than a fabricated `session:<ref>` run id: the event genuinely
    // is not tied to a run, and inventing one hid that from every consumer.
    assert.strictEqual(page.items[0]?.run_id, undefined);
    assert.strictEqual(page.items[0]?.turn_id, undefined);
    assert.strictEqual(page.items[0]?.message_id, undefined);
  }),
);

it.effect("contract failures name the offending field and keep the payload", () =>
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
              run_id: "run_1",
              type: "assistant.message",
              occurred_at: now,
              // `sequence` must be a non-negative int; this is the malformed field.
              data: {},
            },
            {
              event_id: "evt_2",
              sequence: -5,
              session_ref: sessionRef,
              run_id: "run_1",
              type: "assistant.message",
              occurred_at: now,
              data: { api_key: "super-secret-value" },
            },
          ],
          cursor: null,
          has_more: false,
        }),
    });

    const error = yield* Effect.flip(client.getSessionEvents(sessionRef));

    assert.ok(error instanceof JarvisClientError);
    assert.strictEqual(error.operation, "sessions.events");
    // The schema issue must name the field path, not just "did not match".
    assert.ok(error.schemaIssue !== null);
    assert.ok(error.schemaIssue.includes("sequence"), error.schemaIssue);
    assert.ok(error.message.includes("sequence"), error.message);
    // The payload is retained as evidence, with secrets redacted.
    assert.ok(error.payloadExcerpt !== null);
    assert.ok(error.payloadExcerpt.includes("evt_2"));
    assert.ok(!error.payloadExcerpt.includes("super-secret-value"), error.payloadExcerpt);
    assert.ok(error.payloadExcerpt.includes("<redacted>"));
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

it.effect("snapshotWithValidSessions drops only individually-invalid session rows", () =>
  Effect.gen(function* () {
    const malformed = { ...session, run_id: "" };
    const sanitized = yield* snapshotWithValidSessions({
      ...snapshot,
      sessions: [session, malformed],
    });
    assert.isNotNull(sanitized);
    if (sanitized === null) {
      assert.fail("Expected malformed sessions to produce a sanitized snapshot.");
    }
    assert.strictEqual(sanitized.dropped, 1);
    const kept = (sanitized.candidate as { sessions: ReadonlyArray<unknown> }).sessions;
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0], session);
  }),
);

it.effect("snapshotWithValidSessions leaves fully-valid snapshots untouched", () =>
  Effect.gen(function* () {
    assert.isNull(yield* snapshotWithValidSessions(snapshot));
    assert.isNull(yield* snapshotWithValidSessions(null));
    assert.isNull(yield* snapshotWithValidSessions({ ...snapshot, sessions: "nope" }));
  }),
);
