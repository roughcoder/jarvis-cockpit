import { assert, it } from "@effect/vitest";
import {
  ApprovalRequestId,
  CheckpointRef,
  CommandId,
  type JarvisArchiveInput,
  type JarvisControlResult,
  type JarvisRestoreCheckpointInput,
  JarvisSessionRef,
  type JarvisSessionCheckpoint,
  type JarvisStartWorkInput,
  type JarvisTurnInput,
  type JarvisUserInputInput,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { JarvisClientError, makeJarvisFixtureClient } from "./JarvisClient.ts";
import { dispatchJarvisCommand } from "./JarvisDispatch.ts";

const now = "2026-07-01T12:00:00+00:00";
const jarvisThreadId = ThreadId.make("jarvis-session_sessref_macbook-worker_sess_fixture_codex");

function jarvisTurnStartCommand(overrides?: {
  readonly commandId?: string;
  readonly messageId?: string;
  readonly text?: string;
  readonly threadId?: ThreadId;
}) {
  return {
    type: "thread.turn.start" as const,
    commandId: CommandId.make(overrides?.commandId ?? "cmd_start"),
    threadId: overrides?.threadId ?? jarvisThreadId,
    message: {
      messageId: MessageId.make(overrides?.messageId ?? "msg_user"),
      role: "user" as const,
      text: overrides?.text ?? "Continue.",
      attachments: [],
    },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    createdAt: now,
  };
}

function jarvisHttpError(input: {
  readonly operation: string;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly recoverable?: boolean;
}) {
  return new JarvisClientError({
    operation: input.operation,
    status: input.status,
    message: `${input.operation} failed`,
    responseBody: JSON.stringify({
      code: input.code,
      message: input.message,
      recoverable: input.recoverable ?? false,
    }),
  });
}

it.effect("routes first draft turns to Jarvis work start", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
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
          jarvisEngine: "codex",
          jarvisRepo: "roughcoder/jarvis-cockpit",
          jarvisWorkerId: "macbook-worker",
        },
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, {
      sequence: 0,
      promotedThreadId: ThreadId.make(
        "jarvis-session_sessref_macbook-worker_sess_fixture_cockpit_dashboard_1",
      ),
    });
    assert.strictEqual(capturedStartWork?.prompt, "Build the cockpit dashboard.");
    assert.strictEqual(capturedStartWork?.title, "Cockpit dashboard");
    assert.strictEqual(capturedStartWork?.engine, "codex");
    assert.strictEqual(capturedStartWork?.repo, "roughcoder/jarvis-cockpit");
    assert.strictEqual(capturedStartWork?.worker_id, "macbook-worker");
    assert.strictEqual(capturedStartWork?.base_ref, "main");
    assert.strictEqual(capturedStartWork?.branch, undefined);
    assert.strictEqual(capturedStartWork?.branch_strategy, "auto");
  }),
);

it.effect("does not send local draft branch as a Jarvis worker branch", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
      },
    };

    yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work_no_branch"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Check the cockpit status.",
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
            title: "Cockpit status",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "codex",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "jarvis/local-draft-branch",
            worktreePath: null,
            createdAt: now,
          },
          jarvisEngine: "codex",
          jarvisRepo: "roughcoder/jarvis-cockpit",
          jarvisWorkerId: "macbook-worker",
        },
        createdAt: now,
      },
    });

    assert.strictEqual(capturedStartWork?.repo, "roughcoder/jarvis-cockpit");
    assert.strictEqual(capturedStartWork?.worker_id, "macbook-worker");
    assert.strictEqual(capturedStartWork?.branch, undefined);
    assert.strictEqual(capturedStartWork?.branch_strategy, "auto");
  }),
);

it.effect("derives Jarvis start-work engine from known provider routing keys", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
      },
    };

    yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work_personal"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Build the cockpit dashboard.",
          attachments: [],
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex_personal"),
          model: "gpt-5.4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project_1"),
            title: "Cockpit dashboard",
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex_personal"),
              model: "gpt-5.4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "jarvis/cockpit",
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      },
    });

    assert.strictEqual(capturedStartWork?.engine, "codex");
  }),
);

