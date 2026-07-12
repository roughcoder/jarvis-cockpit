import {
  JarvisEngineId,
  JarvisProjectId,
  JarvisRequestId,
  JarvisWorkerId,
  OrchestrationDispatchCommandError,
  type DispatchResult,
  type JarvisArchiveInput,
  type JarvisControlResult,
  type JarvisWorkerSession,
  type JarvisSessionCheckpoint,
  type JarvisStartWorkValidation,
  type JarvisSupportedControl,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { JarvisClient, JarvisClientError } from "./JarvisClient.ts";
import {
  jarvisCheckpointRefPartsFromCheckpointRef,
  jarvisRunIdFromProjectId,
  jarvisSessionIdFromThreadId,
  jarvisThreadIdForSession,
} from "./JarvisIds.ts";

const JARVIS_CHECKPOINTS_PAGE_LIMIT = 100;
const JARVIS_CHECKPOINTS_MAX_PAGES = 100;

type JarvisSessionDispatchResult = {
  readonly result: JarvisControlResult | null;
  readonly resumedSessionRef: string | null;
};

type JarvisTurnDispatchResult = {
  readonly result: JarvisControlResult;
  readonly resumedSessionRef: string | null;
};

export function dispatchJarvisCommand(input: {
  readonly client: JarvisClient;
  readonly enabled: boolean;
  readonly command: OrchestrationCommand;
}): Effect.Effect<DispatchResult | null, OrchestrationDispatchCommandError> {
  if (!input.enabled) {
    return Effect.succeed(null);
  }

  const sessionRef =
    "threadId" in input.command ? jarvisSessionIdFromThreadId(input.command.threadId) : null;
  const runId =
    "projectId" in input.command ? jarvisRunIdFromProjectId(input.command.projectId) : null;
  if (
    input.command.type === "thread.turn.start" &&
    input.command.message.attachments.length > 0 &&
    (sessionRef !== null || input.command.bootstrap?.createThread !== undefined)
  ) {
    return Effect.fail(
      new OrchestrationDispatchCommandError({
        message:
          "Jarvis cockpit does not support forwarding turn attachments yet. Remove attachments and send the prompt again.",
      }),
    );
  }

  if (runId !== null) {
    return dispatchJarvisProjectWrite(input.client, runId, input.command).pipe(
      Effect.flatMap((result) => dispatchReceiptForJarvisResult(result, input.command.type)),
    );
  }

  if (sessionRef === null && input.command.type === "thread.turn.start") {
    return dispatchJarvisStartWork(input.client, input.command).pipe(
      Effect.flatMap((result) =>
        dispatchReceiptForJarvisResult(result, input.command.type, {
          requiresPromotedThread: true,
        }),
      ),
    );
  }
  if (sessionRef === null) {
    return Effect.succeed(null);
  }
  return ensureJarvisControlSupported(input.client, sessionRef, input.command).pipe(
    Effect.flatMap(
      (session): Effect.Effect<JarvisSessionDispatchResult, OrchestrationDispatchCommandError> => {
        if (
          input.command.type === "thread.turn.start" &&
          session !== null &&
          session.run_id !== null
        ) {
          return dispatchJarvisTurnWithResume(
            input.client,
            sessionRef,
            session.run_id,
            input.command,
          );
        }
        return dispatchJarvisWrite(input.client, sessionRef, input.command).pipe(
          Effect.map(
            (result): JarvisSessionDispatchResult => ({ result, resumedSessionRef: null }),
          ),
        );
      },
    ),
    Effect.flatMap((result) => {
      if (result.result === null) {
        return Effect.fail(
          new OrchestrationDispatchCommandError({
            message: `Jarvis cockpit does not support command ${input.command.type} for Jarvis-managed sessions.`,
          }),
        );
      }
      return dispatchReceiptForJarvisResult(
        result.result,
        input.command.type,
        result.resumedSessionRef && result.resumedSessionRef !== sessionRef
          ? { promotedThreadId: jarvisThreadIdForSession(result.resumedSessionRef) }
          : {},
      );
    }),
  );
}

function dispatchJarvisProjectWrite(
  client: JarvisClient,
  runId: string,
  command: OrchestrationCommand,
): Effect.Effect<JarvisControlResult, OrchestrationDispatchCommandError> {
  switch (command.type) {
    case "project.delete":
      return client
        .archiveRun(runId, archiveInputForCommand(command.commandId))
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    default:
      return Effect.fail(
        new OrchestrationDispatchCommandError({
          message: `Jarvis cockpit does not support command ${command.type} for Jarvis-managed runs.`,
        }),
      );
  }
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
          metadata: {
            client_message_id: String(command.message.messageId),
          },
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    case "thread.meta.update":
      return Effect.succeed({ ok: true });
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
      const checkpointRef = jarvisCheckpointRefPartsFromCheckpointRef(command.checkpointRef);
      if (checkpointRef === null) {
        return restoreJarvisCheckpointByTurnCount(client, sessionRef, command);
      }
      if (checkpointRef.sessionRef !== sessionRef) {
        return Effect.fail(
          new OrchestrationDispatchCommandError({
            message: "Jarvis checkpoint restore requires a checkpointRef for the selected session.",
          }),
        );
      }
      return client
        .restoreCheckpoint(sessionRef, {
          checkpoint_id: checkpointRef.checkpointId,
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    }
    case "thread.session.stop":
      return client
        .stopSession(sessionRef)
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    case "thread.archive":
      return client
        .archiveSession(sessionRef, {
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    default:
      return Effect.succeed(null);
  }
}

function dispatchJarvisTurnWithResume(
  client: JarvisClient,
  sessionRef: string,
  runId: string,
  command: Extract<OrchestrationCommand, { readonly type: "thread.turn.start" }>,
): Effect.Effect<JarvisTurnDispatchResult, OrchestrationDispatchCommandError> {
  const turnInput = turnInputForCommand(command);
  const sendTurn = (targetSessionRef: string) =>
    client
      .sendTurn(targetSessionRef, turnInput)
      .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));

  return sendTurn(sessionRef).pipe(
    Effect.flatMap((result) => {
      if (!isRecoverableTerminalControlResult(result)) {
        return Effect.succeed({
          result,
          resumedSessionRef: null,
        } satisfies JarvisTurnDispatchResult);
      }
      return resumeJarvisRunAndRetryTurn(client, runId, command, sendTurn);
    }),
    Effect.catch((error: OrchestrationDispatchCommandError) => {
      if (!isRecoverableTerminalDispatchError(error.cause)) {
        return Effect.fail(error);
      }
      return resumeJarvisRunAndRetryTurn(client, runId, command, sendTurn);
    }),
  );
}

function resumeJarvisRunAndRetryTurn(
  client: JarvisClient,
  runId: string,
  command: Extract<OrchestrationCommand, { readonly type: "thread.turn.start" }>,
  sendTurn: (
    sessionRef: string,
  ) => Effect.Effect<JarvisControlResult, OrchestrationDispatchCommandError>,
): Effect.Effect<JarvisTurnDispatchResult, OrchestrationDispatchCommandError> {
  return client
    .resumeRun(runId, {
      idempotency_key: `${command.commandId}:resume`,
    })
    .pipe(
      Effect.mapError((cause) => jarvisDispatchOperationError(`${command.type}.resume`, cause)),
      Effect.flatMap((resumeResult) => {
        if (!resumeResult.ok) {
          return Effect.fail(
            new OrchestrationDispatchCommandError({
              message: `Jarvis rejected work.resume: ${resumeResult.error?.message ?? "unknown error"}`,
              cause: resumeResult.error,
            }),
          );
        }
        const resumedSessionRef = resumeResult.session?.session_ref;
        if (resumedSessionRef === undefined) {
          return Effect.fail(
            new OrchestrationDispatchCommandError({
              message:
                "Jarvis accepted work.resume but did not return a session_ref. Cockpit cannot continue the resumed turn without a canonical Jarvis session.",
              cause: resumeResult,
            }),
          );
        }
        return sendTurn(resumedSessionRef).pipe(
          Effect.map((result) => ({ result, resumedSessionRef })),
        );
      }),
    );
}

function turnInputForCommand(
  command: Extract<OrchestrationCommand, { readonly type: "thread.turn.start" }>,
) {
  return {
    prompt: command.message.text,
    idempotency_key: String(command.commandId),
    metadata: {
      client_message_id: String(command.message.messageId),
    },
  };
}

function restoreJarvisCheckpointByTurnCount(
  client: JarvisClient,
  sessionRef: string,
  command: Extract<OrchestrationCommand, { readonly type: "thread.checkpoint.revert" }>,
): Effect.Effect<JarvisControlResult, OrchestrationDispatchCommandError> {
  if (command.turnCount <= 0) {
    return Effect.fail(
      new OrchestrationDispatchCommandError({
        message:
          "Jarvis checkpoint restore requires a stable checkpointRef or a positive checkpoint turnCount.",
      }),
    );
  }
  return loadAllJarvisCheckpoints(client, sessionRef).pipe(
    Effect.mapError((cause) => jarvisDispatchError(command.type, cause)),
    Effect.flatMap((checkpoints) => {
      const checkpoint = checkpoints[command.turnCount - 1];
      if (checkpoint === undefined) {
        return Effect.fail(
          new OrchestrationDispatchCommandError({
            message: `Jarvis checkpoint restore could not find checkpoint for turnCount ${command.turnCount}.`,
          }),
        );
      }
      return client
        .restoreCheckpoint(sessionRef, {
          checkpoint_id: checkpoint.checkpoint_id,
          idempotency_key: String(command.commandId),
        })
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause)));
    }),
  );
}

