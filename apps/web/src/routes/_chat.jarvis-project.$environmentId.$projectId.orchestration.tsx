import { createFileRoute } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { ProjectOrchestrationPlaceholderView } from "../components/ProjectView";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { Spinner } from "../components/ui/spinner";
import {
  resolveProjectRouteParams,
  resolveProjectRouteRenderState,
} from "../components/ProjectView.logic";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ProjectOrchestrationRouteView() {
  const routeParams = Route.useParams({
    select: (params) => resolveProjectRouteParams(params),
  });
  const shell = useEnvironmentQuery(
    routeParams === null ? null : environmentShell.stateAtom(routeParams.environmentId),
  );
  const renderState = resolveProjectRouteRenderState({
    params: routeParams,
    shellError: shell.error,
    shellHasSnapshot: shell.data?.snapshot._tag === "Some",
    shellPending: shell.isPending,
  });

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {renderState.status === "ready" ? (
        <ProjectOrchestrationPlaceholderView
          environmentId={renderState.params.environmentId}
          projectId={renderState.params.projectId}
        />
      ) : (
        <ProjectOrchestrationRouteFallback state={renderState} />
      )}
    </SidebarInset>
  );
}

function ProjectOrchestrationRouteFallback({
  state,
}: {
  readonly state: Exclude<
    ReturnType<typeof resolveProjectRouteRenderState>,
    { readonly status: "ready" }
  >;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          Loading orchestration chat
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
            <AlertTitle>Orchestration chat unavailable</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>Invalid orchestration route</EmptyTitle>
        <EmptyDescription>This URL is missing a Jarvis environment or project id.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export const Route = createFileRoute(
  "/_chat/jarvis-project/$environmentId/$projectId/orchestration",
)({
  component: ProjectOrchestrationRouteView,
});