it.effect("honors explicit Jarvis start-work engine from composer routing", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
      },
    };

    yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work_custom_claude"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Build the cockpit dashboard.",
          attachments: [],
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("team_ai"),
          model: "claude-sonnet-4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project_1"),
            title: "Cockpit dashboard",
            modelSelection: {
              instanceId: ProviderInstanceId.make("team_ai"),
              model: "claude-sonnet-4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "jarvis/cockpit",
            worktreePath: null,
            createdAt: now,
          },
          jarvisEngine: "claude",
        },
        createdAt: now,
      },
    });

    assert.strictEqual(capturedStartWork?.engine, "claude");
  }),
);

it.effect("derives Jarvis start-work engine from the built-in Claude instance", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
      },
    };

    yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work_claude"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Build the cockpit dashboard.",
          attachments: [],
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("claudeAgent"),
          model: "claude-sonnet-4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project_1"),
            title: "Cockpit dashboard",
            modelSelection: {
              instanceId: ProviderInstanceId.make("claudeAgent"),
              model: "claude-sonnet-4",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: "jarvis/cockpit",
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      },
    });

    assert.strictEqual(capturedStartWork?.engine, "claude");
  }),
);

it.effect("defaults unknown T3 model selections to the Jarvis Codex engine", () =>
  Effect.gen(function* () {
    let capturedStartWork: JarvisStartWorkInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: (input: JarvisStartWorkInput) => {
        capturedStartWork = input;
        return makeJarvisFixtureClient().startWork(input);
      },
    };

    yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start_work_unknown_model"),
        threadId: ThreadId.make("thread_draft"),
        message: {
          messageId: MessageId.make("msg_user"),
          role: "user",
          text: "Run a smoke test.",
          attachments: [],
        },
        modelSelection: {
          instanceId: ProviderInstanceId.make("openai-default"),
          model: "gpt-5.5",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project_1"),
            title: "Smoke test",
            modelSelection: {
              instanceId: ProviderInstanceId.make("openai-default"),
              model: "gpt-5.5",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: now,
          },
        },
        createdAt: now,
      },
    });

    assert.strictEqual(capturedStartWork?.engine, "codex");
  }),
);