function loadAllJarvisCheckpoints(
  client: JarvisClient,
  sessionRef: string,
): Effect.Effect<ReadonlyArray<JarvisSessionCheckpoint>, JarvisClientError> {
  const loadPage = (
    after: string | undefined,
    pagesLoaded: number,
    accumulated: ReadonlyArray<JarvisSessionCheckpoint>,
  ): Effect.Effect<ReadonlyArray<JarvisSessionCheckpoint>, JarvisClientError> =>
    client
      .getCheckpoints(sessionRef, {
        ...(after ? { after } : {}),
        limit: JARVIS_CHECKPOINTS_PAGE_LIMIT,
      })
      .pipe(
        Effect.flatMap((page) => {
          const next = [...accumulated, ...page.items];
          if (
            !page.has_more ||
            page.cursor === undefined ||
            page.cursor === null ||
            page.cursor === after ||
            pagesLoaded + 1 >= JARVIS_CHECKPOINTS_MAX_PAGES
          ) {
            return Effect.succeed(next);
          }
          return loadPage(page.cursor, pagesLoaded + 1, next);
        }),
      );

  return loadPage(undefined, 0, []);
}

function dispatchJarvisStartWork(
  client: JarvisClient,
  command: Extract<OrchestrationCommand, { readonly type: "thread.turn.start" }>,
): Effect.Effect<JarvisControlResult | null, OrchestrationDispatchCommandError> {
  if (command.bootstrap?.createThread === undefined) {
    return Effect.succeed(null);
  }
  const startInput = startWorkInputForTurnStart(command);
  return client.validateWork(startInput).pipe(
    Effect.mapError((cause) => jarvisDispatchOperationError(`${command.type}.validate`, cause)),
    Effect.flatMap((validation) => {
      if (validation.validation?.can_start !== false) {
        return Effect.succeed(validation);
      }
      return Effect.fail(
        new OrchestrationDispatchCommandError({
          message: `Jarvis rejected start work: ${jarvisValidationMessage(validation.validation)}`,
          cause: validation,
        }),
      );
    }),
    Effect.flatMap(() =>
      client
        .startWork(startInput)
        .pipe(Effect.mapError((cause) => jarvisDispatchError(command.type, cause))),
    ),
  );
}

