import type { JarvisWorkerProfile } from "@t3tools/contracts";
import { memo, useMemo } from "react";
import {
  FolderGit2Icon,
  GitBranchIcon,
  RotateCcwIcon,
  ServerIcon,
  TriangleAlertIcon,
} from "lucide-react";

import type { StartWorkRoutingSummary } from "../startWork.logic";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import {
  WORKER_AUTO_VALUE,
  type ComposerJarvisProject,
  type ComposerJarvisRepo,
  jarvisRepoLabel,
  shortProjectLabel,
  sortWorkers,
  workerCanStartRepo,
  workerIsHealthyEnough,
  workerLabel,
  workerSupportsEngine,
} from "./composerJarvisRouting.logic";

type ComposerOverridesStripProps = {
  compact: boolean;
  selectedProject: ComposerJarvisProject | null;
  selectedRepo: ComposerJarvisRepo | null;
  environmentProjects: ReadonlyArray<ComposerJarvisProject>;
  workers: ReadonlyArray<JarvisWorkerProfile>;
  workersPending: boolean;
  selectedEngine: string;
  selectedWorkerOverrideId: string | null;
  defaultWorkerId: string | null;
  routingSummary: StartWorkRoutingSummary;
  compatibilityWarning: string | null;
  onProjectSelect: (projectId: string) => void;
  onRepoSelect: (repoRemote: string | null) => void;
  onWorkerOverrideChange: (workerId: string | null) => void;
};

type JarvisWorkerRoutingOptionsInput = Pick<
  ComposerOverridesStripProps,
  "defaultWorkerId" | "selectedEngine" | "selectedRepo" | "selectedWorkerOverrideId" | "workers"
> & {
  readonly workersPending?: boolean;
};

function useJarvisWorkerRoutingOptions(input: JarvisWorkerRoutingOptionsInput) {
  const compatibleWorkers = useMemo(
    () =>
      sortWorkers(
        input.workers.filter(
          (worker) =>
            workerIsHealthyEnough(worker) &&
            workerSupportsEngine(worker, input.selectedEngine) &&
            workerCanStartRepo(worker, input.selectedRepo?.remote ?? null),
        ),
      ),
    [input.selectedEngine, input.selectedRepo, input.workers],
  );
  const incompatibleWorkers = useMemo(
    () =>
      sortWorkers(
        input.workers.filter(
          (worker) =>
            !compatibleWorkers.some((candidate) => candidate.worker_id === worker.worker_id),
        ),
      ),
    [compatibleWorkers, input.workers],
  );
  const selectedOverrideWorker =
    input.selectedWorkerOverrideId === null
      ? null
      : (input.workers.find((worker) => worker.worker_id === input.selectedWorkerOverrideId) ??
        null);
  const defaultWorker =
    input.defaultWorkerId === null
      ? (compatibleWorkers[0] ?? null)
      : (input.workers.find((worker) => worker.worker_id === input.defaultWorkerId) ??
        compatibleWorkers[0] ??
        null);
  const workerTriggerLabel =
    selectedOverrideWorker !== null
      ? workerLabel(selectedOverrideWorker)
      : defaultWorker !== null
        ? `Auto: ${workerLabel(defaultWorker)}`
        : input.workersPending
          ? "Workers..."
          : "No worker";

  return {
    compatibleWorkers,
    incompatibleWorkers,
    selectedOverrideWorker,
    defaultWorker,
    workerTriggerLabel,
  };
}