it.effect("rejects async draft starts when Jarvis does not return a promoted session yet", () =>
  Effect.gen(function* () {
    const client = {
      ...makeJarvisFixtureClient(),
      startWork: () => Effect.succeed({ ok: true, cursor: "evt_start" }),
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd_start_work_without_session"),
          threadId: ThreadId.make("thread_draft"),
          message: {
            messageId: MessageId.make("msg_user"),
            role: "user",
            text: "Build the cockpit dashboard.",
            attachments: [],
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
          },
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("did not return a session_ref"));
    }
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

it.effect("forwards the client user message id in Jarvis turn metadata", () =>
  Effect.gen(function* () {
    let capturedTurnInput: JarvisTurnInput | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: (_sessionRef: string, input: JarvisTurnInput) => {
        capturedTurnInput = input;
        return Effect.succeed({ ok: true, cursor: "evt_turn" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_start"),
        threadId: jarvisThreadId,
        message: {
          messageId: MessageId.make("msg_client_user"),
          role: "user",
          text: "Continue.",
          attachments: [],
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(capturedTurnInput?.metadata?.client_message_id, "msg_client_user");
  }),
);

it.effect("resumes a terminal Jarvis session and retries the turn once", () =>
  Effect.gen(function* () {
    const turnSessionRefs: string[] = [];
    let resumedRunId: string | undefined;
    let resumeIdempotencyKey: unknown;
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: (sessionRef: string, _input: JarvisTurnInput) => {
        turnSessionRefs.push(sessionRef);
        if (turnSessionRefs.length === 1) {
          return Effect.fail(
            jarvisHttpError({
              operation: "sessions.turn",
              status: 409,
              code: "session_terminal",
              message:
                "worker session sess_dispatch_1 is interrupted and does not accept new turns",
              recoverable: true,
            }),
          );
        }
        return Effect.succeed({ ok: true, cursor: "evt_turn_retry" });
      },
      resumeRun: (runId: string, input?: Record<string, unknown>) => {
        resumedRunId = runId;
        resumeIdempotencyKey = input?.idempotency_key;
        return Effect.succeed({
          ok: true,
          cursor: "evt_resume",
          session: {
            session_ref: JarvisSessionRef.make("sessref_macbook-worker_sess_fixture_codex_resumed"),
          },
        } satisfies JarvisControlResult);
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: jarvisTurnStartCommand({ commandId: "cmd_resume_retry" }),
    });

    assert.deepStrictEqual(turnSessionRefs, [
      "sessref_macbook-worker_sess_fixture_codex",
      "sessref_macbook-worker_sess_fixture_codex_resumed",
    ]);
    assert.strictEqual(resumedRunId, "run_fixture_dashboard");
    assert.strictEqual(resumeIdempotencyKey, "cmd_resume_retry:resume");
    assert.deepStrictEqual(result, {
      sequence: 0,
      promotedThreadId: ThreadId.make(
        "jarvis-session_sessref_macbook-worker_sess_fixture_codex_resumed",
      ),
    });
  }),
);

it.effect("surfaces the real Jarvis resume error when terminal recovery fails", () =>
  Effect.gen(function* () {
    let resumeCalls = 0;
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: () =>
        Effect.fail(
          jarvisHttpError({
            operation: "sessions.turn",
            status: 409,
            code: "session_terminal",
            message: "session is terminal",
            recoverable: true,
          }),
        ),
      resumeRun: () => {
        resumeCalls += 1;
        return Effect.fail(
          jarvisHttpError({
            operation: "work.resume",
            status: 503,
            code: "worker_unavailable",
            message: "selected worker is offline",
          }),
        );
      },
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: jarvisTurnStartCommand({ commandId: "cmd_resume_fails" }),
      }),
    );

    assert.strictEqual(resumeCalls, 1);
    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const cause = exit.cause.toString();
      assert.ok(cause.includes("work.resume"));
      assert.ok(cause.includes("HTTP 503"));
      assert.ok(cause.includes("selected worker is offline"));
    }
  }),
);

it.effect("surfaces the real Jarvis turn error when the retried turn fails", () =>
  Effect.gen(function* () {
    let turnCalls = 0;
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: () => {
        turnCalls += 1;
        if (turnCalls === 1) {
          return Effect.fail(
            jarvisHttpError({
              operation: "sessions.turn",
              status: 409,
              code: "session_terminal",
              message: "session is terminal",
              recoverable: true,
            }),
          );
        }
        return Effect.fail(
          jarvisHttpError({
            operation: "sessions.turn",
            status: 500,
            code: "internal_error",
            message: "provider crashed while starting turn",
          }),
        );
      },
      resumeRun: () =>
        Effect.succeed({
          ok: true,
          cursor: "evt_resume",
          session: {
            session_ref: JarvisSessionRef.make("sessref_macbook-worker_sess_fixture_codex_resumed"),
          },
        } satisfies JarvisControlResult),
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: jarvisTurnStartCommand({ commandId: "cmd_retry_fails" }),
      }),
    );

    assert.strictEqual(turnCalls, 2);
    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const cause = exit.cause.toString();
      assert.ok(cause.includes("sessions.turn"));
      assert.ok(cause.includes("HTTP 500"));
      assert.ok(cause.includes("provider crashed while starting turn"));
    }
  }),
);

it.effect("does not resume non-terminal Jarvis turn failures", () =>
  Effect.gen(function* () {
    let resumeCalls = 0;
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: () =>
        Effect.fail(
          jarvisHttpError({
            operation: "sessions.turn",
            status: 400,
            code: "validation_failed",
            message: "prompt is required",
          }),
        ),
      resumeRun: () => {
        resumeCalls += 1;
        return Effect.succeed({ ok: true, cursor: "evt_resume" });
      },
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: jarvisTurnStartCommand({ commandId: "cmd_validation_fails" }),
      }),
    );

    assert.strictEqual(resumeCalls, 0);
    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const cause = exit.cause.toString();
      assert.ok(cause.includes("sessions.turn"));
      assert.ok(cause.includes("HTTP 400"));
      assert.ok(cause.includes("prompt is required"));
    }
  }),
);

