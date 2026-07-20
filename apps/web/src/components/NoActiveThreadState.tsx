import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { Button } from "./ui/button";
import { isElectron } from "../env";
import { isJarvisCockpitEnvironment, isJarvisStartProjectId } from "../jarvisCockpit";
import { useEnvironments, usePrimaryEnvironment } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { useNavigate } from "@tanstack/react-router";
import { Spinner } from "./ui/spinner";
import { FolderPlusIcon, MessageSquareIcon, PlugZapIcon, RocketIcon } from "lucide-react";
import { useOpenAddProjectCommandPalette } from "../commandPaletteContext";
import { buildThreadRouteParams } from "../threadRoutes";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  buildProjectConversationRouteParams,
  formatProjectConversationFailure,
  latestProjectConversation,
} from "../jarvisProjectConversations.logic";
import {
  findLatestProjectConversation,
  resolveNoActiveThreadState,
  type NoActiveThreadActionDescriptor,
} from "./NoActiveThreadState.logic";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { toastManager } from "./ui/toast";
import { useDefaultOrchestratorTarget } from "../hooks/useDefaultOrchestrator";

export function NoActiveThreadState() {
  const navigate = useNavigate();
  const openStartWork = useOpenAddProjectCommandPalette();
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const projects = useProjects();
  const threads = useThreadShells();
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
  const firstRegistryProject = registryProjects?.[0] ?? null;
  const firstProjectThreadsQuery = useEnvironmentQuery(
    isJarvisCockpitMode && primaryEnvironment && firstRegistryProject
      ? serverEnvironment.jarvisProjectThreads({
          environmentId: primaryEnvironment.environmentId,
          input: { projectId: firstRegistryProject.id },
        })
      : null,
  );
  const createProjectThread = useAtomCommand(serverEnvironment.createJarvisProjectThread, {
    reportFailure: false,
  });
  const snapshotQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisSnapshot({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const orchestratorTarget = useDefaultOrchestratorTarget(
    primaryEnvironment?.environmentId ?? null,
    snapshotQuery.data?.snapshot?.workers ?? [],
  );
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
  const latestProjectedConversation = findLatestProjectConversation({
    projects: projectedJarvisProjects,
    conversations: threads,
  });
  const latestRegistryConversation =
    firstProjectThreadsQuery.data?.ok === true
      ? latestProjectConversation(firstProjectThreadsQuery.data.threads ?? [])
      : null;
  const latestProjectConversationTarget = latestRegistryConversation
    ? {
        environmentId: primaryEnvironment?.environmentId ?? "",
        projectId: latestRegistryConversation.project_id,
        threadId: latestRegistryConversation.thread_id,
      }
    : latestProjectedConversation;
  const state = resolveNoActiveThreadState({
    isJarvisCockpitMode,
    registryFailed,
    registryPending,
    fixtureMode,
    visibleProjectCount: visibleJarvisProjects.length,
    latestProjectConversation: latestProjectConversationTarget,
  });
  const showJarvisActions = isJarvisCockpitMode;
  const actionIcon = (action: NoActiveThreadActionDescriptor) => {
    switch (action.kind) {
      case "open-project-conversation":
        return <MessageSquareIcon className="size-3.5" />;
      case "start-project-work":
        return <RocketIcon className="size-3.5" />;
      case "create-first-project":
        return <FolderPlusIcon className="size-3.5" />;
      case "reconnect-brain":
        return <PlugZapIcon className="size-3.5" />;
    }
  };
  const runAction = (action: NoActiveThreadActionDescriptor) => {
    switch (action.kind) {
      case "open-project-conversation":
        if (latestProjectConversationTarget !== null) {
          if ("projectId" in latestProjectConversationTarget) {
            void navigate({
              to: "/jarvis-project/$environmentId/$projectId/$threadId",
              params: buildProjectConversationRouteParams({
                environmentId: latestProjectConversationTarget.environmentId,
                projectId: latestProjectConversationTarget.projectId,
                threadId: latestProjectConversationTarget.threadId,
              }),
            });
            return;
          }
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(
              scopeThreadRef(
                latestProjectConversationTarget.environmentId as EnvironmentId,
                latestProjectConversationTarget.threadId as ThreadId,
              ),
            ),
          });
          return;
        }
        if (!primaryEnvironment || !firstRegistryProject || !orchestratorTarget) {
          if (primaryEnvironment && firstRegistryProject) {
            toastManager.add({
              type: "error",
              title: "Could not create orchestrator",
              description: "No orchestrator model is configured for this environment.",
            });
          }
          return;
        }
        void createProjectThread({
          environmentId: primaryEnvironment.environmentId,
          input: {
            projectId: firstRegistryProject.id,
            input: {
              title: `Conversation for ${firstRegistryProject.name}`,
              ...orchestratorTarget,
            },
          },
        }).then((result) => {
          if (result._tag === "Failure") {
            if (!isAtomCommandInterrupted(result)) {
              toastManager.add({
                type: "error",
                title: "Could not create project conversation",
                description: formatProjectConversationFailure(
                  "create",
                  squashAtomCommandFailure(result),
                ),
              });
            }
            return;
          }
          if (!result.value.ok || !result.value.thread) {
            toastManager.add({
              type: "error",
              title: "Could not create project conversation",
              description: formatProjectConversationFailure(
                "create",
                result.value.error?.message ?? "Jarvis did not return a project conversation.",
              ),
            });
            return;
          }
          firstProjectThreadsQuery.refresh();
          void navigate({
            to: "/jarvis-project/$environmentId/$projectId/$threadId",
            params: buildProjectConversationRouteParams({
              environmentId: primaryEnvironment.environmentId,
              projectId: firstRegistryProject.id,
              threadId: result.value.thread.thread_id,
            }),
          });
        });
        return;
      case "start-project-work":
        openStartWork();
        return;
      case "create-first-project":
        void navigate({ to: "/projects/manage" });
        return;
      case "reconnect-brain":
        void navigate({ to: "/settings/jarvis" });
        return;
    }
  };
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
              {state.headerLabel}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                {state.headerLabel}
              </span>
            </div>
          )}
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              <EmptyTitle className="text-foreground text-xl">{state.title}</EmptyTitle>
              <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                {state.description}
              </EmptyDescription>
            </EmptyHeader>
            {showJarvisActions ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                {state.statusLabel ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner className="size-3.5" />
                    {state.statusLabel}
                  </div>
                ) : null}
                {state.fixtureBanner ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-100">
                    {state.fixtureBanner}
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  {state.actions.map((action) => (
                    <Button
                      key={action.kind}
                      size="sm"
                      variant={action.variant}
                      className="gap-1.5"
                      onClick={() => runAction(action)}
                    >
                      {actionIcon(action)}
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