function ensureJarvisControlSupported(
  client: JarvisClient,
  sessionRef: string,
  command: OrchestrationCommand,
): Effect.Effect<JarvisWorkerSession | null, OrchestrationDispatchCommandError> {
  const requiredControl = jarvisControlForCommand(command);
  if (requiredControl === null) {
    return Effect.succeed(null);
  }
  return client.getSession(sessionRef).pipe(
    Effect.mapError((cause) => jarvisDispatchOperationError(`${command.type}.capability`, cause)),
    Effect.flatMap((session) => {
      if (session.authority !== "jarvis") {
        return Effect.fail(
          new OrchestrationDispatchCommandError({
            message: `Jarvis cockpit cannot dispatch ${command.type}; session authority is ${session.authority}.`,
          }),
        );
      }
      if (session.supported_controls.includes(requiredControl)) {
        return Effect.succeed(session);
      }
      if (command.type === "thread.turn.start" && isTerminalResumeCandidate(session.status)) {
        return Effect.succeed(session);
      }
      return Effect.fail(
        new OrchestrationDispatchCommandError({
          message: `Jarvis cockpit cannot dispatch ${command.type}; session does not support ${requiredControl}.`,
        }),
      );
    }),
  );
}

function jarvisControlForCommand(command: OrchestrationCommand): JarvisSupportedControl | null {
  switch (command.type) {
    case "thread.turn.start":
      return "turn";
    case "thread.turn.interrupt":
      return "interrupt";
    case "thread.approval.respond":
      return "approval";
    case "thread.user-input.respond":
      return "input";
    case "thread.checkpoint.revert":
      return "checkpoint_restore";
    case "thread.session.stop":
      return "stop";
    case "thread.archive":
      return "archive";
    case "thread.meta.update":
      return null;
    default:
      return null;
  }
}

