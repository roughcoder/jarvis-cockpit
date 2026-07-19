import type { JarvisProjectThreadMessage } from "@t3tools/contracts";

export type JarvisConversationMessage = JarvisProjectThreadMessage;

/** Stable Jarvis replay identity shared by stream projection and conversation adaptation. */
export function projectThreadMessageKey(message: JarvisConversationMessage): string {
  const eventId = clean(message.event_id);
  if (eventId) return `event:${eventId}`;
  const messageId = clean(message.message_id);
  if (messageId) return `message:${messageId}`;
  return `legacy:${JSON.stringify([
    message.role,
    message.peer_id ?? null,
    message.observed_at,
    message.content,
    message.type ?? null,
    message.watch_id ?? null,
    message.child_chat_ids ?? null,
    message.child_chat_id ?? null,
    message.title ?? null,
    message.phase ?? null,
    message.status ?? null,
    message.error ?? null,
    message.completed_at ?? null,
    message.call_id ?? null,
    message.correlation_id ?? null,
    message.sequence ?? null,
  ])}`;
}

function clean(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
