import { createFileRoute } from "@tanstack/react-router";
import { ProjectConversationView } from "../components/ProjectConversationView";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import {
  resolveProjectConversationRouteParams,
  resolveProjectConversationRouteRenderState,
} from "../jarvisProjectConversations.logic";

function ProjectConversationRouteView() {
  const routeParams = Route.useParams({
    select: (params) => resolveProjectConversationRouteParams(params),
  });
  const renderState = resolveProjectConversationRouteRenderState({
    params: routeParams,
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
        <ProjectConversationRouteFallback />
      )}
    </SidebarInset>
  );
}

function ProjectConversationRouteFallback() {
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
