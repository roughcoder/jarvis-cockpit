import { JarvisProjectId, JarvisProjectThreadId } from "@t3tools/contracts";

import type { JarvisConversationDetail } from "../jarvis.ts";

const THREAD_ID = JarvisProjectThreadId.make("conversation-golden");

const BASE = {
  thread_id: THREAD_ID,
  project_id: JarvisProjectId.make("project-golden"),
  parent_chat_id: "parent-conversation",
  session_id: "project:project-golden:orchestrator:conversation-golden",
  title: "Golden conversation",
  created_at: "2026-07-12T09:59:00.000Z",
  updated_at: "2026-07-12T10:00:06.000Z",
  created_by: "operator",
  workspace: {
    worker_id: "worker-dogfood",
    session_id: "provider-session",
    engine: "codex",
    workspace_id: "workspace-1",
    root_label: "Jarvis review",
    cwd_label: "jarvis-cockpit",
    status: "ready",
    provision_phase: "ready",
    worktrees: [
      {
        name: "jarvis-cockpit",
        repo: "roughcoder/jarvis-cockpit",
        path_label: "jarvis-cockpit",
        branch: "main",
        base_ref: "origin/main",
        status: "ready",
        provision_phase: "ready",
      },
    ],
  },
} satisfies Omit<JarvisConversationDetail, "messages">;

/** Oldest supported payload: lifecycle and activities exist only as provider/protocol prose. */
export const LEGACY_JARVIS_CONVERSATION_GOLDEN: JarvisConversationDetail = {
  ...BASE,
  status: "completed",
  messages: [
    {
      role: "user",
      peer_id: "operator",
      content: "Review the durable conversation adapter.",
      observed_at: "2026-07-12T10:00:00.000Z",
    },
    {
      role: "assistant",
      peer_id: "jarvis",
      content: "tool.call search lifecycle",
      observed_at: "2026-07-12T10:00:01.000Z",
    },
    {
      role: "assistant",
      peer_id: "jarvis",
      content: "tool.result search lifecycle",
      observed_at: "2026-07-12T10:00:02.000Z",
    },
    {
      role: "system",
      peer_id: "jarvis",
      content: "Watching 1 child work session(s) for completion.",
      observed_at: "2026-07-12T10:00:03.000Z",
    },
    {
      role: "system",
      peer_id: "jarvis",
      content: "Child Codex reviewer (child-1) reached completed.",
      observed_at: "2026-07-12T10:00:05.000Z",
    },
    {
      role: "assistant",
      peer_id: "jarvis",
      content: "The adapter is ready.",
      observed_at: "2026-07-12T10:00:06.000Z",
    },
  ],
};

/** Newest payload: durable ids and structured activity transitions, independently authored. */
export const ENRICHED_JARVIS_CONVERSATION_GOLDEN: JarvisConversationDetail = {
  ...BASE,
  conversation_id: THREAD_ID,
  status: "completed",
  lifecycle: "open",
  operational_state: "idle",
  messages: [
    {
      event_id: "event-user-1",
      role: "user",
      peer_id: "operator",
      content: "Review the durable conversation adapter.",
      observed_at: "2026-07-12T10:00:00.000Z",
    },
    {
      event_id: "event-tool-call",
      call_id: "call-search-1",
      role: "assistant",
      peer_id: "jarvis",
      content: "search lifecycle",
      observed_at: "2026-07-12T10:00:01.000Z",
      type: "tool.call",
    },
    {
      event_id: "event-tool-result",
      call_id: "call-search-1",
      role: "assistant",
      peer_id: "jarvis",
      content: "search lifecycle",
      observed_at: "2026-07-12T10:00:02.000Z",
      type: "tool.result",
      status: "completed",
    },
    {
      event_id: "event-watch-waiting",
      role: "system",
      content: "structured watch update",
      observed_at: "2026-07-12T10:00:03.000Z",
      type: "child_watch",
      watch_id: "watch-review-1",
      child_chat_ids: ["child-1"],
      phase: "waiting",
    },
    {
      event_id: "event-watch-claimed",
      role: "system",
      content: "structured watch update",
      observed_at: "2026-07-12T10:00:04.000Z",
      type: "child_watch",
      watch_id: "watch-review-1",
      child_chat_ids: ["child-1"],
      phase: "claimed",
    },
    {
      event_id: "event-watch-completed",
      role: "system",
      content: "structured watch update",
      observed_at: "2026-07-12T10:00:05.000Z",
      completed_at: "2026-07-12T10:00:05.000Z",
      type: "child_watch",
      watch_id: "watch-review-1",
      child_chat_ids: ["child-1"],
      phase: "completed",
    },
    {
      event_id: "event-child-terminal",
      role: "system",
      content: "structured child terminal",
      observed_at: "2026-07-12T10:00:05.000Z",
      completed_at: "2026-07-12T10:00:05.000Z",
      type: "child_terminal",
      child_chat_id: "child-1",
      title: "Codex reviewer",
      phase: "completed",
    },
    {
      event_id: "event-assistant-1",
      role: "assistant",
      peer_id: "jarvis",
      content: "The adapter is ready.",
      observed_at: "2026-07-12T10:00:06.000Z",
    },
  ],
};

export const ARCHIVED_JARVIS_CONVERSATION_GOLDEN: JarvisConversationDetail = {
  ...ENRICHED_JARVIS_CONVERSATION_GOLDEN,
  lifecycle: "archived",
  operational_state: "archived",
  archived_at: "2026-07-12T11:00:00.000Z",
  archived_by: "operator",
  archive_reason: "Review complete",
};
