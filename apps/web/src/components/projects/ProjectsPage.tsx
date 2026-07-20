import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  FolderGit2Icon,
  GitBranchIcon,
  RefreshCwIcon,
  ServerIcon,
  Settings2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo } from "react";

import { isElectron } from "../../env";
import { isJarvisCockpitEnvironment } from "../../jarvisCockpit";
import { cn } from "../../lib/utils";
import { type EnvironmentPresentation, useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import {
  projectRepositorySummary,
  projectsForIndex,
  projectStatusLabel,
} from "./ProjectsPage.logic";

export function ProjectsPage() {
  const { environments } = useEnvironments();
  const projectEnvironments = useMemo(
    () =>
      environments
        .filter((environment) => isJarvisCockpitEnvironment(environment.serverConfig ?? undefined))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    [environments],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <ProjectsTitlebar />

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-7 sm:pt-11 lg:px-10 lg:pb-24">
            <header className="flex flex-col gap-5 border-b border-border/65 pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                  <FolderGit2Icon className="size-3.5" />
                  Project registry
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                  Projects
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Open a project to review its repositories, pull requests, knowledge, and active
                  conversations.
                </p>
              </div>
              <Button size="sm" variant="outline" render={<Link to="/projects/manage" />}>
                <Settings2Icon className="size-3.5" />
                Manage projects
              </Button>
            </header>

            <div className="mt-8 space-y-10">
              {projectEnvironments.length === 0 ? <NoEnvironmentState /> : null}
              {projectEnvironments.map((environment) => (
                <EnvironmentProjects key={environment.environmentId} environment={environment} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </SidebarInset>
  );
}

function EnvironmentProjects({ environment }: { readonly environment: EnvironmentPresentation }) {
  const environmentId = environment.environmentId;
  const projectsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjects({
      environmentId,
      input: { includeArchived: false },
    }),
  );
  const projects = useMemo(
    () => projectsForIndex(projectsQuery.data?.projects ?? []),
    [projectsQuery.data?.projects],
  );
  const queryError =
    projectsQuery.error ??
    (projectsQuery.data?.ok === false
      ? (projectsQuery.data.error?.message ?? "Jarvis did not return projects.")
      : null);

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ServerIcon className="size-3.5" />
            {environment.displayUrl ?? "Connected environment"}
          </p>
          <h2 className="mt-1.5 text-lg font-semibold">{environment.label}</h2>
        </div>
        {projectsQuery.data?.ok ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        {projectsQuery.isPending && projectsQuery.data === null ? <ProjectListSkeleton /> : null}

        {queryError !== null ? (
          <Alert variant="error">
            <TriangleAlertIcon />
            <AlertTitle>Projects unavailable</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{queryError}</span>
              <Button size="xs" variant="outline" onClick={projectsQuery.refresh}>
                <RefreshCwIcon />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {projectsQuery.data?.ok && projects.length === 0 ? <NoProjectsState /> : null}

        {projectsQuery.data?.ok && projects.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/35 shadow-xs/5">
            {projects.map((project, index) => (
              <Link
                key={project.id}
                aria-label={`Open ${project.name}`}
                className={cn(
                  "group grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-5 sm:px-5",
                  index > 0 && "border-t border-border/60",
                )}
                params={{
                  environmentId: environment.environmentId,
                  projectId: project.id,
                }}
                to="/jarvis-project/$environmentId/$projectId"
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground">
                  <FolderGit2Icon className="size-4" />
                </span>

                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate font-medium text-foreground">{project.name}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {projectStatusLabel(project)}
                    </span>
                  </span>
                  <span className="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <GitBranchIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{projectRepositorySummary(project)}</span>
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground/65">
                    {project.id}
                  </span>
                </span>

                <ArrowRightIcon className="size-4 -translate-x-1 text-muted-foreground/45 opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProjectsTitlebar() {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center border-b border-border px-4 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-7",
        isElectron ? "drag-region h-[52px] wco:h-[env(titlebar-area-height)]" : "min-h-12",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
    >
      <span className="text-sm font-medium text-foreground">Projects</span>
    </header>
  );
}

function ProjectListSkeleton() {
  return (
    <div
      aria-label="Loading projects"
      className="overflow-hidden rounded-xl border border-border/70"
    >
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className={cn("flex min-h-24 items-center gap-5 px-5 py-4", row > 0 && "border-t")}
        >
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NoEnvironmentState() {
  return (
    <Empty className="min-h-72 rounded-xl border border-dashed border-border bg-muted/15">
      <EmptyHeader>
        <EmptyTitle>No Jarvis environment connected</EmptyTitle>
        <EmptyDescription>
          Connect a Jarvis-capable environment before opening projects.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function NoProjectsState() {
  return (
    <Empty className="min-h-72 rounded-xl border border-dashed border-border bg-muted/15">
      <EmptyHeader>
        <EmptyTitle>No active projects</EmptyTitle>
        <EmptyDescription>
          Active Jarvis projects will appear here when they are added to the project registry.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