function jarvisValidationMessage(validation: JarvisStartWorkValidation): string {
  const parts = [
    ...(validation.missing.length > 0 ? [`missing ${validation.missing.join(", ")}`] : []),
    ...(validation.missing_authority.length > 0
      ? [`missing authority ${validation.missing_authority.join(", ")}`]
      : []),
    ...validation.reasons,
  ];
  return parts.length > 0 ? parts.join("; ") : "start-work validation failed";
}

function archiveInputForCommand(commandId: OrchestrationCommand["commandId"]): JarvisArchiveInput {
  return {
    idempotency_key: String(commandId),
  };
}

function dispatchReceiptForJarvisResult(
  result: JarvisControlResult | null,
  commandType: OrchestrationCommand["type"],
  options?: {
    readonly requiresPromotedThread?: boolean;
    readonly promotedThreadId?: DispatchResult["promotedThreadId"];
  },
): Effect.Effect<DispatchResult | null, OrchestrationDispatchCommandError> {
  if (result === null) {
    return Effect.succeed(null);
  }
  if (result.ok) {
    if (options?.requiresPromotedThread === true && result.session?.session_ref === undefined) {
      return Effect.fail(
        new OrchestrationDispatchCommandError({
          message:
            "Jarvis accepted start work but did not return a session_ref. Cockpit cannot finalize the draft without a canonical Jarvis session.",
          cause: result,
        }),
      );
    }
    // Prefer an explicit resume-remap thread id; otherwise fall back to the reconciliation
    // packet's session_ref. (Single key — two spreads previously let the fallback silently
    // override the resume-remap.)
    const promotedThreadId =
      options?.promotedThreadId ??
      (result.session?.session_ref
        ? jarvisThreadIdForSession(result.session.session_ref)
        : undefined);
    return Effect.succeed({
      sequence: 0,
      ...(promotedThreadId ? { promotedThreadId } : {}),
    });
  }
  return Effect.fail(
    new OrchestrationDispatchCommandError({
      message: `Jarvis rejected ${commandType}: ${result.error?.message ?? "unknown error"}`,
      cause: result.error,
    }),
  );
}

function jarvisDispatchError(commandType: OrchestrationCommand["type"], cause: unknown) {
  return new OrchestrationDispatchCommandError({
    message: jarvisDispatchFailureMessage(commandType, cause),
    cause,
  });
}

function jarvisDispatchOperationError(commandType: string, cause: unknown) {
  return new OrchestrationDispatchCommandError({
    message: jarvisDispatchFailureMessage(commandType, cause),
    cause,
  });
}

function jarvisDispatchFailureMessage(commandType: string, cause: unknown): string {
  const details = jarvisClientErrorDetails(cause);
  if (details === null) {
    return `Failed to dispatch Jarvis cockpit command ${commandType}.`;
  }
  const status = details.status === null ? "no HTTP status" : `HTTP ${details.status}`;
  return `Failed to dispatch Jarvis cockpit command ${commandType}: ${details.operation} ${status}: ${details.message}`;
}

function isRecoverableTerminalDispatchError(cause: unknown): boolean {
  const details = jarvisClientErrorDetails(cause);
  return details !== null && isRecoverableTerminalJarvisError(details);
}

function isRecoverableTerminalControlResult(result: JarvisControlResult): boolean {
  if (result.ok || result.error === undefined) {
    return false;
  }
  return isRecoverableTerminalJarvisError(result.error);
}

