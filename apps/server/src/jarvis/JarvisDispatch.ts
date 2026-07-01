import {
  JarvisRequestId,
  OrchestrationDispatchCommandError,
  type JarvisControlResult,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { JarvisClient } from "./JarvisClient.ts";
import { jarvisSessionIdFromThreadId } from "./JarvisProjectionMapper.ts";

export function dispatchJarvisCommand(input: {
  readonly client: JarvisClient;
  readonly enabled: boolean;
  readonly command: OrchestrationCommand;
}): Effect.Effect<{ readonly sequence: number } | null, OrchestrationDispatchCommandError> {
  const sessionRef =
    "threadId" in input.command ? jarvisSessionIdFromThreadId(input.command.threadId) : null;
  if (!input.enabled || sessionRef === null) {
    return Effect.succeed(null);
  }

  return dispatchJarvisWrite(input.client, sessionRef, input.command).pipe(
    Effect.flatMap((result) => {
      if (result === null) {
        return Effect.succeed(null);
      }
      if (result.ok) {
        return Effect.succeed({ sequence: 0 });
      }
      return Effect.fail(
        new OrchestrationDispatchCommandError({
          message: `Jarvis rejected ${input.command.type}: ${result.error?.message ?? "unknown error"}`,
          cause: result.error,
        }),
      );
    }),
  );
}

function dispatchJarvisWrite(
  client: JarvisClient,
  sessionRef: string,
  command: OrchestrationCommand,
): Effect.Effect<JarvisControlResult | null, OrchestrationDispatchCommandError> {
  switch (command.type) {
    case "thread.turn.start":
      return client
        .sendTurn(sessionRef, {
          prompt: command.message.text,
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    case "thread.turn.interrupt":
      return client
        .interruptSession(sessionRef, command.turnId)
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    case "thread.approval.respond":
      return client
        .respondApproval(sessionRef, {
          request_id: JarvisRequestId.make(String(command.requestId)),
          decision: jarvisApprovalDecisionForProviderDecision(command.decision),
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    case "thread.user-input.respond": {
      const answers = jsonObjectForJarvisUserInput(command.answers);
      return client
        .respondInput(sessionRef, {
          request_id: JarvisRequestId.make(String(command.requestId)),
          text: textForJarvisUserInputAnswers(command.answers),
          ...(answers ? { answers } : {}),
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    }
    case "thread.checkpoint.revert": {
      const turnCount = command.turnCount;
      const commandId = command.commandId;
      const commandType = command.type;
      return client.getCheckpoints(sessionRef).pipe(
        Effect.mapError((cause) => jarvisDispatchError(commandType, cause)),
        Effect.flatMap((page) => {
          const checkpoint = page.items[turnCount - 1];
          if (checkpoint === undefined) {
            return Effect.fail(
              new OrchestrationDispatchCommandError({
                message: `Jarvis checkpoint ${turnCount} was not found for ${sessionRef}.`,
              }),
            );
          }
          return client
            .restoreCheckpoint(sessionRef, {
              checkpoint_id: checkpoint.checkpoint_id,
              idempotency_key: String(commandId),
            })
            .pipe(Effect.mapError((cause) => jarvisDispatchError(commandType, cause)));
        }),
      );
    }
    case "thread.session.stop":
      return client
        .stopSession(sessionRef)
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    default:
      return Effect.succeed(null);
  }
}

function jarvisDispatchError(commandType: OrchestrationCommand["type"], cause: unknown) {
  return new OrchestrationDispatchCommandError({
    message: `Failed to dispatch Jarvis cockpit command ${commandType}.`,
    cause,
  });
}

function jarvisApprovalDecisionForProviderDecision(
  decision: "accept" | "acceptForSession" | "decline" | "cancel",
) {
  switch (decision) {
    case "accept":
      return "approved" as const;
    case "acceptForSession":
      return "approved_for_session" as const;
    case "decline":
      return "denied" as const;
    case "cancel":
      return "cancelled" as const;
  }
}

function textForJarvisUserInputAnswers(answers: Record<string, unknown>): string {
  for (const value of Object.values(answers)) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (Array.isArray(value)) {
      const text = value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .join(", ");
      if (text.trim().length > 0) {
        return text;
      }
    }
  }
  return "Respond";
}

function jsonObjectForJarvisUserInput(
  answers: Record<string, unknown>,
): Record<string, Schema.Json> | null {
  const result: Record<string, Schema.Json> = {};
  for (const [key, value] of Object.entries(answers)) {
    const json = toJson(value);
    if (json === undefined) {
      return null;
    }
    result[key] = json;
  }
  return result;
}

function toJson(value: unknown): Schema.Json | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items: Schema.Json[] = [];
    for (const item of value) {
      const json = toJson(item);
      if (json === undefined) {
        return undefined;
      }
      items.push(json);
    }
    return items;
  }
  if (typeof value === "object" && value !== null) {
    const record: Record<string, Schema.Json> = {};
    for (const [key, item] of Object.entries(value)) {
      const json = toJson(item);
      if (json === undefined) {
        return undefined;
      }
      record[key] = json;
    }
    return record;
  }
  return undefined;
}
