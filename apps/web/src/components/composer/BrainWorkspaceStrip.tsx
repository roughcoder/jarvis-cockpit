import type {
  JarvisConversationWorkspace,
  JarvisProject,
  JarvisProjectRepository,
} from "@t3tools/contracts";
import { ChevronDownIcon, FolderGit2Icon, GitBranchIcon, PlusIcon, ServerIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import {
  type ProjectConversationWorkspaceEngine,
  type ProjectConversationWorkspaceStaging,
  setProjectConversationWorkspaceEngine,
  setProjectConversationWorkspaceRepoBaseRef,
  toggleProjectConversationWorkspaceRepo,
  workspaceRepoNames,
} from "../projectConversationWorkspace.logic";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { Separator } from "../ui/separator";

export interface BrainWorkspaceStripProps {
  readonly compact: boolean;
  readonly project: Pick<JarvisProject, "repos"> | null;
  readonly workspace: JarvisConversationWorkspace | null | undefined;
  readonly staging: ProjectConversationWorkspaceStaging;
  readonly disabled?: boolean;
  readonly onStagingChange: (staging: ProjectConversationWorkspaceStaging) => void;
}

const ENGINE_OPTIONS: ReadonlyArray<{
  readonly value: ProjectConversationWorkspaceEngine;
  readonly label: string;
}> = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
];

export const BrainWorkspaceStrip = memo(function BrainWorkspaceStrip(
  props: BrainWorkspaceStripProps,
) {
  const workspace = props.workspace ?? null;
  const stagedCount = props.staging.repos.length;
  const projectRepos = props.project?.repos ?? [];
  const attachedNames = workspaceRepoNames(workspace);

  return (
    <div
      data-chat-composer-brain-workspace-strip="true"
      className={cn(
        "relative z-0 mx-2 mt-1.5 rounded-[16px] border border-border/55 bg-muted/45 px-2.5 py-2 shadow-sm backdrop-blur",
        props.compact ? "flex items-center gap-2" : "flex min-w-0 items-center gap-1",
      )}
    >
      {workspace === null ? (
        <>
          <WorkspaceRepoMenu
            label="Attach repos"
            icon="attach"
            repos={projectRepos}
            attachedNames={attachedNames}
            staging={props.staging}
            disabled={props.disabled}
            onStagingChange={props.onStagingChange}
          />
          <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
          <WorkspaceEngineMenu
            staging={props.staging}
            disabled={props.disabled}
            onStagingChange={props.onStagingChange}
          />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {stagedCount > 0
              ? `${stagedCount} repo${stagedCount === 1 ? "" : "s"} staged for workspace`
              : "Planning only - no repo access"}
          </span>
        </>
      ) : (
        <>
          <WorkspaceEngineMenu
            staging={props.staging}
            disabled={props.disabled}
            onStagingChange={props.onStagingChange}
          />
          <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
          <WorkspaceLiveSummary workspace={workspace} />
          <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
          <WorkspaceRepoMenu
            label={stagedCount > 0 ? `Add repo (${stagedCount})` : "Add repo"}
            icon="add"
            repos={projectRepos}
            attachedNames={attachedNames}
            staging={props.staging}
            disabled={props.disabled}
            onStagingChange={props.onStagingChange}
          />
        </>
      )}
    </div>
  );
});

