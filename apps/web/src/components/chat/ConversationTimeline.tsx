import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";

import { ExpandedImageDialog } from "./ExpandedImageDialog";
import { MessagesTimeline } from "./MessagesTimeline";
import type { ConversationTimelineController } from "./useConversationTimelineController";

type ControllerOwnedTimelineProps =
  | "listRef"
  | "anchorMessageId"
  | "onAnchorReady"
  | "onAnchorSizeChanged"
  | "contentInsetEndAdjustment"
  | "onIsAtEndChange"
  | "onManualNavigation"
  | "onImageExpand";

export interface ConversationTimelineProps extends Omit<
  ComponentProps<typeof MessagesTimeline>,
  ControllerOwnedTimelineProps
> {
  readonly controller: ConversationTimelineController;
}

/** Shared code-chat renderer wired to the common viewport controller. */
export function ConversationTimeline({ controller, ...timelineProps }: ConversationTimelineProps) {
  return (
    <>
      <MessagesTimeline
        {...timelineProps}
        listRef={controller.listRef}
        anchorMessageId={controller.anchorMessageId}
        onAnchorReady={controller.onAnchorReady}
        onAnchorSizeChanged={controller.onAnchorSizeChanged}
        contentInsetEndAdjustment={controller.composerInset}
        onIsAtEndChange={controller.onIsAtEndChange}
        onManualNavigation={controller.onManualNavigation}
        onImageExpand={controller.onExpandImage}
      />
      {controller.showScrollToBottom ? (
        <div
          className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5"
          style={{ bottom: controller.composerInset + 4 }}
        >
          <button
            type="button"
            aria-label="Scroll to end"
            title="Scroll to end"
            onClick={() => controller.scrollToEnd(true)}
            className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:border-border hover:text-foreground"
          >
            <ChevronDownIcon className="size-3.5" />
            Scroll to end
          </button>
        </div>
      ) : null}
      {controller.expandedImage ? (
        <ExpandedImageDialog
          key={`${controller.expandedImage.images[controller.expandedImage.index]?.src ?? "image"}:${controller.expandedImage.index}`}
          preview={controller.expandedImage}
          onClose={controller.closeExpandedImage}
        />
      ) : null}
    </>
  );
}
