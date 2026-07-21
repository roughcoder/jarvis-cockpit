import { createFileRoute, redirect } from "@tanstack/react-router";

import { JarvisProjectsPanel } from "../components/settings/JarvisProjects";
import { SidebarInset } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

function ProjectManagementRouteView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header
          className={cn(
            "flex shrink-0 items-center border-b border-border px-4 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-7",
            isElectron ? "drag-region h-[52px] wco:h-[env(titlebar-area-height)]" : "min-h-12",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <span className="text-sm font-medium text-foreground">Manage projects</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-6 sm:py-8">
          <JarvisProjectsPanel />
        </main>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/projects_/manage")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ProjectManagementRouteView,
});
