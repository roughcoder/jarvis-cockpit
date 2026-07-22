import { CHAT_LIST_ANCHOR_OFFSET } from "@t3tools/shared/chatList";
import type { MessageId } from "@t3tools/contracts";
import type { LegendListRef } from "@legendapp/list/react";
import { Debouncer } from "@tanstack/react-pacer";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from "react";

import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import type { MessagesTimeline } from "./MessagesTimeline";
import {
  getAnchoredTurnMetrics,
  type TimelineListMeasurementState,
  type TimelineScrollMode,
} from "./timelineScrollAnchoring";

type TimelineEntries = ComponentProps<typeof MessagesTimeline>["timelineEntries"];

export interface ConversationTimelineControllerOptions {
  readonly conversationKey: string | null;
  readonly timelineEntries: TimelineEntries;
}

export interface ConversationTimelineController {
  readonly listRef: RefObject<LegendListRef | null>;
  readonly anchorMessageId: MessageId | null;
  readonly composerOverlayRef: (element: HTMLDivElement | null) => void;
  readonly composerInset: number;
  readonly showScrollToBottom: boolean;
  readonly expandedImage: ExpandedImagePreview | null;
  readonly beginAnchoredTurn: (messageId: MessageId) => void;
  readonly abandonAnchoredTurn: (messageId: MessageId) => void;
  readonly scrollToEnd: (animated?: boolean) => void;
  readonly onAnchorReady: (messageId: MessageId, anchorIndex: number) => void;
  readonly onAnchorSizeChanged: (messageId: MessageId, size: number) => void;
  readonly onIsAtEndChange: (isAtEnd: boolean) => void;
  readonly onManualNavigation: () => void;
  readonly onExpandImage: (preview: ExpandedImagePreview) => void;
  readonly closeExpandedImage: () => void;
}

interface KeyedAnchor {
  readonly conversationKey: string | null;
  readonly messageId: MessageId | null;
}

export function conversationTimelineRealContentOverflowsViewport(
  state: TimelineListMeasurementState | undefined,
  composerInset: number,
): boolean {
  if (!state || state.data.length === 0) {
    return false;
  }

  const lastRowIndex = state.data.length - 1;
  const lastRowTop = state.positionAtIndex(lastRowIndex);
  const lastRowHeight = state.sizeAtIndex(lastRowIndex);
  if (
    typeof lastRowTop !== "number" ||
    typeof lastRowHeight !== "number" ||
    !Number.isFinite(lastRowTop) ||
    !Number.isFinite(lastRowHeight)
  ) {
    return false;
  }

  const realContentBottom = lastRowTop + Math.max(1, lastRowHeight);
  const visibleScrollLength = Math.max(
    0,
    state.scrollLength - composerInset - CHAT_LIST_ANCHOR_OFFSET,
  );
  return realContentBottom > visibleScrollLength;
}

