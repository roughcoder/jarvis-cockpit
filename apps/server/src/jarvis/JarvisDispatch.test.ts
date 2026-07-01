import { assert, it } from "@effect/vitest";
import {
  ApprovalRequestId,
  CommandId,
  type JarvisRestoreCheckpointInput,
  type JarvisUserInputInput,
  MessageId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { makeJarvisFixtureClient } from "./JarvisClient.ts";
import { dispatchJarvisCommand } from "./JarvisDispatch.ts";

const now = "2026-07-01T12:00:00+00:00";
const jarvisThreadId = ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex");

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
