import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import type { ConversationTimelineController } from "./useConversationTimelineController";

interface ConversationComposerProps {
  readonly controller: ConversationTimelineController;
  readonly children: ReactNode;
  readonly banners?: ReactNode;
  readonly lowerChrome?: ReactNode;
  readonly lowerChromeClassName?: string;
}

/** Shared floating composer chrome used by every conversation runtime. */
export function ConversationComposer({
  controller,
  children,
  banners,
  lowerChrome,
  lowerChromeClassName,
}: ConversationComposerProps) {
  return (
    <div
      ref={controller.composerOverlayRef}
      data-chat-composer-overlay="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-1.5 sm:pt-2"
    >
      <div
        aria-hidden="true"
        className="chat-composer-horizontal-inset pointer-events-none absolute inset-x-0 top-1.5 bottom-0 z-0 sm:top-2"
      >
        <div className="relative mx-auto h-full w-full max-w-3xl overflow-clip rounded-t-[20px]">
          <div className="chat-composer-shared-blur absolute -inset-8" />
        </div>
      </div>
      <div className="chat-composer-horizontal-inset">
        <div className="pointer-events-auto relative z-10 isolate">
          {banners}
          <div className="relative z-10">{children}</div>
        </div>
      </div>
      <div
        className={cn(
          "chat-composer-horizontal-inset chat-composer-lower-chrome relative z-10",
          lowerChromeClassName,
        )}
      >
        {lowerChrome}
      </div>
    </div>
  );
}