function ComposerJarvisRoutingControls(props: ComposerOverridesStripProps) {
  const { compatibleWorkers, incompatibleWorkers, defaultWorker, workerTriggerLabel } =
    useJarvisWorkerRoutingOptions(props);

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="min-w-0 max-w-44 shrink justify-start whitespace-nowrap px-2 text-muted-foreground/75 hover:text-foreground/85 sm:px-3"
              aria-label="Select Jarvis project"
              disabled={props.environmentProjects.length === 0}
            />
          }
        >
          <FolderGit2Icon className="size-4 shrink-0" />
          <span className="min-w-0 truncate">
            {props.environmentProjects.length === 0
              ? "No project"
              : shortProjectLabel(props.selectedProject)}
          </span>
        </MenuTrigger>
        <MenuPopup align="start" side="top" className="min-w-64">
          <MenuGroup>
            <MenuGroupLabel>Project</MenuGroupLabel>
            {props.environmentProjects.map((project) => (
              <MenuItem key={project.id} onClick={() => props.onProjectSelect(project.id)}>
                <FolderGit2Icon className="size-4" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuPopup>
      </Menu>

      <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

      <Menu>
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="min-w-0 max-w-56 shrink justify-start whitespace-nowrap px-2 text-muted-foreground/75 hover:text-foreground/85 sm:px-3"
              aria-label="Select Jarvis repository"
              disabled={!props.selectedProject || props.selectedProject.repos.length === 0}
            />
          }
        >
          <GitBranchIcon className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{jarvisRepoLabel(props.selectedRepo)}</span>
        </MenuTrigger>
        <MenuPopup align="start" side="top" className="min-w-72">
          <MenuGroup>
            <MenuGroupLabel>Repository</MenuGroupLabel>
            <MenuRadioGroup
              value={props.selectedRepo?.remote ?? ""}
              onValueChange={(value) => props.onRepoSelect(value || null)}
            >
              {props.selectedProject?.repos.map((repo) => (
                <MenuRadioItem key={`${repo.name}:${repo.remote}`} value={repo.remote}>
                  <span className="min-w-0 flex-1 truncate">{jarvisRepoLabel(repo)}</span>
                  {repo.default ? (
                    <span className="text-[11px] text-muted-foreground">default</span>
                  ) : null}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        </MenuPopup>
      </Menu>

      <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

      <Menu>
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "min-w-0 max-w-48 shrink justify-start whitespace-nowrap px-2 hover:text-foreground/85 sm:px-3",
                props.compatibilityWarning
                  ? "text-warning-foreground hover:bg-warning/10"
                  : "text-muted-foreground/75",
              )}
              aria-label="Select Jarvis worker"
            />
          }
        >
          {props.compatibilityWarning ? (
            <TriangleAlertIcon className="size-4 shrink-0 text-warning-foreground" />
          ) : (
            <ServerIcon className="size-4 shrink-0" />
          )}
          <span className="min-w-0 truncate">{workerTriggerLabel}</span>
        </MenuTrigger>
        <MenuPopup align="start" side="top" className="min-w-72">
          <WorkerMenuContent
            compatibleWorkers={compatibleWorkers}
            incompatibleWorkers={incompatibleWorkers}
            defaultWorker={defaultWorker}
            selectedWorkerOverrideId={props.selectedWorkerOverrideId}
            onWorkerOverrideChange={props.onWorkerOverrideChange}
          />
        </MenuPopup>
      </Menu>

      {props.compatibilityWarning ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-warning-foreground" />
            }
          >
            <TriangleAlertIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="top" className="max-w-72 whitespace-normal">
            {props.compatibilityWarning}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px]",
          props.routingSummary.canDispatch ? "text-muted-foreground" : "text-warning-foreground",
        )}
      >
        {props.routingSummary.engineSupport} · {props.routingSummary.compatibilityLabel}
      </span>
    </>
  );
}