function isRecoverableTerminalJarvisError(input: {
  readonly code?: string | null;
  readonly message: string;
  readonly recoverable?: boolean | null;
}): boolean {
  if (input.recoverable !== true) {
    return false;
  }
  if (input.code === "session_terminal") {
    return true;
  }
  return /\b(?:terminal|interrupted)\b/i.test(input.message);
}

function isTerminalResumeCandidate(status: JarvisWorkerSession["status"]): boolean {
  return (
    status === "interrupted" ||
    status === "completed" ||
    status === "stopped" ||
    status === "failed"
  );
}

function jarvisClientErrorDetails(cause: unknown): {
  readonly operation: string;
  readonly status: number | null;
  readonly message: string;
  readonly code: string | null;
  readonly recoverable: boolean | null;
} | null {
  if (!isJarvisClientError(cause)) {
    return null;
  }
  const body = parseJarvisErrorBody(cause.responseBody);
  return {
    operation: cause.operation,
    status: cause.status,
    message: body.message ?? cause.message,
    code: body.code,
    recoverable: body.recoverable,
  };
}

function parseJarvisErrorBody(responseBody: string | null): {
  readonly message: string | null;
  readonly code: string | null;
  readonly recoverable: boolean | null;
} {
  if (responseBody === null || responseBody.trim().length === 0) {
    return { message: null, code: null, recoverable: null };
  }
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { message: responseBody, code: null, recoverable: null };
    }
    const record = parsed as Record<string, unknown>;
    // Jarvis rejected-write bodies nest the detail: {"ok": false, "error": {code, message, recoverable}}.
    const source =
      typeof record.error === "object" && record.error !== null
        ? (record.error as Record<string, unknown>)
        : record;
    return {
      message: typeof source.message === "string" ? source.message : responseBody,
      code: typeof source.code === "string" ? source.code : null,
      recoverable: typeof source.recoverable === "boolean" ? source.recoverable : null,
    };
  } catch {
    return { message: responseBody, code: null, recoverable: null };
  }
}

function isJarvisClientError(cause: unknown): cause is JarvisClientError {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { readonly _tag?: unknown })._tag === "JarvisClientError" &&
    typeof (cause as { readonly operation?: unknown }).operation === "string"
  );
}

function startWorkInputForTurnStart(
  command: Extract<OrchestrationCommand, { readonly type: "thread.turn.start" }>,
) {
  const createThread = command.bootstrap?.createThread;
  const prepareWorktree = command.bootstrap?.prepareWorktree;
  const modelSelection = command.modelSelection ?? createThread?.modelSelection;
  const title = command.titleSeed ?? createThread?.title;
  return {
    phrase: command.message.text,
    source: "manual",
    start: true,
    prompt: command.message.text,
    ...(command.bootstrap?.jarvisProjectId
      ? { project_id: JarvisProjectId.make(command.bootstrap.jarvisProjectId) }
      : {}),
    ...(command.bootstrap?.jarvisWorkPurpose
      ? { metadata: { purpose: command.bootstrap.jarvisWorkPurpose } }
      : {}),
    ...(title ? { title, objective: title } : {}),
    ...(command.bootstrap?.jarvisEngine
      ? { engine: JarvisEngineId.make(command.bootstrap.jarvisEngine) }
      : modelSelection
        ? { engine: jarvisEngineForModelSelection(modelSelection) }
        : {}),
    ...(command.bootstrap?.jarvisRepo ? { repo: command.bootstrap.jarvisRepo } : {}),
    ...(prepareWorktree?.baseBranch ? { base_ref: prepareWorktree.baseBranch } : {}),
    ...(command.bootstrap?.jarvisWorkerId
      ? { worker_id: JarvisWorkerId.make(command.bootstrap.jarvisWorkerId) }
      : {}),
    branch_strategy: "auto" as const,
    idempotency_key: String(command.commandId),
  };
}

function jarvisEngineForModelSelection(modelSelection: {
  readonly instanceId: unknown;
  readonly model: string;
}): string {
  const model = modelSelection.model.trim().toLowerCase();
  if (model === "codex" || model === "claude") {
    return model;
  }
  const instanceId = String(modelSelection.instanceId).trim().toLowerCase();
  if (instanceId === "codex" || instanceId.startsWith("codex_")) {
    return "codex";
  }
  if (instanceId === "claude" || instanceId === "claudeagent" || instanceId.startsWith("claude_")) {
    return "claude";
  }
  return "codex";
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
