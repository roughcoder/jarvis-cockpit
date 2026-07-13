import type { AgentConversation } from "@t3tools/client-runtime/conversation";
import { describe, expect, it } from "vite-plus/test";

import {
  cachedProjectConversationControlKey,
  projectConversationComposerRuntime,
} from "./projectConversationRuntime.logic";

describe("projectConversationComposerRuntime", () => {
  it("reuses control idempotency after ambiguity and rotates it when the payload changes", () => {
    const cache = new Map<string, string>();
    let sequence = 0;
    const createKey = () => `key-${++sequence}`;

    expect(cachedProjectConversationControlKey(cache, "input-1", "answer-a", createKey)).toBe(
      "key-1",
    );
    expect(cachedProjectConversationControlKey(cache, "input-1", "answer-a", createKey)).toBe(
      "key-1",
    );
    expect(cachedProjectConversationControlKey(cache, "input-1", "answer-b", createKey)).toBe(
      "key-2",
    );
  });

  it("maps active turns and normalized requests to standard composer inputs", () => {
    const result = projectConversationComposerRuntime(
      conversation({
        available: true,
        status: "waiting_input",
        activeTurn: { id: "turn-1", status: "waiting_input", startedAt: "2026-07-13T00:00:00Z" },
        pendingRequests: [
          {
            id: "approval-1",
            kind: "approval",
            status: "pending",
            title: "Approve",
            detail: "Run tests",
            createdAt: "2026-07-13T00:00:01Z",
            requestKind: "command",
            questions: [],
          },
          {
            id: "input-1",
            kind: "input",
            status: "pending",
            title: "Choose",
            detail: null,
            createdAt: "2026-07-13T00:00:02Z",
            requestKind: null,
            questions: [
              {
                id: "targets",
                header: "Targets",
                question: "Which targets?",
                multiSelect: true,
                options: [{ label: "Web", description: "Use web" }],
              },
            ],
          },
        ],
        supportedControls: ["turn", "input", "approval", "interrupt"],
        supportsSteer: false,
        supportsQueue: false,
        diagnostic: null,
      }),
    );

    expect(result).toEqual({
      phase: "running",
      activeTurnId: "turn-1",
      canInterrupt: true,
      pendingApprovals: [
        {
          requestId: "approval-1",
          requestKind: "command",
          createdAt: "2026-07-13T00:00:01Z",
          detail: "Run tests",
        },
      ],
      pendingUserInputs: [
        {
          requestId: "input-1",
          createdAt: "2026-07-13T00:00:02Z",
          questions: [
            {
              id: "targets",
              header: "Targets",
              question: "Which targets?",
              multiSelect: true,
              options: [{ label: "Web", description: "Use web" }],
            },
          ],
        },
      ],
    });
  });

  it("keeps an unavailable or idle runtime safe and non-actionable", () => {
    expect(projectConversationComposerRuntime(null)).toMatchObject({
      phase: "ready",
      activeTurnId: null,
      canInterrupt: false,
    });
    expect(
      projectConversationComposerRuntime(
        conversation({
          available: false,
          status: "unavailable",
          activeTurn: null,
          pendingRequests: [],
          supportedControls: [],
          supportsSteer: false,
          supportsQueue: false,
          diagnostic: { code: "worker_unavailable", message: "Unavailable" },
        }),
      ),
    ).toMatchObject({ phase: "ready", canInterrupt: false });
  });

  it("keeps pending requests actionable when the provider omits an active turn", () => {
    expect(
      projectConversationComposerRuntime(
        conversation({
          available: true,
          status: "waiting_approval",
          activeTurn: null,
          pendingRequests: [
            {
              id: "approval-1",
              kind: "approval",
              status: "pending",
              title: "Approve",
              detail: null,
              createdAt: null,
              requestKind: "command",
              questions: [],
            },
          ],
          supportedControls: ["approval"],
          supportsSteer: false,
          supportsQueue: false,
          diagnostic: null,
        }),
      ),
    ).toMatchObject({ phase: "running", canInterrupt: false });
  });
});

function conversation(runtime: AgentConversation["runtime"]): AgentConversation {
  return {
    id: "conversation-1",
    title: "Conversation",
    lifecycle: "open",
    operationalState: "idle",
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
    lastTurnAt: null,
    messages: [],
    activities: [],
    timeline: [],
    routing: { aliases: [] },
    ownership: { scopeId: "project-1", parentConversationId: null },
    diagnostics: { reason: null, execution: null },
    runtime,
    context: { workspace: null, archivedAt: null, archivedBy: null, archiveReason: null },
  };
}