function WorkerMenuContent(props: {
  compatibleWorkers: ReadonlyArray<JarvisWorkerProfile>;
  incompatibleWorkers: ReadonlyArray<JarvisWorkerProfile>;
  defaultWorker: JarvisWorkerProfile | null;
  selectedWorkerOverrideId: string | null;
  onWorkerOverrideChange: (workerId: string | null) => void;
}) {
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>Worker routing</MenuGroupLabel>
        <MenuRadioGroup
          value={props.selectedWorkerOverrideId ?? WORKER_AUTO_VALUE}
          onValueChange={(value) => {
            props.onWorkerOverrideChange(value === WORKER_AUTO_VALUE ? null : value);
          }}
        >
          <MenuRadioItem value={WORKER_AUTO_VALUE}>
            Auto{props.defaultWorker ? `: ${workerLabel(props.defaultWorker)}` : ""}
          </MenuRadioItem>
          {props.compatibleWorkers.map((worker) => (
            <MenuRadioItem key={worker.worker_id} value={worker.worker_id}>
              <span className="min-w-0 truncate">{workerLabel(worker)}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuGroup>
      {props.incompatibleWorkers.length > 0 ? (
        <>
          <MenuDivider />
          <MenuGroup>
            <MenuGroupLabel>Override unavailable workers</MenuGroupLabel>
            {props.incompatibleWorkers.map((worker) => (
              <MenuItem
                key={worker.worker_id}
                onClick={() => props.onWorkerOverrideChange(worker.worker_id)}
              >
                <TriangleAlertIcon className="size-4 text-warning-foreground" />
                <span className="min-w-0 flex-1 truncate">{workerLabel(worker)}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        </>
      ) : null}
      {props.selectedWorkerOverrideId !== null ? (
        <>
          <MenuDivider />
          <MenuItem onClick={() => props.onWorkerOverrideChange(null)}>
            <RotateCcwIcon className="size-4" />
            Use project default
          </MenuItem>
        </>
      ) : null}
    </>
  );
}

export function ComposerJarvisRoutingMenuContent(
  props: Omit<ComposerOverridesStripProps, "compact">,
) {
  const { compatibleWorkers, incompatibleWorkers, defaultWorker } =
    useJarvisWorkerRoutingOptions(props);

  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>Jarvis project</MenuGroupLabel>
        {props.environmentProjects.length === 0 ? (
          <MenuGroupLabel className="max-w-72 normal-case text-muted-foreground">
            Create a project in Jarvis Projects before starting work.
          </MenuGroupLabel>
        ) : (
          <MenuRadioGroup
            value={props.selectedProject?.id ?? ""}
            onValueChange={(value) => {
              if (!value) return;
              props.onProjectSelect(value);
            }}
          >
            {props.environmentProjects.map((project) => (
              <MenuRadioItem key={project.id} value={project.id}>
                <span className="min-w-0 truncate">{project.name}</span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )}
      </MenuGroup>
      <MenuDivider />
      <MenuGroup>
        <MenuGroupLabel>Jarvis repository</MenuGroupLabel>
        {props.selectedProject === null || props.selectedProject.repos.length === 0 ? (
          <MenuGroupLabel className="max-w-72 normal-case text-muted-foreground">
            Add repositories to this project before starting work.
          </MenuGroupLabel>
        ) : (
          <MenuRadioGroup
            value={props.selectedRepo?.remote ?? ""}
            onValueChange={(value) => props.onRepoSelect(value || null)}
          >
            {props.selectedProject.repos.map((repo) => (
              <MenuRadioItem key={`${repo.name}:${repo.remote}`} value={repo.remote}>
                <span className="min-w-0 flex-1 truncate">{jarvisRepoLabel(repo)}</span>
                {repo.default ? (
                  <span className="text-[11px] text-muted-foreground">default</span>
                ) : null}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )}
      </MenuGroup>
      <MenuDivider />
      <WorkerMenuContent
        compatibleWorkers={compatibleWorkers}
        incompatibleWorkers={incompatibleWorkers}
        defaultWorker={defaultWorker}
        selectedWorkerOverrideId={props.selectedWorkerOverrideId}
        onWorkerOverrideChange={props.onWorkerOverrideChange}
      />
      {props.compatibilityWarning ? (
        <MenuGroupLabel className="max-w-72 text-warning-foreground">
          {props.compatibilityWarning}
        </MenuGroupLabel>
      ) : null}
      <MenuGroupLabel className="max-w-72 normal-case text-muted-foreground">
        Engine {props.routingSummary.engineSupport}; {props.routingSummary.compatibilityLabel}.
      </MenuGroupLabel>
    </>
  );
}

export const ComposerOverridesStrip = memo(function ComposerOverridesStrip(
  props: ComposerOverridesStripProps,
) {
  return (
    <div
      data-chat-composer-overrides-strip="true"
      className={cn(
        "relative z-0 mx-2 -mt-2 rounded-b-[18px] rounded-t-[10px] border border-border/55 bg-muted/45 px-2.5 pb-2 pt-3 shadow-sm backdrop-blur",
        props.compact ? "flex items-center gap-2" : "flex min-w-0 items-center gap-1",
      )}
    >
      {props.compact ? (
        <>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "min-w-0 shrink justify-start px-2",
                    props.compatibilityWarning
                      ? "text-warning-foreground hover:bg-warning/10"
                      : "text-muted-foreground/80 hover:text-foreground/85",
                  )}
                  aria-label="Jarvis routing overrides"
                />
              }
            >
              {props.compatibilityWarning ? (
                <TriangleAlertIcon className="size-4 shrink-0" />
              ) : (
                <FolderGit2Icon className="size-4 shrink-0" />
              )}
              <span className="min-w-0 truncate">Jarvis routing</span>
            </MenuTrigger>
            <MenuPopup align="start" side="top" className="min-w-72">
              <ComposerJarvisRoutingMenuContent {...props} />
            </MenuPopup>
          </Menu>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px]",
              props.routingSummary.canDispatch
                ? "text-muted-foreground"
                : "text-warning-foreground",
            )}
          >
            {shortProjectLabel(props.selectedProject)} · {jarvisRepoLabel(props.selectedRepo)} ·{" "}
            {props.routingSummary.compatibilityLabel}
          </span>
        </>
      ) : (
        <ComposerJarvisRoutingControls {...props} />
      )}
    </div>
  );
});
