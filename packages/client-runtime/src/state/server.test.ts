import {
  JarvisProjectId,
  JarvisProjectThreadId,
  type JarvisProjectThreadDetail,
  type ServerConfig,
  type ServerLifecycleWelcomePayload,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { THREAD_DETAIL_RETENTION } from "./retention.ts";
import {
  applyJarvisProjectThreadStreamItem,
  applyServerConfigProjection,
  createServerEnvironmentAtoms,
  projectServerWelcome,
} from "./server.ts";

const CONFIG = {
  availableEditors: [],
  issues: [],
  keybindings: {},
  keybindingsConfigPath: null,
  observability: null,
  providers: [],
  settings: {},
} as unknown as ServerConfig;

const THREAD: JarvisProjectThreadDetail = {
  thread_id: JarvisProjectThreadId.make("thread-1"),
  project_id: JarvisProjectId.make("project-1"),
  session_id: "project:project-1:orchestrator:thread-1",
  title: "Conversation",
  created_at: "2026-07-12T10:00:00.000Z",
  updated_at: "2026-07-12T10:00:00.000Z",
  created_by: "operator",
  messages: [
    {
      role: "user",
      peer_id: "operator",
      content: "Hello",
      observed_at: "2026-07-12T10:00:00.000Z",
    },
  ],
};

describe("server state projection", () => {
  it("exposes environment-scoped project conversation control commands", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const server = createServerEnvironmentAtoms(runtime, {
      initialConfigValueAtom: () => Atom.make<ServerConfig | null>(null),
    });

    expect(server.respondJarvisProjectThreadApproval.label).toBe(
      "environment-data:server:respond-jarvis-project-thread-approval",
    );
    expect(server.respondJarvisProjectThreadInput.label).toBe(
      "environment-data:server:respond-jarvis-project-thread-input",
    );
    expect(server.interruptJarvisProjectThread.label).toBe(
      "environment-data:server:interrupt-jarvis-project-thread",
    );
  });

  it("applies every config category to the projected snapshot", () => {
    const snapshot = applyServerConfigProjection(Option.none(), {
      version: 1,
      type: "snapshot",
      config: CONFIG,
    });
    const settings = { ...CONFIG.settings };
    const projected = applyServerConfigProjection(snapshot, {
      version: 1,
      type: "settingsUpdated",
      payload: { settings },
    });

    const result = Option.getOrThrow(projected);
    expect(result.config.settings).toBe(settings);
    expect(result.latestEvent.type).toBe("settingsUpdated");
  });

  it("retains welcome when a ready event follows in the same stream chunk", () => {
    const welcome = {
      environment: {} as ServerLifecycleWelcomePayload["environment"],
      cwd: "/repo",
      projectName: "repo",
    } as ServerLifecycleWelcomePayload;
    const [afterWelcome] = projectServerWelcome(Option.none(), {
      type: "welcome",
      payload: welcome,
    });
    const [afterReady, emitted] = projectServerWelcome(afterWelcome, {
      type: "ready",
      payload: {},
    });

    expect(Option.getOrThrow(afterReady)).toBe(welcome);
    expect(emitted).toEqual([]);
  });

  it("appends new project-thread messages while deduplicating a replayed optimistic echo", () => {
    const next = applyJarvisProjectThreadStreamItem(THREAD, {
      kind: "messages-appended",
      messages: [
        THREAD.messages[0]!,
        {
          role: "assistant",
          peer_id: "jarvis",
          content: "Hi there",
          observed_at: "2026-07-12T10:00:01.000Z",
        },
      ],
    });

    expect(next?.messages.map((message) => message.content)).toEqual(["Hello", "Hi there"]);
  });

  it("replaces a stale project-thread transcript with the reconnect snapshot", () => {
    const stale = {
      ...THREAD,
      messages: [...THREAD.messages, { ...THREAD.messages[0]!, content: "stale" }],
    };
    const resynchronized = applyJarvisProjectThreadStreamItem(stale, {
      kind: "snapshot",
      thread: THREAD,
    });

    expect(resynchronized).toBe(THREAD);
    expect(resynchronized?.messages).toEqual(THREAD.messages);
  });

  it("front-trims appended project-thread history to the shared message limit", () => {
    const current = {
      ...THREAD,
      messages: Array.from({ length: THREAD_DETAIL_RETENTION.messages }, (_, index) => ({
        role: "assistant",
        peer_id: "jarvis",
        content: `message-${index}`,
        observed_at: `2026-07-12T10:${String(index).padStart(2, "0")}:00.000Z`,
      })),
    } as JarvisProjectThreadDetail;
    const next = applyJarvisProjectThreadStreamItem(current, {
      kind: "messages-appended",
      messages: [
        {
          role: "assistant",
          peer_id: "jarvis",
          content: `message-${THREAD_DETAIL_RETENTION.messages}`,
          observed_at: "2026-07-12T18:20:00.000Z",
        },
      ],
    });

    expect(next?.messages).toHaveLength(THREAD_DETAIL_RETENTION.messages);
    expect(next?.messages[0]?.content).toBe("message-1");
    expect(next?.messages.at(-1)?.content).toBe(`message-${THREAD_DETAIL_RETENTION.messages}`);
  });
});