function WorkspaceRepoMenu(props: {
  readonly label: string;
  readonly icon: "attach" | "add";
  readonly repos: ReadonlyArray<JarvisProjectRepository>;
  readonly attachedNames: ReadonlySet<string>;
  readonly staging: ProjectConversationWorkspaceStaging;
  readonly disabled: boolean | undefined;
  readonly onStagingChange: (staging: ProjectConversationWorkspaceStaging) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0 max-w-44 shrink justify-start whitespace-nowrap px-2 text-muted-foreground/75 hover:text-foreground/85 sm:px-3"
            aria-label={props.label}
            disabled={props.disabled || props.repos.length === 0}
          />
        }
      >
        {props.icon === "add" ? (
          <PlusIcon className="size-4 shrink-0" />
        ) : (
          <FolderGit2Icon className="size-4 shrink-0" />
        )}
        <span className="min-w-0 truncate">{props.label}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="min-w-80">
        <MenuGroup>
          <MenuGroupLabel>Repositories</MenuGroupLabel>
          {props.repos.length === 0 ? (
            <MenuGroupLabel className="max-w-72 normal-case text-muted-foreground">
              Add repositories to this project before attaching a workspace.
            </MenuGroupLabel>
          ) : (
            props.repos.map((repo) => {
              const staged = props.staging.repos.find((candidate) => candidate.name === repo.name);
              const attached =
                props.attachedNames.has(repo.name) || props.attachedNames.has(repo.remote);
              const selected = staged !== undefined;
              return (
                <div key={`${repo.name}:${repo.remote}`} className="space-y-1">
                  <MenuCheckboxItem
                    checked={selected}
                    disabled={attached && !selected}
                    onClick={(event) => {
                      event.preventDefault();
                      props.onStagingChange(
                        toggleProjectConversationWorkspaceRepo(props.staging, repo.name),
                      );
                    }}
                  >
                    <span className="min-w-0 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{repoLabel(repo)}</span>
                      {repo.default ? (
                        <span className="text-[11px] text-muted-foreground">default</span>
                      ) : null}
                      {attached ? (
                        <span className="text-[11px] text-muted-foreground">attached</span>
                      ) : null}
                    </span>
                  </MenuCheckboxItem>
                  {selected ? (
                    <div
                      className="px-2 pb-2 ps-8"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Input
                        size="sm"
                        value={staged.baseRef}
                        placeholder="origin/main"
                        aria-label={`${repo.name} base ref`}
                        onChange={(event) =>
                          props.onStagingChange(
                            setProjectConversationWorkspaceRepoBaseRef(
                              props.staging,
                              repo.name,
                              event.currentTarget.value,
                            ),
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function WorkspaceEngineMenu(props: {
  readonly staging: ProjectConversationWorkspaceStaging;
  readonly disabled: boolean | undefined;
  readonly onStagingChange: (staging: ProjectConversationWorkspaceStaging) => void;
}) {
  const selected = ENGINE_OPTIONS.find((option) => option.value === props.staging.engine);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0 max-w-40 shrink justify-start whitespace-nowrap px-2 text-muted-foreground/75 hover:text-foreground/85 sm:px-3"
            aria-label="Select workspace engine"
            disabled={props.disabled}
          />
        }
      >
        <ServerIcon className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{selected?.label ?? "Codex"}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="min-w-44">
        <MenuGroup>
          <MenuGroupLabel>Engine</MenuGroupLabel>
          <MenuRadioGroup
            value={props.staging.engine}
            onValueChange={(value) =>
              props.onStagingChange(setProjectConversationWorkspaceEngine(props.staging, value))
            }
          >
            {ENGINE_OPTIONS.map((option) => (
              <MenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function WorkspaceLiveSummary({ workspace }: { readonly workspace: JarvisConversationWorkspace }) {
  const worker = workspace.worker_id?.trim() || "auto worker";
  const worktreeCount = workspace.worktrees.length;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1 truncate">
        <ServerIcon className="size-3.5 shrink-0" />
        <span className="truncate">{worker}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <GitBranchIcon className="size-3.5" />
        {worktreeCount} worktree{worktreeCount === 1 ? "" : "s"}
      </span>
      {workspace.status ? <span className="truncate">{workspace.status}</span> : null}
      {workspace.provision_phase ? (
        <span className="truncate">{workspace.provision_phase}</span>
      ) : null}
    </div>
  );
}

function repoLabel(repo: JarvisProjectRepository): string {
  if (repo.remote.trim().length === 0 || repo.remote === repo.name) {
    return repo.name;
  }
  return `${repo.name} - ${repo.remote}`;
}
