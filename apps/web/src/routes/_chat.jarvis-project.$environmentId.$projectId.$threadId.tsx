import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ProjectConversationView } from "../components/ProjectConversationView";
import { SidebarInset } from "../components/ui/sidebar";
import { resolveProjectConversationRouteParams } from "../jarvisProjectConversations.logic";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";

function ProjectConversationRouteView() {
  const navigate = useNavigate();
  const routeParams = Route.useParams({
    select: (params) => resolveProjectConversationRouteParams(params),
  });
  const shell = useEnvironmentQuery(
    routeParams === null ? null : environmentShell.stateAtom(routeParams.environmentId),
  );
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";

  useEffect(() => {
    if (routeParams !== null || !bootstrapComplete) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [bootstrapComplete, navigate, routeParams]);

  if (routeParams === null || !bootstrapComplete) {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ProjectConversationView
        environmentId={routeParams.environmentId}
        projectId={routeParams.projectId}
        threadId={routeParams.threadId}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/jarvis-project/$environmentId/$projectId/$threadId")({
  component: ProjectConversationRouteView,
});
