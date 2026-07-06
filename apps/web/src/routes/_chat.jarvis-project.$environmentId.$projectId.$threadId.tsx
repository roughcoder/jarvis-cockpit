import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { ProjectConversationView } from "../components/ProjectConversationView";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { Spinner } from "../components/ui/spinner";
import {
  resolveProjectConversationRouteParams,
  resolveProjectConversationRouteRenderState,
} from "../jarvisProjectConversations.logic";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ProjectConversationRouteView() {
  const routeParams = Route.useParams({
    select: (params) => resolveProjectConversationRouteParams(params),
  });
  const shell = useEnvironmentQuery(
    routeParams === null ? null : environmentShell.stateAtom(routeParams.environmentId),
  );
  const renderState = resolveProjectConversationRouteRenderState({
    params: routeParams,
    shellError: shell.error,
    shellHasSnapshot: shell.data?.snapshot._tag === "Some",
    shellPending: shell.isPending,
  });

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {renderState.status === "ready" ? (
        <ProjectConversationView
          environmentId={renderState.params.environmentId}
          projectId={renderState.params.projectId}
          threadId={renderState.params.threadId}
        />
      ) : (
        <ProjectConversationRouteFallback state={renderState} />
      )}
    </SidebarInset>
  );
}

function ProjectConversationRouteFallback({
  state,
}: {
  readonly state: Exclude<
    ReturnType<typeof resolveProjectConversationRouteRenderState>,
    { readonly status: "ready" }
  >;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          Loading project conversation
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 bg-background px-4 py-6">
        <div className="mx-auto w-full max-w-2xl">
          <Alert variant="error">
            <TriangleAlertIcon />
            <AlertTitle>Project conversation unavailable</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>Invalid project conversation route</EmptyTitle>
        <EmptyDescription>
          This URL is missing a Jarvis environment, project, or conversation id.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export const Route = createFileRoute("/_chat/jarvis-project/$environmentId/$projectId/$threadId")({
  component: ProjectConversationRouteView,
});