/** Owns the scroll, anchor, composer-inset, and image-preview state shared by chat timelines. */
export function useConversationTimelineController({
  conversationKey,
  timelineEntries,
}: ConversationTimelineControllerOptions): ConversationTimelineController {
  const listRef = useRef<LegendListRef | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null);
  const [composerOverlayElement, setComposerOverlayElement] = useState<HTMLDivElement | null>(null);
  const [composerInset, setComposerInset] = useState(0);
  const [anchor, setAnchor] = useState<KeyedAnchor>({
    conversationKey,
    messageId: null,
  });
  const anchorMessageId = anchor.conversationKey === conversationKey ? anchor.messageId : null;

  const isAtEndRef = useRef(true);
  const timelineScrollModeRef = useRef<TimelineScrollMode>("following-end");
  const pendingTimelineAnchorRef = useRef<MessageId | null>(null);
  const positionedTimelineAnchorRef = useRef<MessageId | null>(null);
  const settledTimelineAnchorRef = useRef<MessageId | null>(null);
  const activeTimelineAnchorIndexRef = useRef<number | null>(null);
  const anchorUserScrollGenerationRef = useRef(0);
  const liveFollowUserScrollGenerationRef = useRef<number | null>(0);
  const pendingAnchorScrollRestoreRef = useRef<{
    readonly messageId: MessageId;
    readonly offset: number;
    readonly userScrollGeneration: number;
  } | null>(null);
  const anchorScrollRestoreFrameRef = useRef<number | null>(null);
  const anchorPositionFramesRef = useRef<Set<number>>(new Set());
  const anchorPositionCleanupRef = useRef<(() => void) | null>(null);
  const showScrollDebouncer = useRef(
    new Debouncer(() => setShowScrollToBottom(true), { wait: 150 }),
  );

  const clearAnchorPositioning = useCallback(() => {
    for (const frame of anchorPositionFramesRef.current) {
      cancelAnimationFrame(frame);
    }
    anchorPositionFramesRef.current.clear();
    anchorPositionCleanupRef.current?.();
    anchorPositionCleanupRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!composerOverlayElement) return;

    const updateHeight = () => {
      const nextHeight = Math.ceil(composerOverlayElement.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      setComposerInset((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeight);
    observer.observe(composerOverlayElement);
    return () => observer.disconnect();
  }, [composerOverlayElement]);

  const onManualNavigation = useCallback(() => {
    anchorUserScrollGenerationRef.current += 1;
    timelineScrollModeRef.current = "free-scrolling";
    liveFollowUserScrollGenerationRef.current = null;
    pendingTimelineAnchorRef.current = null;
    positionedTimelineAnchorRef.current = null;
    settledTimelineAnchorRef.current = null;
    activeTimelineAnchorIndexRef.current = null;
    pendingAnchorScrollRestoreRef.current = null;
    clearAnchorPositioning();
    if (anchorScrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
      anchorScrollRestoreFrameRef.current = null;
    }
  }, [clearAnchorPositioning]);
  const onManualNavigationRef = useRef(onManualNavigation);
  useEffect(() => {
    onManualNavigationRef.current = onManualNavigation;
  }, [onManualNavigation]);

  const getActiveTimelineTurnMetrics = useCallback(
    (list?: LegendListRef | null) => {
      const resolvedList = list ?? listRef.current;
      const anchorIndex = activeTimelineAnchorIndexRef.current;
      const state = resolvedList?.getState();
      if (!resolvedList || !state || anchorIndex === null) {
        return null;
      }

      return getAnchoredTurnMetrics({
        state,
        anchorIndex,
        composerOverlayHeight: composerInset,
        anchorOffset: CHAT_LIST_ANCHOR_OFFSET,
      });
    },
    [composerInset],
  );

  const timelineRealContentOverflowsViewport = useCallback(
    (list?: LegendListRef | null) => {
      const resolvedList = list ?? listRef.current;
      return conversationTimelineRealContentOverflowsViewport(
        resolvedList?.getState(),
        composerInset,
      );
    },
    [composerInset],
  );

  const scrollToEnd = useCallback((animated = false) => {
    isAtEndRef.current = true;
    timelineScrollModeRef.current = "following-end";
    liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
    pendingTimelineAnchorRef.current = null;
    activeTimelineAnchorIndexRef.current = null;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom(false);
    void listRef.current?.scrollToEnd?.({ animated });
  }, []);

  const beginAnchoredTurn = useCallback(
    (messageId: MessageId) => {
      clearAnchorPositioning();
      isAtEndRef.current = true;
      timelineScrollModeRef.current = "anchoring-new-turn";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      pendingTimelineAnchorRef.current = messageId;
      positionedTimelineAnchorRef.current = null;
      settledTimelineAnchorRef.current = null;
      activeTimelineAnchorIndexRef.current = null;
      pendingAnchorScrollRestoreRef.current = null;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      setAnchor({ conversationKey, messageId });
    },
    [clearAnchorPositioning, conversationKey],
  );

  /** Discards an anchored turn whose optimistic timeline entry was removed
   * before rendering (e.g. attachment preparation failed). Restores
   * following-end scrolling so the anchor never dangles on a missing row. */
  const abandonAnchoredTurn = useCallback(
    (messageId: MessageId) => {
      if (anchor.conversationKey !== conversationKey || anchor.messageId !== messageId) return;
      clearAnchorPositioning();
      if (anchorScrollRestoreFrameRef.current !== null) {
        cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
        anchorScrollRestoreFrameRef.current = null;
      }
      isAtEndRef.current = true;
      timelineScrollModeRef.current = "following-end";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      pendingTimelineAnchorRef.current = null;
      positionedTimelineAnchorRef.current = null;
      settledTimelineAnchorRef.current = null;
      activeTimelineAnchorIndexRef.current = null;
      pendingAnchorScrollRestoreRef.current = null;
      setAnchor({ conversationKey, messageId: null });
    },
    [anchor, clearAnchorPositioning, conversationKey],
  );

  useEffect(() => {
    let removeListeners: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      const scrollNode = listRef.current?.getScrollableNode();
      if (!scrollNode) return;

      const handleManualNavigation = () => onManualNavigationRef.current();
      scrollNode.addEventListener("wheel", handleManualNavigation, { passive: true });
      scrollNode.addEventListener("touchmove", handleManualNavigation, { passive: true });
      scrollNode.addEventListener("pointerdown", handleManualNavigation, { passive: true });
      removeListeners = () => {
        scrollNode.removeEventListener("wheel", handleManualNavigation);
        scrollNode.removeEventListener("touchmove", handleManualNavigation);
        scrollNode.removeEventListener("pointerdown", handleManualNavigation);
      };
    });

    return () => {
      cancelAnimationFrame(frame);
      removeListeners?.();
    };
  }, [conversationKey]);

  const onAnchorReady = useCallback(
    (messageId: MessageId, anchorIndex: number) => {
      if (anchorMessageId !== messageId) return;
      if (pendingTimelineAnchorRef.current === messageId) {
        pendingTimelineAnchorRef.current = null;
      }
      activeTimelineAnchorIndexRef.current = anchorIndex;
      if (positionedTimelineAnchorRef.current === messageId) return;

      clearAnchorPositioning();
      positionedTimelineAnchorRef.current = messageId;
      settledTimelineAnchorRef.current = null;

      const schedulePosition = (remainingAttempts: number) => {
        const frame = requestAnimationFrame(() => {
          anchorPositionFramesRef.current.delete(frame);
          if (positionedTimelineAnchorRef.current !== messageId) return;

          const list = listRef.current;
          if (!list) {
            if (remainingAttempts > 0) schedulePosition(remainingAttempts - 1);
            return;
          }

          const scrollNode = list.getScrollableNode();
          let finished = false;
          let fallbackTimer: number | null = null;
          const finishAnimatedPositioning = () => {
            if (finished) return;
            finished = true;
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
            scrollNode.removeEventListener("scrollend", finishAnimatedPositioning);
            anchorPositionCleanupRef.current = null;
            if (positionedTimelineAnchorRef.current !== messageId) return;

            const scrollOffset = list.getState().scroll;
            void list.scrollToOffset({ offset: scrollOffset, animated: false });
            settledTimelineAnchorRef.current = messageId;
          };
          fallbackTimer = window.setTimeout(finishAnimatedPositioning, 750);
          scrollNode.addEventListener("scrollend", finishAnimatedPositioning, { once: true });
          anchorPositionCleanupRef.current = () => {
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
            scrollNode.removeEventListener("scrollend", finishAnimatedPositioning);
          };
          void list.scrollToIndex({
            index: anchorIndex,
            animated: true,
            viewPosition: 0,
            viewOffset: CHAT_LIST_ANCHOR_OFFSET,
          });
        });
        anchorPositionFramesRef.current.add(frame);
      };

      const frame = requestAnimationFrame(() => {
        anchorPositionFramesRef.current.delete(frame);
        schedulePosition(12);
      });
      anchorPositionFramesRef.current.add(frame);
    },
    [anchorMessageId, clearAnchorPositioning],
  );

  const onAnchorSizeChanged = useCallback((messageId: MessageId) => {
    if (settledTimelineAnchorRef.current !== messageId) return;
    if (liveFollowUserScrollGenerationRef.current === anchorUserScrollGenerationRef.current) return;

    const scrollOffset = listRef.current?.getState().scroll;
    if (scrollOffset === undefined) return;
    if (pendingAnchorScrollRestoreRef.current === null) {
      pendingAnchorScrollRestoreRef.current = {
        messageId,
        offset: scrollOffset,
        userScrollGeneration: anchorUserScrollGenerationRef.current,
      };
    }
    if (anchorScrollRestoreFrameRef.current !== null) return;

    anchorScrollRestoreFrameRef.current = requestAnimationFrame(() => {
      anchorScrollRestoreFrameRef.current = null;
      const pending = pendingAnchorScrollRestoreRef.current;
      pendingAnchorScrollRestoreRef.current = null;
      if (
        pending &&
        settledTimelineAnchorRef.current === pending.messageId &&
        pending.userScrollGeneration === anchorUserScrollGenerationRef.current
      ) {
        const list = listRef.current;
        const currentScrollOffset = list?.getState().scroll;
        if (
          typeof currentScrollOffset === "number" &&
          Math.abs(currentScrollOffset - pending.offset) <= 2
        ) {
          void list?.scrollToOffset({ offset: pending.offset, animated: false });
        }
      }
    });
  }, []);

  const onIsAtEndChange = useCallback((isAtEnd: boolean) => {
    if (
      !isAtEnd &&
      liveFollowUserScrollGenerationRef.current === anchorUserScrollGenerationRef.current
    ) {
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
      return;
    }
    if (isAtEndRef.current === isAtEnd) return;
    isAtEndRef.current = isAtEnd;
    if (isAtEnd) {
      timelineScrollModeRef.current = "following-end";
      liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
      showScrollDebouncer.current.cancel();
      setShowScrollToBottom(false);
    } else {
      timelineScrollModeRef.current = "free-scrolling";
      liveFollowUserScrollGenerationRef.current = null;
      showScrollDebouncer.current.maybeExecute();
    }
  }, []);

  useEffect(() => {
    if (conversationKey === null) return;
    if (liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current) return;

    let secondFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (liveFollowUserScrollGenerationRef.current !== anchorUserScrollGenerationRef.current) {
          return;
        }
        if (pendingTimelineAnchorRef.current !== null) return;
        if (
          positionedTimelineAnchorRef.current !== null &&
          settledTimelineAnchorRef.current !== positionedTimelineAnchorRef.current
        ) {
          return;
        }

        const list = listRef.current;
        if (!list) return;
        if (timelineScrollModeRef.current === "anchoring-new-turn") {
          const metrics = getActiveTimelineTurnMetrics(list);
          if (!metrics || metrics.scrollDeltaToRevealEnd <= 1) return;
          void list.scrollToOffset({
            offset: list.getState().scroll + metrics.scrollDeltaToRevealEnd,
            animated: false,
          });
          return;
        }
        if (timelineScrollModeRef.current !== "following-end") return;
        if (!timelineRealContentOverflowsViewport(list)) return;
        void list.scrollToEnd?.({ animated: false });
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [
    conversationKey,
    timelineEntries,
    getActiveTimelineTurnMetrics,
    timelineRealContentOverflowsViewport,
  ]);

  useLayoutEffect(() => {
    clearAnchorPositioning();
    if (anchorScrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
      anchorScrollRestoreFrameRef.current = null;
    }
    isAtEndRef.current = true;
    timelineScrollModeRef.current = "following-end";
    liveFollowUserScrollGenerationRef.current = anchorUserScrollGenerationRef.current;
    pendingTimelineAnchorRef.current = null;
    positionedTimelineAnchorRef.current = null;
    settledTimelineAnchorRef.current = null;
    activeTimelineAnchorIndexRef.current = null;
    pendingAnchorScrollRestoreRef.current = null;
    showScrollDebouncer.current.cancel();
    setShowScrollToBottom((current) => (current ? false : current));
    setExpandedImage((current) => (current === null ? current : null));
    setAnchor((current) =>
      current.conversationKey === conversationKey && current.messageId === null
        ? current
        : { conversationKey, messageId: null },
    );
  }, [clearAnchorPositioning, conversationKey]);

  useEffect(
    () => () => {
      showScrollDebouncer.current.cancel();
      clearAnchorPositioning();
      if (anchorScrollRestoreFrameRef.current !== null) {
        cancelAnimationFrame(anchorScrollRestoreFrameRef.current);
      }
    },
    [clearAnchorPositioning],
  );

  const onExpandImage = useCallback((preview: ExpandedImagePreview) => {
    setExpandedImage(preview);
  }, []);
  const closeExpandedImage = useCallback(() => setExpandedImage(null), []);

  return {
    listRef,
    anchorMessageId,
    composerOverlayRef: setComposerOverlayElement,
    composerInset,
    showScrollToBottom,
    expandedImage,
    beginAnchoredTurn,
    abandonAnchoredTurn,
    scrollToEnd,
    onAnchorReady,
    onAnchorSizeChanged,
    onIsAtEndChange,
    onManualNavigation,
    onExpandImage,
    closeExpandedImage,
  };
}
