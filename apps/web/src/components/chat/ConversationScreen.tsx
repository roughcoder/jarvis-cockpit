import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface ConversationScreenProps {
  readonly header: ReactNode;
  readonly banners?: ReactNode;
  readonly timeline: ReactNode;
  readonly composer: ReactNode;
  readonly chatOverlays?: ReactNode;
  readonly afterChatColumn?: ReactNode;
  readonly floatingControls?: ReactNode;
  readonly inlinePanel?: ReactNode;
  readonly sheetPanel?: ReactNode;
  readonly overlays?: ReactNode;
  readonly chatColumnMaximizedAway?: boolean;
  readonly className?: string;
}

/** Provider-neutral conversation screen. Runtime controllers supply typed slots and effects. */
export function ConversationScreen({
  header,
  banners,
  timeline,
  composer,
  chatOverlays,
  afterChatColumn,
  floatingControls,
  inlinePanel,
  sheetPanel,
  overlays,
  chatColumnMaximizedAway = false,
  className,
}: ConversationScreenProps) {
  return (
    <div
      data-conversation-screen="true"
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      {floatingControls}
      <div
        data-conversation-chat-column="true"
        data-chat-column-maximized-away={chatColumnMaximizedAway ? "true" : "false"}
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-x-hidden",
          chatColumnMaximizedAway ? "w-0 flex-none" : "flex-1",
        )}
      >
        {header}
        {banners}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="relative flex min-h-0 flex-1 flex-col">{timeline}</div>
            {composer}
            {chatOverlays}
          </main>
        </div>
        {afterChatColumn}
      </div>
      {inlinePanel}
      {sheetPanel}
      {overlays}
    </div>
  );
}
