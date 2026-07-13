import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { ApprovalRequestId } from "@t3tools/contracts";

import type { PendingApproval, PendingUserInput } from "./session-logic";
import type { SessionPhase } from "./types";

export interface ProjectConversationComposerRuntime {
  readonly phase: SessionPhase;
  readonly activeTurnId: string | null;
  readonly canInterrupt: boolean;
  readonly canQueue: boolean;
  readonly pendingApprovals: PendingApproval[];
  readonly pendingUserInputs: PendingUserInput[];
}

/** Reuse a command identity after an ambiguous transport failure, but not after its payload changes. */
export function cachedProjectConversationControlKey(
  cache: Map<string, string>,
  identity: string,
  fingerprint: string,
  createKey: () => string,
): string {
  const cacheKey = `${identity}\u0000${fingerprint}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const created = createKey();
  cache.set(cacheKey, created);
  return created;
}

/** Translate universal conversation runtime truth into the standard composer inputs. */
export function projectConversationComposerRuntime(
  conversation: AgentConversation | null,
): ProjectConversationComposerRuntime {
  const runtime = conversation?.runtime;
  if (!runtime) {
    return {
      phase: "ready",
      activeTurnId: null,
      canInterrupt: false,
      canQueue: false,
      pendingApprovals: [],
      pendingUserInputs: [],
    };
  }

  const pendingApprovals: PendingApproval[] = [];
  const pendingUserInputs: PendingUserInput[] = [];
  for (const request of runtime.pendingRequests) {
    const requestId = ApprovalRequestId.make(request.id);
    if (request.kind === "approval") {
      pendingApprovals.push({
        requestId,
        requestKind: request.requestKind ?? "command",
        createdAt: request.createdAt ?? "",
        ...(request.detail ? { detail: request.detail } : {}),
      });
      continue;
    }
    pendingUserInputs.push({
      requestId,
      createdAt: request.createdAt ?? "",
      questions: request.questions.map((question) => ({
        id: question.id,
        header: question.header ?? "Input",
        question: question.question,
        options: question.options.map((option) => ({
          label: option.label,
          description: option.description ?? "",
        })),
        multiSelect: question.multiSelect,
      })),
    });
  }

  return {
    phase: runtime.activeTurn || runtime.pendingRequests.length > 0 ? "running" : "ready",
    activeTurnId: runtime.activeTurn?.id ?? null,
    canInterrupt: runtime.activeTurn !== null && runtime.supportedControls.includes("interrupt"),
    canQueue: runtime.supportsQueue,
    pendingApprovals,
    pendingUserInputs,
  };
}
