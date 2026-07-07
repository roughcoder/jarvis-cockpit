import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectConclusion,
  JarvisProjectFile,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  BotIcon,
  BrainIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  appendProjectRepositoryDraftRow,
  buildProjectFileUploadInput,
  buildProjectMemoryRecordInput,
  buildProjectRepositoryDraftRows,
  findProjectById,
  patchProjectRepositoryDraftRow,
  removeProjectRepositoryDraftRow,
  setDefaultProjectRepositoryDraftRow,
  validateAddedProjectRepositoryDraft,
  type ProjectMemoryRecordKind,
  type ProjectRepositoryDraftRow,
} from "./ProjectView.logic";
import {
  formatProjectWriteFailure,
  projectRepositoryValidationSummary,
  repoNameFromRemote,
  validateProjectRepositoryDrafts,
} from "./settings/JarvisProjects.logic";
import { cn } from "../lib/utils";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

interface ProjectViewProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
}

type PendingProjectAction =
  | {
      readonly kind: "archive";
      readonly project: Pick<JarvisProject, "id" | "name">;
    }
  | {
      readonly kind: "delete";
      readonly project: Pick<JarvisProject, "id" | "name">;
    };

type ProjectWriteModal = "upload-file" | "record-memory" | "add-repository" | null;

