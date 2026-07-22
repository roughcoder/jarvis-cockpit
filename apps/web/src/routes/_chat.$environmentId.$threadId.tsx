import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import ChatView from "../components/ChatView";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { resolveThreadRouteRef } from "../threadRoutes";
import { SidebarInset } from "~/components/ui/sidebar";
import { useEnvironmentThreadRefs, useThreadDetail, useThreadShell } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";
import { isJarvisThreadId } from "../jarvisCockpit";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { missingChatThreadRouteState } from "../chatThreadRoute.logic";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const threadExists = serverThreadShell !== null || serverThreadDetail !== null;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const routeThreadExists = threadExists || draftThreadExists;
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentThreadRefs.length > 0 || environmentHasDraftThreads;
  const missingRouteState = missingChatThreadRouteState({
    bootstrapComplete,
    routeThreadExists,
    jarvisThreadId: threadRef !== null && isJarvisThreadId(String(threadRef.threadId)),
    environmentHasAnyThreads,
  });

  useEffect(() => {
    if (missingRouteState === "redirect-home") {
      void navigate({ to: "/", replace: true });
    }
  }, [missingRouteState, navigate]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef || missingRouteState === "pending" || missingRouteState === "redirect-home") {
    return null;
  }

  if (missingRouteState !== "available") {
    if (missingRouteState === "jarvis-unavailable") {
      return (
        <SidebarInset className="h-svh min-h-0 overflow-hidden bg-background text-foreground md:h-dvh">
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>Child conversation unavailable</EmptyTitle>
              <EmptyDescription>
                Jarvis reported this child, but it has not published a readable conversation yet.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SidebarInset>
      );
    }
    return (
      <SidebarInset className="h-svh min-h-0 overflow-hidden bg-background text-foreground md:h-dvh">
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>Conversation not found</EmptyTitle>
            <EmptyDescription>
              This conversation is no longer available in the selected environment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ChatView
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        routeKind="server"
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
});
