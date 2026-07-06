import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { Button } from "./ui/button";
import { isElectron } from "../env";
import { isJarvisCockpitEnvironment, isJarvisStartProjectId } from "../jarvisCockpit";
import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import { useProjects } from "../state/entities";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { useNavigate } from "@tanstack/react-router";
import { Spinner } from "./ui/spinner";

export function NoActiveThreadState() {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const projects = useProjects();
  const jarvisEnvironmentIds = new Set(
    environments
      .filter((environment) => isJarvisCockpitEnvironment(environment.serverConfig ?? undefined))
      .map((environment) => environment.environmentId),
  );
  const isJarvisCockpitMode = jarvisEnvironmentIds.size > 0;
  const jarvisConnection =
    environments.find((environment) => jarvisEnvironmentIds.has(environment.environmentId))
      ?.serverConfig?.jarvisBrain ?? null;
  const fixtureMode = jarvisConnection?.fixtureMode === true;
  const projectRegistryQuery = useEnvironmentQuery(
    isJarvisCockpitMode && primaryEnvironment
      ? serverEnvironment.jarvisProjects({
          environmentId: primaryEnvironment.environmentId,
          input: { includeArchived: false },
        })
      : null,
  );
  const registryProjects =
    projectRegistryQuery.data?.ok === true ? projectRegistryQuery.data.projects : null;
  const registryFailed =
    isJarvisCockpitMode &&
    !fixtureMode &&
    (projectRegistryQuery.error !== null || projectRegistryQuery.data?.ok === false);
  const registryPending =
    isJarvisCockpitMode && !projectRegistryQuery.data && projectRegistryQuery.isPending;
  const projectedJarvisProjects = projects.filter(
    (project) =>
      jarvisEnvironmentIds.has(project.environmentId) && !isJarvisStartProjectId(project.id),
  );
  const visibleJarvisProjects = registryProjects ?? projectedJarvisProjects;
  const hasVisibleJarvisProjects = visibleJarvisProjects.length > 0;
  const headerLabel = isJarvisCockpitMode ? "No active project" : "No active thread";
  const title = isJarvisCockpitMode
    ? registryFailed
      ? "Reconnect Jarvis Brain"
      : registryPending
        ? "Checking Jarvis Brain"
        : hasVisibleJarvisProjects
          ? "Pick a Jarvis project"
          : "Create your first Jarvis project"
    : "Pick a thread to continue";
  const description = isJarvisCockpitMode
    ? registryFailed
      ? "Cockpit cannot create projects or start worker conversations until the Jarvis project registry is reachable."
      : registryPending
        ? "Checking whether the Jarvis brain already has projects."
        : hasVisibleJarvisProjects
          ? "Select a Jarvis project from the sidebar or use Start work to create a conversation."
          : "Jarvis cockpit needs a project before live worker conversations can start."
    : "Select an existing thread or create a new one to get started.";
  const showJarvisActions = isJarvisCockpitMode;
  const canCreateProject =
    isJarvisCockpitMode &&
    !registryFailed &&
    registryProjects !== null &&
    !hasVisibleJarvisProjects;
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            isElectron ? "workspace-topbar drag-region" : "workspace-topbar",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50 wco:pr-[var(--workspace-native-controls-inset)]">
              {headerLabel}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                {headerLabel}
              </span>
            </div>
          )}
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              <EmptyTitle className="text-foreground text-xl">{title}</EmptyTitle>
              <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                {description}
              </EmptyDescription>
            </EmptyHeader>
            {showJarvisActions ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                {registryPending ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    Checking project registry
                  </div>
                ) : null}
                {fixtureMode && !registryFailed ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-100">
                    Fixture mode: no live workers. Start work simulates dispatch.
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  {canCreateProject ? (
                    <Button size="sm" onClick={() => void navigate({ to: "/settings/projects" })}>
                      Create Jarvis project
                    </Button>
                  ) : null}
                  {registryFailed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void navigate({ to: "/settings/jarvis" })}
                    >
                      Reconnect brain
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