function formatOptionalValue(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function formatObservedAt(value: string | null | undefined): string {
  return value ? formatRelativeTimeLabel(value) : "Unobserved";
}

function visibleFiles(files: ReadonlyArray<JarvisProjectFile>): ReadonlyArray<JarvisProjectFile> {
  return files.filter((file) => file.retracted !== true);
}

function newestConclusions(
  conclusions: ReadonlyArray<JarvisProjectConclusion>,
): ReadonlyArray<JarvisProjectConclusion> {
  return [...conclusions]
    .sort((left, right) => (right.observed_at ?? "").localeCompare(left.observed_at ?? ""))
    .slice(0, 5);
}

function textToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function actionTitle(action: PendingProjectAction | null): string {
  switch (action?.kind) {
    case "archive":
      return `Archive ${action.project.name}?`;
    case "delete":
      return `Delete ${action.project.name}?`;
    default:
      return "Confirm project action";
  }
}

function actionDescription(action: PendingProjectAction | null): string {
  switch (action?.kind) {
    case "archive":
      return "Jarvis will archive this project through the project API. Cockpit will keep it visible if the write fails.";
    case "delete":
      return "Jarvis will delete this project through the project API. This is destructive and Cockpit will not hide anything unless Jarvis confirms success.";
    default:
      return "";
  }
}

function actionButtonLabel(action: PendingProjectAction | null): string {
  switch (action?.kind) {
    case "archive":
      return "Archive project";
    case "delete":
      return "Delete project";
    default:
      return "Confirm";
  }
}

export function ProjectView({ environmentId, projectId }: ProjectViewProps) {
  const navigate = useNavigate();
  const projectsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjects({
      environmentId,
      input: { includeArchived: false },
    }),
  );
  const memoryQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectMemory({
      environmentId,
      input: { projectId },
    }),
  );
  const filesQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectFiles({
      environmentId,
      input: { projectId, includeRetracted: false },
    }),
  );
  const updateProject = useAtomCommand(serverEnvironment.updateJarvisProject, {
    reportFailure: false,
  });
  const recordFinding = useAtomCommand(serverEnvironment.recordJarvisProjectFinding, {
    reportFailure: false,
  });
  const recordDecision = useAtomCommand(serverEnvironment.recordJarvisProjectDecision, {
    reportFailure: false,
  });
  const uploadProjectFile = useAtomCommand(serverEnvironment.uploadJarvisProjectFile, {
    reportFailure: false,
  });
  const archiveProject = useAtomCommand(serverEnvironment.archiveJarvisProject, {
    reportFailure: false,
  });
  const deleteProject = useAtomCommand(serverEnvironment.deleteJarvisProject, {
    reportFailure: false,
  });

  const project =
    projectsQuery.data?.ok === true
      ? findProjectById(projectsQuery.data.projects ?? [], projectId)
      : null;
  const memory = memoryQuery.data?.ok === true ? (memoryQuery.data.memory ?? null) : null;
  const files = useMemo(
    () => visibleFiles(filesQuery.data?.ok === true ? (filesQuery.data.files ?? []) : []),
    [filesQuery.data],
  );
  const conclusions = useMemo(
    () => newestConclusions(memory?.conclusions ?? []),
    [memory?.conclusions],
  );
  const [editingRepos, setEditingRepos] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [repoDrafts, setRepoDrafts] = useState<ReadonlyArray<ProjectRepositoryDraftRow>>([]);
  const [pendingAction, setPendingAction] = useState<PendingProjectAction | null>(null);
  const [writingProject, setWritingProject] = useState(false);
  const [activeWriteModal, setActiveWriteModal] = useState<ProjectWriteModal>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [fileArtifactType, setFileArtifactType] = useState("spec");
  const [fileName, setFileName] = useState("project-note.md");
  const [fileContent, setFileContent] = useState("");
  const [fileWriteError, setFileWriteError] = useState<string | null>(null);
  const [writingFile, setWritingFile] = useState(false);
  const [memoryKind, setMemoryKind] = useState<ProjectMemoryRecordKind>("finding");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryWriteError, setMemoryWriteError] = useState<string | null>(null);
  const [writingMemory, setWritingMemory] = useState(false);
  const [addRepositoryDraft, setAddRepositoryDraft] = useState({
    name: "",
    remote: "",
    default: false,
  });
  const [addRepositoryError, setAddRepositoryError] = useState<string | null>(null);
  const repoRowIdCounter = useRef(0);
  const repositoryValidation = useMemo(
    () => validateProjectRepositoryDrafts(repoDrafts),
    [repoDrafts],
  );

  const resetDrafts = (nextProject: JarvisProject | null) => {
    repoRowIdCounter.current = 0;
    setProjectName(nextProject?.name ?? "");
    setRepoDrafts(
      nextProject
        ? buildProjectRepositoryDraftRows({
            repos: nextProject.repos,
            makeRowId: () => `project-repo-${repoRowIdCounter.current++}`,
          })
        : [],
    );
  };

  useEffect(() => {
    resetDrafts(project);
    setEditingRepos(false);
  }, [project]);

  const refreshProjectData = () => {
    projectsQuery.refresh();
    memoryQuery.refresh();
    filesQuery.refresh();
  };

  const openUploadFileModal = () => {
    setFileWriteError(null);
    setActiveWriteModal("upload-file");
  };

  const openRecordMemoryModal = () => {
    setMemoryWriteError(null);
    setActiveWriteModal("record-memory");
  };

  const openAddRepositoryModal = () => {
    setAddRepositoryDraft({ name: "", remote: "", default: repoDrafts.length === 0 });
    setAddRepositoryError(null);
    setActiveWriteModal("add-repository");
  };

  const updateRepositoryDraft = (
    index: number,
    patch: Partial<Omit<ProjectRepositoryDraftRow, "rowId">>,
  ) => {
    setRepoDrafts((drafts) => patchProjectRepositoryDraftRow(drafts, index, patch));
  };

  const inferRepositoryName = (index: number) => {
    setRepoDrafts((drafts) => {
      const repo = drafts[index];
      if (!repo || repo.name.trim().length > 0) {
        return drafts;
      }
      return patchProjectRepositoryDraftRow(drafts, index, {
        name: repoNameFromRemote(repo.remote.trim()),
      });
    });
  };

  const inferAddedRepositoryName = () => {
    setAddRepositoryDraft((draft) => {
      if (draft.name.trim().length > 0) {
        return draft;
      }
      return { ...draft, name: repoNameFromRemote(draft.remote.trim()) };
    });
  };

  const uploadFile = async () => {
    if (writingFile) {
      return;
    }
    const uploadInput = buildProjectFileUploadInput(
      {
        title: fileTitle,
        artifactType: fileArtifactType,
        filename: fileName,
        content: fileContent,
      },
      textToBase64,
    );
    if (!uploadInput.ok) {
      setFileWriteError(uploadInput.message);
      return;
    }

    setWritingFile(true);
    setFileWriteError(null);
    const result = await uploadProjectFile({
      environmentId,
      input: {
        projectId,
        input: uploadInput.input,
      },
    });
    setWritingFile(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        setFileWriteError(formatProjectWriteFailure(squashAtomCommandFailure(result)));
      }
      return;
    }
    if (!result.value.ok) {
      setFileWriteError(
        formatProjectWriteFailure(result.value.error?.message ?? "Jarvis did not upload the file."),
      );
      return;
    }

    setFileContent("");
    setActiveWriteModal(null);
    await filesQuery.refresh();
    toastManager.add({
      type: "success",
      title: "Project file uploaded",
      description: uploadInput.input.title,
    });
  };

  const recordMemory = async () => {
    if (writingMemory) {
      return;
    }
    const memoryInput = buildProjectMemoryRecordInput({
      kind: memoryKind,
      content: memoryContent,
    });
    if (!memoryInput.ok) {
      setMemoryWriteError(memoryInput.message);
      return;
    }

    const command = memoryInput.command === "recordFinding" ? recordFinding : recordDecision;
    setWritingMemory(true);
    setMemoryWriteError(null);
    const result = await command({
      environmentId,
      input: {
        projectId,
        input: memoryInput.input,
      },
    });
    setWritingMemory(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        setMemoryWriteError(formatProjectWriteFailure(squashAtomCommandFailure(result)));
      }
      return;
    }
    if (!result.value.ok) {
      setMemoryWriteError(
        formatProjectWriteFailure(
          result.value.error?.message ?? `Jarvis did not record the ${memoryInput.kind}.`,
        ),
      );
      return;
    }

    setMemoryContent("");
    setActiveWriteModal(null);
    await memoryQuery.refresh();
    toastManager.add({
      type: "success",
      title: `${memoryInput.kind === "finding" ? "Finding" : "Decision"} recorded`,
    });
  };

  const addRepository = async () => {
    if (!project || writingProject) {
      return;
    }
    const rowId = `project-repo-${repoRowIdCounter.current}`;
    const addValidation = validateAddedProjectRepositoryDraft({
      drafts: repoDrafts,
      draft: addRepositoryDraft,
      rowId,
    });
    if (!addValidation.ok) {
      setAddRepositoryError(projectRepositoryValidationSummary(addValidation));
      return;
    }

    setWritingProject(true);
    setAddRepositoryError(null);
    const result = await updateProject({
      environmentId,
      input: {
        projectId: project.id,
        input: {
          name: project.name,
          repos: addValidation.repos,
        },
      },
    });
    setWritingProject(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        setAddRepositoryError(formatProjectWriteFailure(squashAtomCommandFailure(result)));
      }
      return;
    }
    if (!result.value.ok || !result.value.project) {
      setAddRepositoryError(
        formatProjectWriteFailure(
          result.value.error?.message ?? "Jarvis did not return a project.",
        ),
      );
      return;
    }

    repoRowIdCounter.current += 1;
    setRepoDrafts(addValidation.drafts);
    setActiveWriteModal(null);
    await projectsQuery.refresh();
    toastManager.add({
      type: "success",
      title: "Repository added",
      description: addValidation.repos.at(-1)?.remote,
    });
  };

  const saveProject = async () => {
    if (!project || writingProject) {
      return;
    }
    const name = projectName.trim();
    if (name.length === 0) {
      toastManager.add({ type: "error", title: "Project name is required" });
      return;
    }
    if (!repositoryValidation.ok) {
      toastManager.add({
        type: "error",
        title: "Project repositories need attention",
        description: projectRepositoryValidationSummary(repositoryValidation),
      });
      return;
    }

    setWritingProject(true);
    const result = await updateProject({
      environmentId,
      input: {
        projectId: project.id,
        input: {
          name,
          repos: repositoryValidation.repos,
        },
      },
    });
    setWritingProject(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not update project",
          description: formatProjectWriteFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (!result.value.ok || !result.value.project) {
      toastManager.add({
        type: "error",
        title: "Could not update project",
        description: formatProjectWriteFailure(
          result.value.error?.message ?? "Jarvis did not return a project.",
        ),
      });
      return;
    }

    projectsQuery.refresh();
    setEditingRepos(false);
    toastManager.add({ type: "success", title: "Project updated", description: name });
  };

  const confirmProjectAction = async () => {
    const action = pendingAction;
    if (!action || writingProject) {
      return;
    }
    setPendingAction(null);
    setWritingProject(true);
    const result =
      action.kind === "archive"
        ? await archiveProject({
            environmentId,
            input: {
              projectId: action.project.id,
              input: { reason: "Archived from Jarvis Cockpit" },
            },
          })
        : await deleteProject({
            environmentId,
            input: {
              projectId: action.project.id,
            },
          });
    setWritingProject(false);

    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title:
            action.kind === "archive" ? "Could not archive project" : "Could not delete project",
          description: formatProjectWriteFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (!result.value.ok) {
      toastManager.add({
        type: "error",
        title: action.kind === "archive" ? "Could not archive project" : "Could not delete project",
        description: formatProjectWriteFailure(
          result.value.error?.message ??
            (action.kind === "archive"
              ? "Jarvis did not archive the project."
              : "Jarvis did not delete the project."),
        ),
      });
      return;
    }

    toastManager.add({
      type: "success",
      title: action.kind === "archive" ? "Project archived" : "Project deleted",
      description: action.project.name,
    });
    projectsQuery.refresh();
    void navigate({ to: "/" });
  };

  const projectQueryFailed = projectsQuery.error !== null || projectsQuery.data?.ok === false;
  const loadingProject = projectsQuery.isPending && !projectsQuery.data;
  const repositoryValidationErrors = repositoryValidation.ok ? [] : repositoryValidation.errors;

  if (loadingProject) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          Loading project
        </div>
      </div>
    );
  }

  if (projectQueryFailed) {
    return (
      <div className="flex min-h-0 flex-1 bg-background px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <Alert variant="error">
            <TriangleAlertIcon />
            <AlertTitle>Project registry unavailable</AlertTitle>
            <AlertDescription>
              {projectsQuery.error ??
                projectsQuery.data?.error?.message ??
                "Jarvis did not return projects."}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>Project not found</EmptyTitle>
          <EmptyDescription>
            Jarvis did not return an active project matching {projectId}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const statusLabel = formatOptionalValue(project.status, "active");
  const defaultRepo = project.repos.find((repo) => repo.default) ?? project.repos[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{statusLabel}</Badge>
              <Badge variant="secondary">{project.repos.length} repos</Badge>
              <Badge variant="secondary">{files.length} files</Badge>
            </div>
            <div className="space-y-1">
              <h1 className="truncate text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
                {project.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{project.peer_id}</span>
                {project.owner ? <span>Owner {project.owner}</span> : null}
                {project.visibility ? <span>{project.visibility}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refreshProjectData}>
              <RefreshCwIcon
                className={cn(
                  "size-4",
                  (projectsQuery.isPending || memoryQuery.isPending || filesQuery.isPending) &&
                    "animate-spin",
                )}
              />
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingRepos(true)}>
              <PencilIcon className="size-4" />
              Edit repos
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link
                  to="/jarvis-project/$environmentId/$projectId/orchestration"
                  params={{ environmentId, projectId }}
                />
              }
            >
              <BotIcon className="size-4" />
              Orchestration
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
          <section className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Repositories</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {defaultRepo
                      ? `Default remote ${defaultRepo.remote}`
                      : "No repositories recorded."}
                  </p>
                </div>
                {editingRepos ? (
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        resetDrafts(project);
                        setEditingRepos(false);
                      }}
                    >
                      <XIcon className="size-3" />
                      Cancel
                    </Button>
                    <Button size="xs" onClick={() => void saveProject()} disabled={writingProject}>
                      {writingProject ? (
                        <LoaderIcon className="size-3 animate-spin" />
                      ) : (
                        <SaveIcon className="size-3" />
                      )}
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button size="xs" variant="outline" onClick={openAddRepositoryModal}>
                    <PlusIcon className="size-3" />
                    Add repository
                  </Button>
                )}
              </div>

              {editingRepos ? (
                <div className="mt-4 space-y-3">
                  {!repositoryValidation.ok ? (
                    <Alert variant="error">
                      <TriangleAlertIcon />
                      <AlertTitle>Repository validation failed</AlertTitle>
                      <AlertDescription>
                        {projectRepositoryValidationSummary(repositoryValidation)}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {repoDrafts.map((repo, index) => {
                    const rowErrors = repositoryValidationErrors.filter(
                      (error) => error.rowIndex === index,
                    );
                    const nameError = rowErrors.find((error) => error.field === "name")?.message;
                    const remoteError = rowErrors.find(
                      (error) => error.field === "remote",
                    )?.message;
                    return (
                      <div
                        key={repo.rowId}
                        className="grid gap-3 rounded-md border border-border/70 bg-background/70 p-3 md:grid-cols-[minmax(8rem,0.7fr)_minmax(12rem,1.3fr)_auto_auto] md:items-start"
                      >
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Name</span>
                          <Input
                            value={repo.name}
                            onChange={(event) =>
                              updateRepositoryDraft(index, { name: event.currentTarget.value })
                            }
                            aria-label={`Repository ${index + 1} name`}
                            aria-invalid={Boolean(nameError)}
                          />
                          {nameError ? (
                            <span className="block text-xs text-destructive">{nameError}</span>
                          ) : null}
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Remote</span>
                          <Input
                            value={repo.remote}
                            onBlur={() => inferRepositoryName(index)}
                            onChange={(event) =>
                              updateRepositoryDraft(index, { remote: event.currentTarget.value })
                            }
                            aria-label={`Repository ${index + 1} remote`}
                            aria-invalid={Boolean(remoteError)}
                          />
                          {remoteError ? (
                            <span className="block text-xs text-destructive">{remoteError}</span>
                          ) : null}
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 md:mt-5">
                          <span className="text-sm text-foreground">Default</span>
                          <Switch
                            checked={repo.default}
                            onCheckedChange={(checked) =>
                              setRepoDrafts((drafts) =>
                                setDefaultProjectRepositoryDraftRow(drafts, index, checked),
                              )
                            }
                            aria-label={`Repository ${index + 1} default`}
                          />
                        </label>
                        <Button
                          size="icon-sm"
                          variant="destructive-outline"
                          onClick={() =>
                            setRepoDrafts((drafts) =>
                              removeProjectRepositoryDraftRow(drafts, index),
                            )
                          }
                          aria-label={`Remove repository ${index + 1}`}
                          className="md:mt-5"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setRepoDrafts((drafts) =>
                        appendProjectRepositoryDraftRow(
                          drafts,
                          `project-repo-${repoRowIdCounter.current++}`,
                        ),
                      )
                    }
                  >
                    <PlusIcon className="size-3" />
                    Add repository
                  </Button>
                </div>
              ) : (
                <div className="mt-4 grid gap-2">
                  {project.repos.map((repo) => (
                    <div
                      key={`${repo.remote}:${repo.name}`}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium text-foreground">
                            {repo.name}
                          </span>
                          {repo.default ? <Badge variant="success">Default</Badge> : null}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {repo.remote}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Project Memory</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {memoryQuery.isPending && !memoryQuery.data
                      ? "Loading memory"
                      : memory?.representation || "No representation recorded."}
                  </p>
                </div>
                <Button size="icon-sm" variant="outline" onClick={openRecordMemoryModal}>
                  <PlusIcon className="size-4" />
                  <span className="sr-only">Record memory</span>
                </Button>
              </div>
              {memoryQuery.data?.ok === false || memoryQuery.error ? (
                <Alert variant="error" className="mt-4">
                  <TriangleAlertIcon />
                  <AlertTitle>Memory failed</AlertTitle>
                  <AlertDescription>
                    {memoryQuery.error ??
                      memoryQuery.data?.error?.message ??
                      "Jarvis did not return project memory."}
                  </AlertDescription>
                </Alert>
              ) : null}
              {conclusions.length > 0 ? (
                <div className="mt-4 divide-y divide-border/60">
                  {conclusions.map((conclusion) => (
                    <div key={conclusion.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{conclusion.artifact_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatObservedAt(conclusion.observed_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground">{conclusion.content}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <h2 className="text-sm font-semibold text-foreground">Project Details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase text-muted-foreground">
                    Project id
                  </dt>
                  <dd className="mt-1 break-all text-foreground">{project.id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-muted-foreground">
                    Files root
                  </dt>
                  <dd className="mt-1 break-all text-foreground">
                    {formatOptionalValue(project.files_root, "Not configured")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase text-muted-foreground">Members</dt>
                  <dd className="mt-1 text-foreground">
                    {project.members.length > 0 ? project.members.join(", ") : "No members"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="xs" variant="outline" render={<Link to="/settings/projects" />}>
                  <ExternalLinkIcon className="size-3" />
                  Settings
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    setPendingAction({
                      kind: "archive",
                      project: { id: project.id, name: project.name },
                    })
                  }
                  disabled={writingProject}
                >
                  <ArchiveIcon className="size-3" />
                  Archive
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() =>
                    setPendingAction({
                      kind: "delete",
                      project: { id: project.id, name: project.name },
                    })
                  }
                  disabled={writingProject}
                >
                  <Trash2Icon className="size-3" />
                  Delete
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Files</h2>
                <Button size="icon-sm" variant="outline" onClick={openUploadFileModal}>
                  <UploadIcon className="size-4" />
                  <span className="sr-only">Upload project file</span>
                </Button>
              </div>
              {filesQuery.data?.ok === false || filesQuery.error ? (
                <Alert variant="error" className="mt-4">
                  <TriangleAlertIcon />
                  <AlertTitle>Files failed</AlertTitle>
                  <AlertDescription>
                    {filesQuery.error ??
                      filesQuery.data?.error?.message ??
                      "Jarvis did not return project files."}
                  </AlertDescription>
                </Alert>
              ) : filesQuery.isPending && !filesQuery.data ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  Loading files
                </div>
              ) : files.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No active project files.</p>
              ) : (
                <div className="mt-4 divide-y divide-border/60">
                  {files.slice(0, 8).map((file) => (
                    <div key={file.doc_id} className="py-3 first:pt-0 last:pb-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {file.title || file.doc_id}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{file.artifact_type || "file"}</span>
                        <span>{formatObservedAt(file.observed_at)}</span>
                      </div>
                    </div>
                  ))}
                  {files.length > 8 ? (
                    <div className="pt-3 text-xs text-muted-foreground">
                      {files.length - 8} more files in settings
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <Dialog
        open={activeWriteModal === "upload-file"}
        onOpenChange={(open) => {
          if (writingFile) {
            return;
          }
          setActiveWriteModal(open ? "upload-file" : null);
          if (!open) {
            setFileWriteError(null);
          }
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadIcon className="size-4" />
              Upload project file
            </DialogTitle>
            <DialogDescription>
              Store a text artifact through the Jarvis project file API.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            {fileWriteError ? (
              <Alert variant="error">
                <TriangleAlertIcon />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{fileWriteError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Title</span>
                <Input
                  value={fileTitle}
                  onChange={(event) => setFileTitle(event.currentTarget.value)}
                  placeholder="Project plan"
                  disabled={writingFile}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Artifact type</span>
                <Input
                  value={fileArtifactType}
                  onChange={(event) => setFileArtifactType(event.currentTarget.value)}
                  placeholder="spec"
                  disabled={writingFile}
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">File name</span>
                <Input
                  value={fileName}
                  onChange={(event) => setFileName(event.currentTarget.value)}
                  placeholder="project-note.md"
                  disabled={writingFile}
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Content</span>
                <Textarea
                  value={fileContent}
                  onChange={(event) => setFileContent(event.currentTarget.value)}
                  placeholder="Project file content"
                  className="min-h-32"
                  disabled={writingFile}
                />
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActiveWriteModal(null);
                setFileWriteError(null);
              }}
              disabled={writingFile}
            >
              Cancel
            </Button>
            <Button onClick={() => void uploadFile()} disabled={writingFile}>
              {writingFile ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              Upload
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={activeWriteModal === "record-memory"}
        onOpenChange={(open) => {
          if (writingMemory) {
            return;
          }
          setActiveWriteModal(open ? "record-memory" : null);
          if (!open) {
            setMemoryWriteError(null);
          }
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainIcon className="size-4" />
              Record project memory
            </DialogTitle>
            <DialogDescription>
              Write an explicit finding or decision to Jarvis project memory.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            {memoryWriteError ? (
              <Alert variant="error">
                <TriangleAlertIcon />
                <AlertTitle>Memory write failed</AlertTitle>
                <AlertDescription>{memoryWriteError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/30 p-1">
              <Button
                variant={memoryKind === "finding" ? "default" : "ghost"}
                onClick={() => setMemoryKind("finding")}
                aria-pressed={memoryKind === "finding"}
                disabled={writingMemory}
              >
                Finding
              </Button>
              <Button
                variant={memoryKind === "decision" ? "default" : "ghost"}
                onClick={() => setMemoryKind("decision")}
                aria-pressed={memoryKind === "decision"}
                disabled={writingMemory}
              >
                Decision
              </Button>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Content</span>
              <Textarea
                value={memoryContent}
                onChange={(event) => setMemoryContent(event.currentTarget.value)}
                placeholder="A project decision or finding to preserve"
                className="min-h-32"
                disabled={writingMemory}
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActiveWriteModal(null);
                setMemoryWriteError(null);
              }}
              disabled={writingMemory}
            >
              Cancel
            </Button>
            <Button onClick={() => void recordMemory()} disabled={writingMemory}>
              {writingMemory ? <LoaderIcon className="size-4 animate-spin" /> : null}
              Record {memoryKind}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={activeWriteModal === "add-repository"}
        onOpenChange={(open) => {
          if (writingProject) {
            return;
          }
          setActiveWriteModal(open ? "add-repository" : null);
          if (!open) {
            setAddRepositoryError(null);
          }
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranchIcon className="size-4" />
              Add repository
            </DialogTitle>
            <DialogDescription>
              Add a project repository using the same validation as settings.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            {addRepositoryError ? (
              <Alert variant="error">
                <TriangleAlertIcon />
                <AlertTitle>Repository validation failed</AlertTitle>
                <AlertDescription>{addRepositoryError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <Input
                  value={addRepositoryDraft.name}
                  onChange={(event) =>
                    setAddRepositoryDraft((draft) => ({
                      ...draft,
                      name: event.currentTarget.value,
                    }))
                  }
                  placeholder="runtime"
                  disabled={writingProject}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Remote</span>
                <Input
                  value={addRepositoryDraft.remote}
                  onBlur={inferAddedRepositoryName}
                  onChange={(event) =>
                    setAddRepositoryDraft((draft) => ({
                      ...draft,
                      remote: event.currentTarget.value,
                    }))
                  }
                  placeholder="roughcoder/jarvis"
                  disabled={writingProject}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2">
                <span className="text-sm text-foreground">Default repository</span>
                <Switch
                  checked={addRepositoryDraft.default}
                  onCheckedChange={(checked) =>
                    setAddRepositoryDraft((draft) => ({ ...draft, default: checked }))
                  }
                  disabled={writingProject}
                />
              </label>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActiveWriteModal(null);
                setAddRepositoryError(null);
              }}
              disabled={writingProject}
            >
              Cancel
            </Button>
            <Button onClick={() => void addRepository()} disabled={writingProject}>
              {writingProject ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              Add repository
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionTitle(pendingAction)}</AlertDialogTitle>
            <AlertDialogDescription>{actionDescription(pendingAction)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => void confirmProjectAction()}
              disabled={writingProject}
            >
              {actionButtonLabel(pendingAction)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

export function ProjectOrchestrationPlaceholderView({
  environmentId,
  projectId,
}: ProjectViewProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-4 py-6 text-foreground">
      <div className="w-full max-w-xl rounded-lg border border-border/70 bg-muted/20 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
            <BotIcon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">
              Orchestration chat — coming soon
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {projectId} in {environmentId}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <Button
            size="sm"
            variant="outline"
            render={
              <Link
                to="/jarvis-project/$environmentId/$projectId"
                params={{ environmentId, projectId }}
              />
            }
          >
            Back to project
          </Button>
        </div>
      </div>
    </div>
  );
}
