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
  applyJarvisProjectThreadTurnStreamItem,
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
    expect(server.jarvisProjectThreadTurnStream).toBeTypeOf("function");
  });

  it("accumulates project-turn events before exposing the terminal result", () => {
    const afterStarted = applyJarvisProjectThreadTurnStreamItem(null, {
      kind: "event",
      event: {
        event: "thread.turn.started",
        data: { type: "thread.turn.started", payload: { turn_id: "turn-1" } },
      },
    });
    const afterDelta = applyJarvisProjectThreadTurnStreamItem(afterStarted, {
      kind: "event",
      event: {
        event: "thread.delta",
        data: { type: "thread.delta", payload: { delta: "Hel" } },
      },
    });
    const afterReply = applyJarvisProjectThreadTurnStreamItem(afterDelta, {
      kind: "event",
      event: {
        event: "thread.reply",
        data: { type: "thread.reply", payload: { reply: "Hello" } },
      },
    });
    expect(afterReply).toMatchObject({
      phase: "streaming",
      text: "Hello",
      events: [
        { event: "thread.turn.started" },
        { event: "thread.delta" },
        { event: "thread.reply" },
      ],
    });

    const result = { ok: true, text: "Hello", events: afterReply.events };
    expect(
      applyJarvisProjectThreadTurnStreamItem(afterReply, { kind: "completed", result }),
    ).toEqual({ phase: "completed", text: "Hello", events: result.events, result, error: null });
  });

  it("preserves partial project-turn progress when a terminal failure arrives", () => {
    const streaming = applyJarvisProjectThreadTurnStreamItem(null, {
      kind: "event",
      event: { event: "tool.call", data: { name: "search" } },
    });
    expect(
      applyJarvisProjectThreadTurnStreamItem(streaming, {
        kind: "failed",
        error: { message: "provider stopped" },
      }),
    ).toMatchObject({
      phase: "failed",
      events: streaming.events,
      error: "provider stopped",
    });
  });

  it("bounds retained project-turn frames while preserving accumulated reply text", () => {
    let state: ReturnType<typeof applyJarvisProjectThreadTurnStreamItem> | null = null;
    for (let index = 0; index < 520; index += 1) {
      state = applyJarvisProjectThreadTurnStreamItem(state, {
        kind: "event",
        event: {
          event: "thread.delta",
          data: { type: "thread.delta", payload: { delta: "x" }, sequence: index },
        },
      });
    }

    const finalState = state!;
    expect(finalState.events).toHaveLength(512);
    expect(finalState.text).toHaveLength(520);
    expect(finalState.events[0]?.data).toMatchObject({ sequence: 8 });
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
