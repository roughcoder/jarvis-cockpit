import { assert, it } from "@effect/vitest";
import {
  ApprovalRequestId,
  CheckpointRef,
  CommandId,
  type JarvisRestoreCheckpointInput,
  type JarvisStartWorkInput,
  type JarvisUserInputInput,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { makeJarvisFixtureClient } from "./JarvisClient.ts";
import { dispatchJarvisCommand } from "./JarvisDispatch.ts";

const now = "2026-07-01T12:00:00+00:00";
const jarvisThreadId = ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex");

it.effect("routes first draft turns to Jarvis work start", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return Effect.succeed({ ok: true, cursor: "evt_start" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Build the cockpit dashboard.",
          attachments: [],
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "codex",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project_1"),
            title: "Cockpit dashboard",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "codex",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "jarvis/cockpit",
            worktreePath: null,
            createdAt: now,
          },
          prepareWorktree: {
            projectCwd: "/Users/neilbarton/Development/jarvis",
            baseBranch: "main",
            branch: "jarvis/cockpit",
          },
        },
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(capturedStartWork?.prompt, "Build the cockpit dashboard.");
    assert.strictEqual(capturedStartWork?.title, "Cockpit dashboard");
    assert.strictEqual(capturedStartWork?.engine, "codex");
    assert.strictEqual(capturedStartWork?.base_ref, "main");
    assert.strictEqual(capturedStartWork?.branch, "jarvis/cockpit");
  }),
);

it.effect("rejects failed Jarvis control results before returning a dispatch receipt", () =>
  Effect.gen(function* () {
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: () =>
        Effect.succeed({
          ok: false,
          error: {
            code: "session_active" as const,
            message: "Session already has an active turn.",
            recoverable: true,
          },
        }),
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd_start"),
          threadId: jarvisThreadId,
          message: {
            messageId: MessageId.make("msg_user"),
            role: "user",
            text: "Continue.",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("Jarvis rejected thread.turn.start"));
      assert.ok(exit.cause.toString().includes("active turn"));
    }
  }),
);

it.effect("rejects Jarvis turn attachments instead of dropping them", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client: makeJarvisFixtureClient(),
        enabled: true,
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd_attachment"),
          threadId: jarvisThreadId,
          message: {
            messageId: MessageId.make("msg_attachment"),
            role: "user",
            text: "Inspect this image.",
            attachments: [
              {
                type: "image",
                id: "image_1",
                name: "screenshot.png",
                mimeType: "image/png",
                sizeBytes: 42,
              },
            ],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("does not support forwarding turn attachments"));
    }
  }),
);