it.effect("includes Jarvis operation, HTTP status, and response message in dispatch errors", () =>
  Effect.gen(function* () {
    const client = {
      ...makeJarvisFixtureClient(),
      sendTurn: () =>
        Effect.fail(
          jarvisHttpError({
            operation: "sessions.turn",
            status: 409,
            code: "session_active",
            message: "session already has an active turn",
            recoverable: true,
          }),
        ),
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: jarvisTurnStartCommand({ commandId: "cmd_error_detail" }),
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const cause = exit.cause.toString();
      assert.ok(cause.includes("sessions.turn"));
      assert.ok(cause.includes("HTTP 409"));
      assert.ok(cause.includes("session already has an active turn"));
      assert.ok(!cause.includes("Failed to dispatch Jarvis cockpit command thread.turn.start."));
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

it.effect("lets non-Jarvis turn attachments fall through to the native dispatcher", () =>
  Effect.gen(function* () {
    const result = yield* dispatchJarvisCommand({
      client: makeJarvisFixtureClient(),
      enabled: true,
      command: {
        type: "thread.turn.start",
        commandId: CommandId.make("cmd_local_attachment"),
        threadId: ThreadId.make("thread_local"),
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
    });

    assert.strictEqual(result, null);
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

it.effect("rejects checkpoint revert without checkpointRef or positive turnCount", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client: makeJarvisFixtureClient(),
        enabled: true,
        command: {
          type: "thread.checkpoint.revert",
          commandId: CommandId.make("cmd_restore"),
          threadId: jarvisThreadId,
          turnCount: 0,
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("positive checkpoint turnCount"));
    }
  }),
);

it.effect("routes checkpoint revert by legacy turnCount when checkpointRef is absent", () =>
  Effect.gen(function* () {
    let restoredCheckpointId: string | undefined;
    let checkpointPageCalls = 0;
    const checkpointSessionRef =
      "sessref_macbook-worker_sess_fixture_codex" as JarvisSessionCheckpoint["session_ref"];
    const checkpointProvider = "codex" as JarvisSessionCheckpoint["provider"];
    const client = {
      ...makeJarvisFixtureClient(),
      getCheckpoints: (
        sessionRef: string,
        options?: { readonly after?: string; readonly limit?: number },
      ) => {
        void sessionRef;
        checkpointPageCalls += 1;
        return Effect.succeed(
          options?.after === "ckpt_1"
            ? {
                items: [
                  {
                    session_ref: checkpointSessionRef,
                    checkpoint_id: "ckpt_2",
                    provider: checkpointProvider,
                    restored: false,
                    event: {},
                  },
                ],
                cursor: "ckpt_2",
                has_more: false,
              }
            : {
                items: [
                  {
                    session_ref: checkpointSessionRef,
                    checkpoint_id: "ckpt_1",
                    provider: checkpointProvider,
                    restored: false,
                    event: {},
                  },
                ],
                cursor: "ckpt_1",
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
        commandId: CommandId.make("cmd_restore_turn_count"),
        threadId: jarvisThreadId,
        turnCount: 2,
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(checkpointPageCalls, 2);
    assert.strictEqual(restoredCheckpointId, "ckpt_2");
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

it.effect("rejects checkpoint refs from a different Jarvis session", () =>
  Effect.gen(function* () {
    let restoreCalls = 0;
    const client = {
      ...makeJarvisFixtureClient(),
      restoreCheckpoint: () => {
        restoreCalls += 1;
        return Effect.succeed({ ok: true, cursor: "evt_restore" });
      },
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: {
          type: "thread.checkpoint.revert",
          commandId: CommandId.make("cmd_restore_wrong_session"),
          threadId: jarvisThreadId,
          turnCount: 1,
          checkpointRef: CheckpointRef.make("jarvis:sessref_other_session:ckpt_stable"),
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    assert.strictEqual(restoreCalls, 0);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("selected session"));
    }
  }),
);

it.effect("routes archive for Jarvis-managed threads through Jarvis", () =>
  Effect.gen(function* () {
    let archivedSessionRef: string | undefined;
    let idempotencyKey: string | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      archiveSession: (sessionRef: string, input?: JarvisArchiveInput) => {
        archivedSessionRef = sessionRef;
        idempotencyKey = input?.idempotency_key;
        return Effect.succeed({ ok: true, cursor: "evt_archive" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.archive",
        commandId: CommandId.make("cmd_archive"),
        threadId: jarvisThreadId,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(archivedSessionRef, "sessref_macbook-worker_sess_fixture_codex");
    assert.strictEqual(idempotencyKey, "cmd_archive");
  }),
);

it.effect("routes stop for Jarvis-managed threads through Jarvis", () =>
  Effect.gen(function* () {
    let stoppedSessionRef: string | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      stopSession: (sessionRef: string) => {
        stoppedSessionRef = sessionRef;
        return Effect.succeed({ ok: true, cursor: "evt_stop" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "thread.session.stop",
        commandId: CommandId.make("cmd_stop"),
        threadId: jarvisThreadId,
        createdAt: now,
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(stoppedSessionRef, "sessref_macbook-worker_sess_fixture_codex");
  }),
);

it.effect("rejects session controls that Jarvis does not advertise", () =>
  Effect.gen(function* () {
    let stopCalls = 0;
    const client = {
      ...makeJarvisFixtureClient(),
      getSession: (sessionRef: string) =>
        makeJarvisFixtureClient()
          .getSession(sessionRef)
          .pipe(
            Effect.map((session) => ({
              ...session,
              supported_controls: ["turn" as const],
            })),
          ),
      stopSession: () => {
        stopCalls += 1;
        return Effect.succeed({ ok: true, cursor: "evt_stop" });
      },
    };

    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client,
        enabled: true,
        command: {
          type: "thread.session.stop",
          commandId: CommandId.make("cmd_stop_unsupported"),
          threadId: jarvisThreadId,
          createdAt: now,
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    assert.strictEqual(stopCalls, 0);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("does not support stop"));
    }
  }),
);

it.effect("treats Jarvis-managed thread metadata updates as no-ops", () =>
  Effect.gen(function* () {
    const result = yield* dispatchJarvisCommand({
      client: makeJarvisFixtureClient(),
      enabled: true,
      command: {
        type: "thread.meta.update",
        commandId: CommandId.make("cmd_meta"),
        threadId: jarvisThreadId,
        title: "Renamed thread",
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
  }),
);

it.effect(
  "rejects unsupported commands for Jarvis-managed threads instead of falling through",
  () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        dispatchJarvisCommand({
          client: makeJarvisFixtureClient(),
          enabled: true,
          command: {
            type: "thread.delete",
            commandId: CommandId.make("cmd_delete"),
            threadId: jarvisThreadId,
          },
        }),
      );

      assert.strictEqual(Exit.isFailure(exit), true);
      if (Exit.isFailure(exit)) {
        assert.ok(exit.cause.toString().includes("does not support command thread.delete"));
      }
    }),
);

it.effect("routes delete for Jarvis run project rows through Jarvis archive", () =>
  Effect.gen(function* () {
    let archivedRunId: string | undefined;
    let idempotencyKey: string | undefined;
    const client = {
      ...makeJarvisFixtureClient(),
      archiveRun: (runId: string, input?: JarvisArchiveInput) => {
        archivedRunId = runId;
        idempotencyKey = input?.idempotency_key;
        return Effect.succeed({ ok: true, cursor: "evt_archive_run" });
      },
    };

    const result = yield* dispatchJarvisCommand({
      client,
      enabled: true,
      command: {
        type: "project.delete",
        commandId: CommandId.make("cmd_archive_run"),
        projectId: ProjectId.make("jarvis-run_run_fixture_dashboard"),
      },
    });

    assert.deepStrictEqual(result, { sequence: 0 });
    assert.strictEqual(archivedRunId, "run_fixture_dashboard");
    assert.strictEqual(idempotencyKey, "cmd_archive_run");
  }),
);

it.effect("rejects unsupported Jarvis run project mutations instead of falling through", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      dispatchJarvisCommand({
        client: makeJarvisFixtureClient(),
        enabled: true,
        command: {
          type: "project.meta.update",
          commandId: CommandId.make("cmd_project_meta"),
          projectId: ProjectId.make("jarvis-run_run_fixture_dashboard"),
          title: "Renamed from T3",
        },
      }),
    );

    assert.strictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      assert.ok(exit.cause.toString().includes("does not support command project.meta.update"));
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
