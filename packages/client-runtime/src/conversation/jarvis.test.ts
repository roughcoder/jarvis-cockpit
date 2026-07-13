import { describe, expect, it } from "@effect/vitest";
import { JarvisProjectId } from "@t3tools/contracts";

import {
  ARCHIVED_JARVIS_CONVERSATION_GOLDEN,
  ENRICHED_JARVIS_CONVERSATION_GOLDEN,
  LEGACY_JARVIS_CONVERSATION_GOLDEN,
} from "./__fixtures__/jarvisConversation.golden.ts";
import {
  adaptJarvisProjectThread,
  enrichAgentConversationWithJarvisContext,
  type JarvisConversationDetail,
} from "./jarvis.ts";
import { projectThreadMessageKey, type JarvisConversationMessage } from "./jarvisMessageKey.ts";
import type { AgentConversation } from "./model.ts";

describe("Jarvis universal conversation adapter", () => {
  it("maps a legacy completed provider session to an open, idle durable conversation", () => {
    const conversation = adaptJarvisProjectThread(LEGACY_JARVIS_CONVERSATION_GOLDEN);

    expect(conversation.id).toBe(String(LEGACY_JARVIS_CONVERSATION_GOLDEN.thread_id));
    expect(conversation.lifecycle).toBe("open");
    expect(conversation.operationalState).toBe("idle");
  });

  it("normalizes independent prose and structured golden payloads to identical semantics", () => {
    expect(semanticSnapshot(adaptJarvisProjectThread(LEGACY_JARVIS_CONVERSATION_GOLDEN))).toEqual(
      semanticSnapshot(adaptJarvisProjectThread(ENRICHED_JARVIS_CONVERSATION_GOLDEN)),
    );
  });

  it("prefers durable public identity and keeps legacy semantic discriminants", () => {
    const base: JarvisConversationMessage = {
      role: "system",
      content: "same visible envelope",
      observed_at: "2026-07-12T12:00:00.000Z",
      type: "child_watch",
      watch_id: "watch-identity",
      phase: "waiting",
    };

    expect(projectThreadMessageKey({ ...base, event_id: "event-1" })).toBe(
      projectThreadMessageKey({ ...base, event_id: "event-1", content: "changed replay body" }),
    );
    expect(projectThreadMessageKey(base)).not.toBe(
      projectThreadMessageKey({ ...base, phase: "claimed" }),
    );
  });

  it("uses stable ordering and IDs while deduplicating durable event replay", () => {
    const replayed: JarvisConversationDetail = {
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        ...ENRICHED_JARVIS_CONVERSATION_GOLDEN.messages,
        ENRICHED_JARVIS_CONVERSATION_GOLDEN.messages[0]!,
      ],
    };
    const first = adaptJarvisProjectThread(replayed);
    const second = adaptJarvisProjectThread(replayed);

    expect(first).toEqual(second);
    expect(first.timeline).toHaveLength(5);
    expect(first.timeline.map((item) => item.observedAt)).toEqual(
      first.timeline.map((item) => item.observedAt).sort(),
    );
    expect(new Set(first.timeline.map((item) => item.id)).size).toBe(first.timeline.length);
  });

  it("orders same-timestamp durable messages by sequence then stable replay identity", () => {
    const observedAt = "2026-07-12T12:00:00.000Z";
    const sameTimestamp: ReadonlyArray<JarvisConversationMessage> = [
      {
        event_id: "event-a-sequence-three",
        sequence: 3,
        role: "assistant",
        content: "sequence three",
        observed_at: observedAt,
      },
      {
        event_id: "event-z-sequence-one",
        sequence: 1,
        role: "assistant",
        content: "sequence one",
        observed_at: observedAt,
      },
      {
        event_id: "event-m-sequence-two",
        sequence: 2,
        role: "assistant",
        content: "sequence two",
        observed_at: observedAt,
      },
      {
        event_id: "event-z-unsequenced",
        role: "assistant",
        content: "unsequenced z",
        observed_at: observedAt,
      },
      {
        event_id: "event-a-unsequenced",
        role: "assistant",
        content: "unsequenced a",
        observed_at: observedAt,
      },
    ];
    const forward = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: sameTimestamp,
    });
    const shuffled = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        sameTimestamp[3]!,
        sameTimestamp[1]!,
        sameTimestamp[4]!,
        sameTimestamp[0]!,
        sameTimestamp[2]!,
      ],
    });

    expect(forward.messages.map((message) => message.content)).toEqual([
      "sequence one",
      "sequence two",
      "sequence three",
      "unsequenced a",
      "unsequenced z",
    ]);
    expect(shuffled.timeline).toEqual(forward.timeline);
    expect(shuffled.messages).toEqual(forward.messages);
  });

  it("uses replay identity when same-timestamp durable messages share a sequence", () => {
    const messages: ReadonlyArray<JarvisConversationMessage> = [
      {
        event_id: "event-zulu",
        sequence: 7,
        role: "assistant",
        content: "Zulu",
        observed_at: "2026-07-12T12:00:00.000Z",
      },
      {
        event_id: "event-alpha",
        sequence: 7,
        role: "assistant",
        content: "Alpha",
        observed_at: "2026-07-12T12:00:00.000Z",
      },
    ];
    const forward = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages,
    });
    const reversed = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: messages.toReversed(),
    });

    expect(forward).toEqual(reversed);
    expect(forward.messages.map((message) => message.content)).toEqual(["Alpha", "Zulu"]);
  });

  it("coalesces tool result-before-call by durable call identity", () => {
    const toolFrames = ENRICHED_JARVIS_CONVERSATION_GOLDEN.messages.filter((message) =>
      message.type?.startsWith("tool."),
    );
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: toolFrames.toReversed(),
    });

    expect(conversation.activities).toMatchObject([
      {
        kind: "tool.completed",
        status: "completed",
        toolName: "search",
        startedAt: "2026-07-12T10:00:01.000Z",
        completedAt: "2026-07-12T10:00:02.000Z",
      },
    ]);
  });

  it("keeps repeated identical legacy tool invocations as distinct paired occurrences", () => {
    const conversation = adaptJarvisProjectThread({
      ...LEGACY_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        legacyMessage("tool.call search lifecycle", "2026-07-12T12:00:00.000Z"),
        legacyMessage("tool.call search lifecycle", "2026-07-12T12:00:01.000Z"),
        legacyMessage("tool.result search lifecycle", "2026-07-12T12:00:02.000Z"),
        legacyMessage("tool.result search lifecycle", "2026-07-12T12:00:03.000Z"),
      ],
    });

    expect(conversation.activities).toMatchObject([
      {
        kind: "tool.completed",
        startedAt: "2026-07-12T12:00:00.000Z",
        completedAt: "2026-07-12T12:00:02.000Z",
      },
      {
        kind: "tool.completed",
        startedAt: "2026-07-12T12:00:01.000Z",
        completedAt: "2026-07-12T12:00:03.000Z",
      },
    ]);
    expect(new Set(conversation.activities.map((activity) => activity.id)).size).toBe(2);
    const retainedSecondInvocation = adaptJarvisProjectThread({
      ...LEGACY_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        legacyMessage("tool.call search lifecycle", "2026-07-12T12:00:01.000Z"),
        legacyMessage("tool.result search lifecycle", "2026-07-12T12:00:03.000Z"),
      ],
    });
    expect(retainedSecondInvocation.activities[0]?.id).toBe(conversation.activities[1]?.id);
  });

  it("coalesces waiting, claimed, completed, and replayed watch updates by watch id", () => {
    const watchFrames = ENRICHED_JARVIS_CONVERSATION_GOLDEN.messages.filter(
      (message) => message.type === "child_watch",
    );
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [watchFrames[2]!, watchFrames[0]!, watchFrames[1]!, watchFrames[2]!],
    });

    expect(conversation.activities).toMatchObject([
      {
        kind: "children.joined",
        status: "completed",
        correlationId: "watch-review-1",
        relatedConversationIds: ["child-1"],
        startedAt: "2026-07-12T10:00:03.000Z",
        completedAt: "2026-07-12T10:00:05.000Z",
      },
    ]);
  });

  it("bounds legacy terminal claims at the next watch and never reuses a terminal", () => {
    const conversation = adaptJarvisProjectThread({
      ...LEGACY_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        legacyMessage("Child Second (child-second) reached completed.", "2026-07-12T12:00:03.000Z"),
        legacyMessage(
          "Watching 1 child work session(s) for completion.",
          "2026-07-12T12:00:02.000Z",
        ),
        legacyMessage("Child First (child-first) reached completed.", "2026-07-12T12:00:01.000Z"),
        legacyMessage(
          "Watching 2 child work session(s) for completion.",
          "2026-07-12T12:00:00.000Z",
        ),
      ],
    });
    const watches = conversation.activities.filter((activity) =>
      activity.kind.startsWith("children."),
    );

    expect(watches).toMatchObject([
      {
        kind: "children.waiting",
        status: "waiting",
        relatedConversationIds: ["child-first"],
      },
      {
        kind: "children.joined",
        status: "completed",
        relatedConversationIds: ["child-second"],
      },
    ]);
  });

  it("namespaces structured watch and tool map keys across adversarial shared ids", () => {
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        {
          event_id: "event-shared-tool",
          role: "assistant",
          content: "search lifecycle",
          observed_at: "2026-07-12T12:00:00.000Z",
          type: "tool.call",
          call_id: "shared-correlation",
        },
        {
          event_id: "event-shared-watch",
          role: "system",
          content: "structured watch update",
          observed_at: "2026-07-12T12:00:01.000Z",
          type: "child_watch",
          watch_id: "shared-correlation",
          child_chat_ids: ["child-shared"],
          phase: "waiting",
        },
      ],
    });

    expect(conversation.activities).toMatchObject([
      { kind: "tool.requested", correlationId: "shared-correlation" },
      { kind: "children.waiting", correlationId: "shared-correlation" },
    ]);
    expect(new Set(conversation.activities.map((activity) => activity.id)).size).toBe(2);
  });

  it("projects technical frames as activities rather than transcript prose", () => {
    const conversation = adaptJarvisProjectThread(ENRICHED_JARVIS_CONVERSATION_GOLDEN);

    expect(conversation.activities.map((activity) => activity.kind)).toEqual([
      "tool.completed",
      "children.joined",
      "child.completed",
    ]);
    expect(conversation.messages.map((message) => message.content)).toEqual([
      "Review the durable conversation adapter.",
      "The adapter is ready.",
    ]);
  });

  it("does not apply legacy prose heuristics to an explicitly future message type", () => {
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        {
          role: "observer",
          content: "tool.call this is future-visible prose",
          observed_at: "2026-07-12T12:00:00.000Z",
          type: "future.notice",
        },
      ],
    });

    expect(conversation.activities).toEqual([]);
    expect(conversation.messages).toMatchObject([
      { role: "unknown", content: "tool.call this is future-visible prose" },
    ]);
  });

  it("preserves raw generated review instructions with compact neutral presentation", () => {
    const raw =
      "You are the PR review orchestrator. Review pull request #126 in roughcoder/jarvis. Keep all technical instructions.";
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        {
          role: "user",
          content: raw,
          observed_at: "2026-07-12T12:00:00.000Z",
        },
      ],
    });

    expect(conversation.messages[0]).toMatchObject({
      content: raw,
      presentation: {
        summary: "Review roughcoder/jarvis #126 with two independent code agents.",
        disclosure: { label: "Review instructions", text: raw },
      },
    });
  });

  it("preserves cancellation and treats unknown terminal phases conservatively", () => {
    const conversation = adaptJarvisProjectThread({
      ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
      messages: [
        {
          role: "system",
          content: "cancelled child",
          observed_at: "2026-07-12T12:00:00.000Z",
          type: "child_terminal",
          child_chat_id: "child-cancelled",
          title: "Cancelled reviewer",
          phase: "cancelled",
        },
        {
          role: "system",
          content: "unknown child state",
          observed_at: "2026-07-12T12:00:01.000Z",
          type: "child_terminal",
          child_chat_id: "child-future",
          title: "Future reviewer",
          phase: "teleported",
        },
        {
          role: "assistant",
          content: "unknown result state",
          observed_at: "2026-07-12T12:00:02.000Z",
          type: "tool.result",
          call_id: "future-tool",
          phase: "teleported",
        },
      ],
    });

    expect(conversation.activities).toMatchObject([
      { kind: "child.cancelled", status: "cancelled" },
      { kind: "child.waiting", status: "waiting", completedAt: null },
      { kind: "tool.requested", status: "waiting", completedAt: null },
    ]);
  });

  it("keeps aliases and ownership generic and execution details diagnostic-only", () => {
    const conversation = adaptJarvisProjectThread(ARCHIVED_JARVIS_CONVERSATION_GOLDEN);

    expect(conversation.routing.aliases).toEqual([
      { namespace: "jarvis.project-thread", id: "conversation-golden" },
    ]);
    expect(conversation.ownership).toEqual({
      scopeId: "project-golden",
      parentConversationId: "parent-conversation",
    });
    expect(conversation.context).toMatchObject({
      archivedAt: "2026-07-12T11:00:00.000Z",
      workspace: {
        workspaceId: "workspace-1",
        status: "ready",
        provisionPhase: "ready",
        worktrees: [
          {
            repository: "roughcoder/jarvis-cockpit",
            branch: "main",
            status: "ready",
            provisionPhase: "ready",
          },
        ],
      },
      project: null,
      memory: null,
      artifacts: [],
    });
    expect(conversation.context.workspace).not.toHaveProperty("workerId");
    expect(conversation.context.workspace).not.toHaveProperty("sessionId");
    expect(conversation.diagnostics.execution).toMatchObject({
      provider: "codex",
      workerId: "worker-dogfood",
      sessionId: "provider-session",
      status: "ready",
      worktrees: [
        {
          repository: "roughcoder/jarvis-cockpit",
          status: "ready",
          provisionPhase: "ready",
        },
      ],
    });
  });

  it("immutably enriches safe project, memory, and artifact context", () => {
    const base = adaptJarvisProjectThread(ENRICHED_JARVIS_CONVERSATION_GOLDEN);
    const enriched = enrichAgentConversationWithJarvisContext(base, {
      project: {
        id: JarvisProjectId.make("project-golden"),
        name: "Jarvis",
        peer_id: "private-peer",
        aliases: ["assistant-platform"],
        owner: "platform-team",
        members: ["operator"],
        visibility: "private",
        status: "active",
        repos: [
          {
            name: "jarvis-cockpit",
            remote: "https://github.com/roughcoder/jarvis-cockpit",
            default: true,
          },
          {
            name: "private-dependency",
            remote: "https://token:secret@example.test/private.git?access_token=hidden#fragment",
            default: false,
          },
        ],
        links: { jira: "JAR", urls: ["https://example.test/project"] },
        files_root: "/private/fleet/path",
      },
      memory: {
        api_version: "v1",
        schema_version: 1,
        project_id: JarvisProjectId.make("project-golden"),
        peer_id: "private-memory-peer",
        representation: "Durable project knowledge",
        conclusions: [
          {
            id: "conclusion-1",
            content: "Use one universal conversation runtime.",
            artifact_type: "decision",
            recorded_by: "operator",
            observed_at: "2026-07-13T00:00:00.000Z",
          },
        ],
      },
      files: [
        {
          doc_id: "artifact-1",
          title: "Review evidence",
          session_id: "private-provider-session",
          original_path: "/private/evidence.md",
          content_hash: "sha256:evidence",
          artifact_type: "evidence",
          uploaded_by: "operator",
          observed_at: "2026-07-13T00:01:00.000Z",
          retracted: false,
          ingestion: { private_worker: "worker-secret" },
          metadata: { private_path: "/secret" },
        },
      ],
    });

    expect(enriched).not.toBe(base);
    expect(enriched.context).not.toBe(base.context);
    expect(base.context).toMatchObject({ project: null, memory: null, artifacts: [] });
    expect(enriched.context).toMatchObject({
      project: {
        id: "project-golden",
        name: "Jarvis",
        aliases: ["assistant-platform"],
        repositories: [
          {
            name: "jarvis-cockpit",
            remote: "https://github.com/roughcoder/jarvis-cockpit",
            isDefault: true,
          },
          {
            name: "private-dependency",
            remote: "https://example.test/private.git",
            isDefault: false,
          },
        ],
        links: { issueTracker: "JAR", urls: ["https://example.test/project"] },
      },
      memory: {
        representation: "Durable project knowledge",
        conclusions: [
          {
            id: "conclusion-1",
            content: "Use one universal conversation runtime.",
            artifactType: "decision",
          },
        ],
      },
      artifacts: [
        {
          id: "artifact-1",
          title: "Review evidence",
          contentHash: "sha256:evidence",
          artifactType: "evidence",
          retracted: false,
        },
      ],
    });
    const publicContext = JSON.stringify(enriched.context);
    expect(publicContext).not.toContain("private-peer");
    expect(publicContext).not.toContain("private-provider-session");
    expect(publicContext).not.toContain("/private/");
    expect(publicContext).not.toContain("worker-secret");
    expect(enriched.diagnostics).toBe(base.diagnostics);
  });
});

function semanticSnapshot(conversation: AgentConversation) {
  return {
    ...conversation,
    messages: conversation.messages.map(({ id: _id, ...message }) => message),
    activities: conversation.activities.map(
      ({ id: _id, correlationId: _correlationId, ...activity }) => activity,
    ),
    timeline: conversation.timeline.map(({ id: _id, ...item }) => item),
  };
}

function legacyMessage(content: string, observedAt: string): JarvisConversationMessage {
  return {
    role: "system",
    content,
    observed_at: observedAt,
  };
}