it.effect("preserves structured user-input answers for Jarvis replies", () =>
  Effect.gen(function* () {
    let capturedAnswers: Record<string, unknown> | undefined;
    let capturedText: string | undefined;
    const typedClient = {
      ...makeJarvisFixtureClient(),
      respondInput: (sessionRef: string, input: JarvisUserInputInput) => {
        void sessionRef;
        capturedAnswers = input.answers;
        capturedText = input.text;
        return Effect.succeed({ ok: true, cursor: "evt_input" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client: typedClient,
      enabled: true,
      command: {
        type: "thread.user-input.respond",
        commandId: CommandId.make("cmd_input"),
        threadId: jarvisThreadId,
        requestId: ApprovalRequestId.make("input_1"),
        answers: {
          next_action: ["Continue", "Verify"],
          detail: { priority: 2, ready: true },
        },
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.deepStrictEqual(capturedAnswers, {
      next_action: ["Continue", "Verify"],
      detail: { priority: 2, ready: true },
    });
    assert.strictEqual(capturedText, "Continue, Verify");
  }),
);

it.effect("routes checkpoint revert through Jarvis checkpoint restore", () =>
  Effect.gen(function* () {
    let restoredCheckpointId: string | undefined;
    const fixture = makeJarvisFixtureClient();
    const client = {
      ...fixture,
      getCheckpoints: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        void sessionRef;
        void options;
        return Effect.succeed({
          items: [
            {
              session_ref: "sessref_macbook-worker_sess_fixture_codex" as never,
              checkpoint_id: "ckpt_fixture_1",
              label: "First checkpoint",
              provider: "codex",
              restored: false,
              event: {},
            },
          ],
          cursor: "ckpt_fixture_1",
          has_more: false,
        });
      },
      restoreCheckpoint: (sessionRef: string, input: JarvisRestoreCheckpointInput) => {
        void sessionRef;
        restoredCheckpointId = input.checkpoint_id;
        return Effect.succeed({ ok: true, cursor: "evt_restore" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.checkpoint.revert",
        commandId: CommandId.make("cmd_restore"),
        threadId: jarvisThreadId,
        turnCount: 1,
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(restoredCheckpointId, "ckpt_fixture_1");
  }),
);

it.effect("routes checkpoint revert by stable Jarvis checkpoint ref when available", () =>
  Effect.gen(function* () {
    let checkpointFetches = 0;
    let restoredCheckpointId: string | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      getCheckpoints: (sessionRef: string) => {
        void sessionRef;
        checkpointFetches += 1;
        return Effect.succeed({ items: [], cursor: null, has_more: false });
      },
      restoreCheckpoint: (sessionRef: string, input: JarvisRestoreCheckpointInput) => {
        void sessionRef;
        restoredCheckpointId = input.checkpoint_id;
        return Effect.succeed({ ok: true, cursor: "evt_restore" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.checkpoint.revert",
        commandId: CommandId.make("cmd_restore_ref"),
        threadId: jarvisThreadId,
        turnCount: 99,
        checkpointRef: CheckpointRef.make(
          "jarvis:sessref_macbook-worker_sess_fixture_codex:ckpt_stable",
        ),
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(checkpointFetches, 0);
    assert.strictEqual(restoredCheckpointId, "ckpt_stable");
  }),
);

it.effect("routes checkpoint revert after following Jarvis checkpoint pages", () =>
  Effect.gen(function* () {
    let restoredCheckpointId: string | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      getCheckpoints: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        void sessionRef;
        void options;
        return Effect.succeed(
          options?.after === "ckpt_page_1"
            ? {
                items: [
                  {
                    session_ref: "sessref_macbook-worker_sess_fixture_codex" as never,
                    checkpoint_id: "ckpt_page_2",
                    label: "Second checkpoint",
                    provider: "codex",
                    restored: false,
                    event: {},
                  },
                ],
                cursor: "ckpt_page_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    session_ref: "sessref_macbook-worker_sess_fixture_codex" as never,
                    checkpoint_id: "ckpt_page_1",
                    label: "First checkpoint",
                    provider: "codex",
                    restored: false,
                    event: {},
                  },
                ],
                cursor: "ckpt_page_1",
                has_more: true,
              },
        );
      },
      restoreCheckpoint: (sessionRef: string, input: JarvisRestoreCheckpointInput) => {
        void sessionRef;
        restoredCheckpointId = input.checkpoint_id;
        return Effect.succeed({ ok: true, cursor: "evt_restore" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.checkpoint.revert",
        commandId: CommandId.make("cmd_restore_page_2"),
        threadId: jarvisThreadId,
        turnCount: 2,
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(restoredCheckpointId, "ckpt_page_2");
  }),
);

it.effect("rejects archive for Jarvis-managed threads instead of falling through locally", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client: makeJarvisFixtureClient(),
        enabled: true,
        command: {
          type: "thread.archive",
          commandId: CommandId.make("cmd_archive"),
          threadId: jarvisThreadId,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("does not support archiving Jarvis-managed"));
    }
  }),
);

it.effect("ignores non-Jarvis threads", () =>
  Effect.gen(function* () {
    const result = yield* dispatchJarvisCommand({
      client: makeJarvisFixtureClient(),
      enabled: true,
      command: {
        type: "thread.turn.interrupt",
        commandId: CommandId.make("cmd_interrupt"),
        threadId: ThreadId.make("thread_local"),
        turnId: TurnId.make("turn_1"),
        createdAt: now,
      },
    });

    assert.strictEqual(result, null);
  }),
);
