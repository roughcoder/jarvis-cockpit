import type { AgentConversationOverlayTurn } from "./agentConversationTimelineOverlay.logic";
import type { ProjectConversationLocalTurnView } from "./jarvisProjectConversations.logic";

export function projectConversationTimelineOverlayTurns(
  turns: ReadonlyArray<ProjectConversationLocalTurnView>,
): AgentConversationOverlayTurn[] {
  return turns.map((turn) => ({
    id: turn.id,
    prompt: turn.prompt,
    response: turn.response,
    status: turn.status === "idle" ? "pending" : turn.status,
    error: turn.error,
    createdAt: turn.createdAt,
    activities: (turn.toolItems ?? []).flatMap((item) => {
      if (item.kind === "activity") {
        return [
          {
            id: item.id,
            title: item.activity.title,
            detail: item.activity.detail,
            status: item.activity.status,
          },
        ];
      }
      if (item.kind !== "tool") return [];
      return [
        {
          id: item.id,
          title: item.toolCall.name,
          detail: item.toolCall.resultSummary ?? item.toolCall.inputSummary,
          status: item.toolCall.status === "completed" ? "completed" : "running",
          toolName: item.toolCall.name,
        },
      ];
    }),
  }));
}
