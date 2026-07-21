import { createFileRoute, redirect } from "@tanstack/react-router";

import { PullRequestsPage } from "../components/PullRequestsPage";
import { SidebarInset } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

function PullRequestsRouteView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <PullRequestsTitlebar />
        <PullRequestsPage />
      </div>
    </SidebarInset>
  );
}

function PullRequestsTitlebar() {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center border-b border-border px-4 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-7",
        isElectron ? "drag-region h-[52px] wco:h-[env(titlebar-area-height)]" : "min-h-12",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
    >
      <span className="text-sm font-medium text-foreground">Pull requests</span>
    </header>
  );
}

export const Route = createFileRoute("/pull-requests")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: PullRequestsRouteView,
});
