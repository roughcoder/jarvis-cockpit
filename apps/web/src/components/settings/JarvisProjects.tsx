import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  BrainIcon,
  FileTextIcon,
  FolderGit2Icon,
  GitBranchIcon,
  MessagesSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import {
  JarvisProjectId,
  type JsonObject,
  type JarvisProject,
  type JarvisProjectFile,
  type JarvisProjectThread,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { usePrimaryEnvironment } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  formatCommandFailure,
  formatProjectConversationFailure,
  formatProjectWriteFailure,
  projectRepositoryValidationSummary,
  repoNameFromRemote,
  repositoryDraftsFromProjectRepos,
  validateProjectRepositoryDrafts,
  type ProjectRepositoryDraft,
} from "./JarvisProjects.logic";

function defaultRepo(project: JarvisProject | null): string | null {
  return project?.repos.find((repo) => repo.default)?.remote ?? project?.repos[0]?.remote ?? null;
}

function sortedProjects(projects: ReadonlyArray<JarvisProject>): ReadonlyArray<JarvisProject> {
  return [...projects].sort((left, right) => left.name.localeCompare(right.name));
}

function sortedThreads(
  threads: ReadonlyArray<JarvisProjectThread>,
): ReadonlyArray<JarvisProjectThread> {
  return [...threads].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function slugForProjectName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function parseConclusionIds(input: string): ReadonlyArray<string> | undefined {
  const ids = input
    .split(/[,\s]+/u)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

function textToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function jsonResultSummary(result: JsonObject | undefined): string | undefined {
  if (!result) {
    return undefined;
  }
  for (const key of ["result", "content_hash", "doc_id"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

const JARVIS_PROJECT_TEMPLATE = {
  id: "jarvis",
  name: "Jarvis",
  repos: [
    { name: "runtime", remote: "roughcoder/jarvis", default: true },
    { name: "cockpit", remote: "roughcoder/jarvis-cockpit", default: false },
  ],
} as const;

type PendingDestructiveAction =
  | {
      readonly kind: "archive-project";
      readonly projectId: JarvisProject["id"];
      readonly projectName: string;
    }
  | {
      readonly kind: "delete-project";
      readonly projectId: JarvisProject["id"];
      readonly projectName: string;
    }
  | {
      readonly kind: "retract-file";
      readonly projectId: JarvisProject["id"];
      readonly file: JarvisProjectFile;
    };

type ProjectRepositoryDraftRow = ProjectRepositoryDraft & {
  readonly rowId: string;
};

function destructiveActionTitle(action: PendingDestructiveAction | null): string {
  switch (action?.kind) {
    case "archive-project":
      return `Archive ${action.projectName}?`;
    case "delete-project":
      return `Delete ${action.projectName}?`;
    case "retract-file":
      return `Retract ${action.file.title || action.file.doc_id}?`;
    default:
      return "Confirm action";
  }
}

function destructiveActionDescription(action: PendingDestructiveAction | null): string {
  switch (action?.kind) {
    case "archive-project":
      return "Jarvis will archive this project through the project API. Cockpit will keep it visible if the write fails.";
    case "delete-project":
      return "Jarvis will delete this project through the project API. This is destructive and Cockpit will not hide anything unless Jarvis confirms success.";
    case "retract-file":
      return "Jarvis will retract this project file. Cockpit will keep the file visible if the retract write fails.";
    default:
      return "";
  }
}

function destructiveActionButtonLabel(action: PendingDestructiveAction | null): string {
  switch (action?.kind) {
    case "archive-project":
      return "Archive project";
    case "delete-project":
      return "Delete project";
    case "retract-file":
      return "Retract file";
    default:
      return "Confirm";
  }
}

export function JarvisProjectsPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.environmentId ?? null;
  const projectsQuery = useEnvironmentQuery(
    environmentId
      ? serverEnvironment.jarvisProjects({
          environmentId,
          input: { includeArchived: false },
        })
      : null,
  );
  const projects = useMemo(
    () => sortedProjects(projectsQuery.data?.projects ?? []),
    [projectsQuery.data?.projects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const selectedProject = isCreatingProject
    ? null
    : (projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null);
  const selectedId = selectedProject?.id ?? null;
  const memoryQuery = useEnvironmentQuery(
    environmentId && selectedId
      ? serverEnvironment.jarvisProjectMemory({
          environmentId,
          input: { projectId: selectedId },
        })
      : null,
  );
  const [includeRetractedFiles, setIncludeRetractedFiles] = useState(false);
  const filesQuery = useEnvironmentQuery(
    environmentId && selectedId
      ? serverEnvironment.jarvisProjectFiles({
          environmentId,
          input: { projectId: selectedId, includeRetracted: includeRetractedFiles },
        })
      : null,
  );
  const threadsQuery = useEnvironmentQuery(
    environmentId && selectedId
      ? serverEnvironment.jarvisProjectThreads({
          environmentId,
          input: { projectId: selectedId },
        })
      : null,
  );
  const threads = useMemo(
    () => sortedThreads(threadsQuery.data?.threads ?? []),
    [threadsQuery.data?.threads],
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const selectedThread =
    threads.find((thread) => thread.thread_id === selectedThreadId) ?? threads[0] ?? null;
  const [projectName, setProjectName] = useState("");
  const [projectIdInput, setProjectIdInput] = useState("");
  const [projectRepoDrafts, setProjectRepoDrafts] = useState<
    ReadonlyArray<ProjectRepositoryDraftRow>
  >([]);
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryQueryText, setMemoryQueryText] = useState("");
  const [memoryReplacement, setMemoryReplacement] = useState("");
  const [memoryConclusionIds, setMemoryConclusionIds] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [fileArtifactType, setFileArtifactType] = useState("spec");
  const [fileName, setFileName] = useState("project-note.md");
  const [fileContent, setFileContent] = useState("");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [turnText, setTurnText] = useState("");
  const [latestReply, setLatestReply] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] =
    useState<PendingDestructiveAction | null>(null);
  const nextProjectRepoDraftRowId = useRef(0);
  const makeProjectRepositoryDraftRow = useCallback(
    (draft: ProjectRepositoryDraft): ProjectRepositoryDraftRow => ({
      ...draft,
      rowId: `project-repo-${nextProjectRepoDraftRowId.current++}`,
    }),
    [],
  );
  const projectRepositoryValidation = useMemo(
    () => validateProjectRepositoryDrafts(projectRepoDrafts),
    [projectRepoDrafts],
  );
  const createProject = useAtomCommand(serverEnvironment.createJarvisProject, {
    reportFailure: false,
  });
  const updateProject = useAtomCommand(serverEnvironment.updateJarvisProject, {
    reportFailure: false,
  });
  const archiveProject = useAtomCommand(serverEnvironment.archiveJarvisProject, {
    reportFailure: false,
  });
  const deleteProject = useAtomCommand(serverEnvironment.deleteJarvisProject, {
    reportFailure: false,
  });
  const recordFinding = useAtomCommand(serverEnvironment.recordJarvisProjectFinding, {
    reportFailure: false,
  });
  const recordDecision = useAtomCommand(serverEnvironment.recordJarvisProjectDecision, {
    reportFailure: false,
  });
  const forgetMemory = useAtomCommand(serverEnvironment.forgetJarvisProjectMemory, {
    reportFailure: false,
  });
  const correctMemory = useAtomCommand(serverEnvironment.correctJarvisProjectMemory, {
    reportFailure: false,
  });
  const uploadProjectFile = useAtomCommand(serverEnvironment.uploadJarvisProjectFile, {
    reportFailure: false,
  });
  const retractProjectFile = useAtomCommand(serverEnvironment.retractJarvisProjectFile, {
    reportFailure: false,
  });
  const createThread = useAtomCommand(serverEnvironment.createJarvisProjectThread, {
    reportFailure: false,
  });
  const archiveThread = useAtomCommand(serverEnvironment.archiveJarvisProjectThread, {
    reportFailure: false,
  });
  const sendTurn = useAtomCommand(serverEnvironment.sendJarvisProjectThreadTurn, {
    reportFailure: false,
  });

  useEffect(() => {
    if (isCreatingProject) {
      return;
    }
    if (!selectedProject) {
      setProjectName("");
      setProjectIdInput("");
      setProjectRepoDrafts([]);
      return;
    }
    setProjectName(selectedProject.name);
    setProjectIdInput(selectedProject.id);
    setProjectRepoDrafts(
      repositoryDraftsFromProjectRepos(selectedProject.repos).map(makeProjectRepositoryDraftRow),
    );
  }, [isCreatingProject, makeProjectRepositoryDraftRow, selectedProject]);

  useEffect(() => {
    if (
      projectsQuery.data?.ok &&
      projects.length === 0 &&
      !isCreatingProject &&
      selectedProjectId === null
    ) {
      setIsCreatingProject(true);
      setProjectName(JARVIS_PROJECT_TEMPLATE.name);
      setProjectIdInput(JARVIS_PROJECT_TEMPLATE.id);
      setProjectRepoDrafts(JARVIS_PROJECT_TEMPLATE.repos.map(makeProjectRepositoryDraftRow));
    }
  }, [
    isCreatingProject,
    makeProjectRepositoryDraftRow,
    projects.length,
    projectsQuery.data?.ok,
    selectedProjectId,
  ]);

  const handleNewProjectDraft = () => {
    setIsCreatingProject(true);
    setSelectedProjectId(null);
    setSelectedThreadId(null);
    setLatestReply(null);
    setProjectName("");
    setProjectIdInput("");
    setProjectRepoDrafts([makeProjectRepositoryDraftRow({ name: "", remote: "", default: true })]);
  };

  const handleAddRepository = () => {
    setProjectRepoDrafts((drafts) => [
      ...drafts,
      makeProjectRepositoryDraftRow({ name: "", remote: "", default: drafts.length === 0 }),
    ]);
  };

  const handleRemoveRepository = (indexToRemove: number) => {
    setProjectRepoDrafts((drafts) => {
      const removedDefault = drafts[indexToRemove]?.default === true;
      const next = drafts.filter((_, index) => index !== indexToRemove);
      if (next.length === 0 || !removedDefault || next.some((repo) => repo.default)) {
        return next;
      }
      return next.map((repo, index) => (index === 0 ? { ...repo, default: true } : repo));
    });
  };

  const handleRepositoryDraftChange = (
    indexToUpdate: number,
    patch: Partial<ProjectRepositoryDraft>,
  ) => {
    setProjectRepoDrafts((drafts) =>
      drafts.map((repo, index) => (index === indexToUpdate ? { ...repo, ...patch } : repo)),
    );
  };

  const handleRepositoryRemoteBlur = (indexToUpdate: number) => {
    setProjectRepoDrafts((drafts) =>
      drafts.map((repo, index) => {
        if (index !== indexToUpdate || repo.name.trim().length > 0) {
          return repo;
        }
        const inferredName = repoNameFromRemote(repo.remote.trim());
        return { ...repo, name: inferredName };
      }),
    );
  };

  const handleRepositoryDefaultChange = (indexToUpdate: number, checked: boolean) => {
    setProjectRepoDrafts((drafts) =>
      drafts.map((repo, index) => ({
        ...repo,
        default: checked ? index === indexToUpdate : index === indexToUpdate ? false : repo.default,
      })),
    );
  };

  const handleCreateProject = async (draft?: {
    readonly id: string;
    readonly name: string;
    readonly repos: ReadonlyArray<ProjectRepositoryDraft>;
  }) => {
    if (!environmentId) return;
    const name = (draft?.name ?? projectName).trim();
    if (name.length === 0) {
      toastManager.add({ type: "error", title: "Project name is required" });
      return;
    }
    const id = (draft?.id ?? projectIdInput).trim() || slugForProjectName(name);
    const repoValidation = draft
      ? validateProjectRepositoryDrafts(draft.repos)
      : projectRepositoryValidation;
    if (!repoValidation.ok) {
      toastManager.add({
        type: "error",
        title: "Project repositories need attention",
        description: projectRepositoryValidationSummary(repoValidation),
      });
      return;
    }
    const result = await createProject({
      environmentId,
      input: {
        input: {
          id: JarvisProjectId.make(id),
          name,
          repos: repoValidation.repos,
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not create project",
          description: formatProjectWriteFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok && result.value.project) {
      setIsCreatingProject(false);
      setSelectedProjectId(result.value.project.id);
      await projectsQuery.refresh();
      toastManager.add({ type: "success", title: "Project created", description: name });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not create project",
      description: formatProjectWriteFailure(
        result.value.error?.message ?? "Jarvis did not return a project.",
      ),
    });
  };

  const handleUpdateProject = async () => {
    if (!environmentId || !selectedProject) return;
    const name = projectName.trim();
    if (name.length === 0) {
      toastManager.add({ type: "error", title: "Project name is required" });
      return;
    }
    if (!projectRepositoryValidation.ok) {
      toastManager.add({
        type: "error",
        title: "Project repositories need attention",
        description: projectRepositoryValidationSummary(projectRepositoryValidation),
      });
      return;
    }
    const result = await updateProject({
      environmentId,
      input: {
        projectId: selectedProject.id,
        input: {
          name,
          repos: projectRepositoryValidation.repos,
        },
      },
    });
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
    if (result.value.ok && result.value.project) {
      setSelectedProjectId(result.value.project.id);
      await projectsQuery.refresh();
      toastManager.add({ type: "success", title: "Project updated", description: name });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not update project",
      description: formatProjectWriteFailure(
        result.value.error?.message ?? "Jarvis did not return a project.",
      ),
    });
  };

  const handleArchiveProject = async (project: Pick<JarvisProject, "id" | "name">) => {
    if (!environmentId) return;
    const result = await archiveProject({
      environmentId,
      input: {
        projectId: project.id,
        input: { reason: "Archived from Jarvis Cockpit" },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not archive project",
          description: formatProjectWriteFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setSelectedProjectId(null);
      setSelectedThreadId(null);
      setLatestReply(null);
      await projectsQuery.refresh();
      toastManager.add({ type: "success", title: "Project archived" });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not archive project",
      description: formatProjectWriteFailure(
        result.value.error?.message ?? "Jarvis did not archive the project.",
      ),
    });
  };

  const handleDeleteProject = async (project: Pick<JarvisProject, "id" | "name">) => {
    if (!environmentId) return;
    const result = await deleteProject({
      environmentId,
      input: {
        projectId: project.id,
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not delete project",
          description: formatProjectWriteFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setSelectedProjectId(null);
      setSelectedThreadId(null);
      setLatestReply(null);
      await projectsQuery.refresh();
      toastManager.add({
        type: "success",
        title: "Project deleted",
        description: project.name,
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not delete project",
      description: formatProjectWriteFailure(
        result.value.error?.message ?? "Jarvis did not delete the project.",
      ),
    });
  };

  const handleRecordMemory = async (kind: "finding" | "decision") => {
    if (!environmentId || !selectedId) return;
    const content = memoryContent.trim();
    if (content.length === 0) {
      toastManager.add({ type: "error", title: "Memory content is required" });
      return;
    }
    const command = kind === "finding" ? recordFinding : recordDecision;
    const result = await command({
      environmentId,
      input: {
        projectId: selectedId,
        input: { content },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: `Could not record ${kind}`,
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setMemoryContent("");
      await memoryQuery.refresh();
      toastManager.add({
        type: "success",
        title: `${kind === "finding" ? "Finding" : "Decision"} recorded`,
        description: jsonResultSummary(result.value.result),
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: `Could not record ${kind}`,
      description: formatCommandFailure(result.value.error?.message),
    });
  };

  const handleForgetMemory = async () => {
    if (!environmentId || !selectedId) return;
    const query = memoryQueryText.trim();
    if (query.length === 0) {
      toastManager.add({ type: "error", title: "Memory query is required" });
      return;
    }
    const result = await forgetMemory({
      environmentId,
      input: {
        projectId: selectedId,
        input: {
          query,
          confirm: true,
          conclusion_ids: parseConclusionIds(memoryConclusionIds),
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not forget memory",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      await memoryQuery.refresh();
      toastManager.add({
        type: "success",
        title: "Memory forget requested",
        description: jsonResultSummary(result.value.result),
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not forget memory",
      description: formatCommandFailure(result.value.error?.message),
    });
  };

  const handleCorrectMemory = async () => {
    if (!environmentId || !selectedId) return;
    const query = memoryQueryText.trim();
    const replacement = memoryReplacement.trim();
    if (query.length === 0 || replacement.length === 0) {
      toastManager.add({ type: "error", title: "Query and replacement are required" });
      return;
    }
    const result = await correctMemory({
      environmentId,
      input: {
        projectId: selectedId,
        input: {
          query,
          replacement,
          confirm: true,
          conclusion_ids: parseConclusionIds(memoryConclusionIds),
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not correct memory",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setMemoryReplacement("");
      await memoryQuery.refresh();
      toastManager.add({
        type: "success",
        title: "Memory correction requested",
        description: jsonResultSummary(result.value.result),
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not correct memory",
      description: formatCommandFailure(result.value.error?.message),
    });
  };

  const handleUploadProjectFile = async () => {
    if (!environmentId || !selectedId) return;
    const filename = fileName.trim();
    const content = fileContent.trim();
    if (filename.length === 0 || content.length === 0) {
      toastManager.add({ type: "error", title: "File name and content are required" });
      return;
    }
    const result = await uploadProjectFile({
      environmentId,
      input: {
        projectId: selectedId,
        input: {
          filename,
          content_base64: textToBase64(fileContent),
          title: fileTitle.trim() || filename,
          artifact_type: fileArtifactType.trim() || "spec",
          mime_type: "text/markdown",
        },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not upload project file",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setFileContent("");
      await filesQuery.refresh();
      toastManager.add({
        type: "success",
        title: "Project file uploaded",
        description: jsonResultSummary(result.value.result),
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not upload project file",
      description: formatCommandFailure(result.value.error?.message),
    });
  };

  const handleRetractProjectFile = async (
    projectId: JarvisProject["id"],
    file: JarvisProjectFile,
  ) => {
    if (!environmentId) return;
    const result = await retractProjectFile({
      environmentId,
      input: {
        projectId,
        docId: file.doc_id,
        input: { reason: "Retracted from Jarvis Cockpit" },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not retract project file",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      await filesQuery.refresh();
      toastManager.add({
        type: "success",
        title: "Project file retracted",
        description: jsonResultSummary(result.value.result),
      });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not retract project file",
      description: formatCommandFailure(result.value.error?.message),
    });
  };

  const handleConfirmDestructiveAction = async () => {
    const action = pendingDestructiveAction;
    if (!action) return;
    setPendingDestructiveAction(null);
    switch (action.kind) {
      case "archive-project":
        await handleArchiveProject({ id: action.projectId, name: action.projectName });
        return;
      case "delete-project":
        await handleDeleteProject({ id: action.projectId, name: action.projectName });
        return;
      case "retract-file":
        await handleRetractProjectFile(action.projectId, action.file);
        return;
    }
  };

  const handleCreateThread = async () => {
    if (!environmentId || !selectedId) return;
    const title = newThreadTitle.trim() || `Conversation for ${selectedProject?.name ?? "project"}`;
    const result = await createThread({
      environmentId,
      input: {
        projectId: selectedId,
        input: { title },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not create conversation",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok && result.value.thread) {
      setSelectedThreadId(result.value.thread.thread_id);
      setNewThreadTitle("");
      await threadsQuery.refresh();
      toastManager.add({ type: "success", title: "Conversation created", description: title });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not create conversation",
      description: result.value.error?.message ?? "Jarvis did not return a conversation.",
    });
  };

  const handleArchiveThread = async (thread: JarvisProjectThread) => {
    if (!environmentId || !selectedId) return;
    const result = await archiveThread({
      environmentId,
      input: {
        projectId: selectedId,
        threadId: thread.thread_id,
        input: { reason: "Archived from Jarvis Cockpit" },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not archive conversation",
          description: formatProjectConversationFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok) {
      setSelectedThreadId(null);
      setLatestReply(null);
      await threadsQuery.refresh();
      toastManager.add({ type: "success", title: "Conversation archived" });
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not archive conversation",
      description: formatProjectConversationFailure(
        result.value.error?.message ?? "Jarvis did not archive the conversation.",
      ),
    });
  };

  const handleSendTurn = async () => {
    if (!environmentId || !selectedId || !selectedThread) return;
    const text = turnText.trim();
    if (text.length === 0) return;
    const result = await sendTurn({
      environmentId,
      input: {
        projectId: selectedId,
        threadId: selectedThread.thread_id,
        input: { text },
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not send turn",
          description: formatCommandFailure(squashAtomCommandFailure(result)),
        });
      }
      return;
    }
    if (result.value.ok && result.value.result) {
      setLatestReply(result.value.result.text || "Jarvis completed the turn.");
      setTurnText("");
      await threadsQuery.refresh();
      return;
    }
    toastManager.add({
      type: "error",
      title: "Could not send turn",
      description: result.value.error?.message ?? "Jarvis did not return a turn result.",
    });
  };

  const repositoryValidationErrors = projectRepositoryValidation.ok
    ? []
    : projectRepositoryValidation.errors;
  const projectRepositoriesValid = projectRepositoryValidation.ok;
  const projectNameValid = projectName.trim().length > 0;
  const canWriteProject = environmentId !== null && projectNameValid && projectRepositoriesValid;

  return (
    <SettingsPageContainer className="max-w-5xl">
      <SettingsSection
        title="Jarvis Projects"
        icon={<FolderGit2Icon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={projectsQuery.refresh}>
            <RefreshCwIcon className={cn("size-3", projectsQuery.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        {projectsQuery.isPending && !projectsQuery.data ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading Jarvis projects
          </div>
        ) : null}

        {projectsQuery.data?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Project registry failed</AlertTitle>
              <AlertDescription>
                {projectsQuery.data.error?.message ?? "Jarvis did not return projects."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {projects.map((project) => (
          <SettingsRow
            key={project.id}
            title={project.name}
            description={defaultRepo(project) ?? "No default repo"}
            status={`${project.repos.length} repos · ${project.status ?? "active"}`}
            control={
              <Button
                size="xs"
                variant={project.id === selectedId ? "default" : "outline"}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setIsCreatingProject(false);
                  setSelectedThreadId(null);
                  setLatestReply(null);
                }}
              >
                Open
              </Button>
            }
          >
            {project.id === selectedId ? (
              <div className="flex flex-wrap gap-2 pb-3 pt-3">
                {project.repos.map((repo) => (
                  <Badge key={`${project.id}:${repo.remote}`} variant="secondary">
                    <GitBranchIcon className="size-3" />
                    {repo.remote}
                    {repo.default ? " default" : ""}
                  </Badge>
                ))}
              </div>
            ) : null}
          </SettingsRow>
        ))}

        {projectsQuery.data?.ok && projects.length === 0 ? (
          <div className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FolderGit2Icon className="size-4" />
                  Add your first Jarvis project
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Jarvis Cockpit needs at least one project before work can be sent to workers.
                </p>
              </div>
              <Button size="sm" onClick={() => void handleCreateProject(JARVIS_PROJECT_TEMPLATE)}>
                <PlusIcon className="size-4" />
                Create Jarvis project
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Project Registry" icon={<FolderGit2Icon className="size-3.5" />}>
        <SettingsRow
          title="Project"
          description={selectedProject ? selectedProject.peer_id : "New Jarvis project"}
          control={
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={handleNewProjectDraft}>
                New
              </Button>
              <Button
                size="sm"
                onClick={() => void handleCreateProject()}
                disabled={!canWriteProject}
              >
                <PlusIcon className="size-4" />
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleUpdateProject()}
                disabled={!selectedProject || !canWriteProject}
              >
                Update
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!selectedProject) return;
                  setPendingDestructiveAction({
                    kind: "archive-project",
                    projectId: selectedProject.id,
                    projectName: selectedProject.name,
                  });
                }}
                disabled={!selectedProject}
              >
                <ArchiveIcon className="size-4" />
                Archive
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (!selectedProject) return;
                  setPendingDestructiveAction({
                    kind: "delete-project",
                    projectId: selectedProject.id,
                    projectName: selectedProject.name,
                  });
                }}
                disabled={!selectedProject}
              >
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            </div>
          }
        >
          <div className="grid gap-3 pb-4 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
            <Input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
            />
            <Input
              value={projectIdInput}
              onChange={(event) => setProjectIdInput(event.target.value)}
              placeholder="Project id"
              aria-label="Project id"
              disabled={!isCreatingProject && Boolean(selectedProject)}
            />
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">Repositories</div>
                <Button size="xs" variant="outline" onClick={handleAddRepository}>
                  <PlusIcon className="size-3" />
                  Add row
                </Button>
              </div>
              {!projectRepositoryValidation.ok ? (
                <Alert variant="error">
                  <TriangleAlertIcon />
                  <AlertTitle>Repository validation failed</AlertTitle>
                  <AlertDescription>
                    {projectRepositoryValidationSummary(projectRepositoryValidation)}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                {projectRepoDrafts.map((repo, index) => {
                  const rowErrors = repositoryValidationErrors.filter(
                    (error) => error.rowIndex === index,
                  );
                  const nameError = rowErrors.find((error) => error.field === "name")?.message;
                  const remoteError = rowErrors.find((error) => error.field === "remote")?.message;
                  return (
                    <div
                      key={repo.rowId}
                      className="rounded-lg border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="grid gap-3 md:grid-cols-[minmax(8rem,0.75fr)_minmax(12rem,1.25fr)_auto_auto] md:items-start">
                        <label className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Name</span>
                          <Input
                            value={repo.name}
                            onChange={(event) =>
                              handleRepositoryDraftChange(index, {
                                name: event.currentTarget.value,
                              })
                            }
                            placeholder="runtime"
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
                            onBlur={() => handleRepositoryRemoteBlur(index)}
                            onChange={(event) =>
                              handleRepositoryDraftChange(index, {
                                remote: event.currentTarget.value,
                              })
                            }
                            placeholder="roughcoder/jarvis"
                            aria-label={`Repository ${index + 1} remote`}
                            aria-invalid={Boolean(remoteError)}
                          />
                          {remoteError ? (
                            <span className="block text-xs text-destructive">{remoteError}</span>
                          ) : null}
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/70 px-3 py-2 md:mt-5">
                          <span className="text-sm text-foreground">Default</span>
                          <Switch
                            checked={repo.default}
                            onCheckedChange={(checked) =>
                              handleRepositoryDefaultChange(index, checked)
                            }
                            aria-label={`Repository ${index + 1} default`}
                          />
                        </label>
                        <Button
                          size="icon-sm"
                          variant="destructive-outline"
                          onClick={() => handleRemoveRepository(index)}
                          aria-label={`Remove repository ${index + 1}`}
                          className="md:mt-5"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Project Memory"
        icon={<BrainIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={memoryQuery.refresh} disabled={!selectedId}>
            <RefreshCwIcon className={cn("size-3", memoryQuery.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        {!selectedProject ? (
          <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
            Select a Jarvis project.
          </div>
        ) : null}
        {selectedProject && memoryQuery.data?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Memory failed</AlertTitle>
              <AlertDescription>
                {memoryQuery.data.error?.message ?? "Jarvis did not return project memory."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        {selectedProject && memoryQuery.data?.memory ? (
          <>
            <SettingsRow
              title="Representation"
              description={memoryQuery.data.memory.representation || "No representation recorded."}
            />
            {memoryQuery.data.memory.conclusions.map((conclusion) => (
              <SettingsRow
                key={conclusion.id}
                title={conclusion.artifact_type}
                description={conclusion.content}
                status={conclusion.recorded_by ?? undefined}
              />
            ))}
          </>
        ) : null}
        <SettingsRow
          title="Record memory"
          description="Writes an explicit finding or decision to Jarvis project memory."
          control={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRecordMemory("finding")}
                disabled={!selectedId || memoryContent.trim().length === 0}
              >
                Record finding
              </Button>
              <Button
                size="sm"
                onClick={() => void handleRecordMemory("decision")}
                disabled={!selectedId || memoryContent.trim().length === 0}
              >
                Record decision
              </Button>
            </div>
          }
        >
          <div className="pb-4 pt-3">
            <Textarea
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
              placeholder="A project decision or finding to preserve"
              aria-label="Project memory content"
              disabled={!selectedId}
              className="min-h-24"
            />
          </div>
        </SettingsRow>
        <SettingsRow
          title="Maintain memory"
          description="Routes forget and correction requests through Jarvis memory curation."
          control={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleForgetMemory()}
                disabled={!selectedId || memoryQueryText.trim().length === 0}
              >
                Forget
              </Button>
              <Button
                size="sm"
                onClick={() => void handleCorrectMemory()}
                disabled={
                  !selectedId ||
                  memoryQueryText.trim().length === 0 ||
                  memoryReplacement.trim().length === 0
                }
              >
                Correct
              </Button>
            </div>
          }
        >
          <div className="grid gap-3 pb-4 pt-3 sm:grid-cols-2">
            <Input
              value={memoryQueryText}
              onChange={(event) => setMemoryQueryText(event.target.value)}
              placeholder="Query or memory to target"
              aria-label="Memory maintenance query"
              disabled={!selectedId}
            />
            <Input
              value={memoryConclusionIds}
              onChange={(event) => setMemoryConclusionIds(event.target.value)}
              placeholder="Conclusion ids"
              aria-label="Memory conclusion ids"
              disabled={!selectedId}
            />
            <Textarea
              value={memoryReplacement}
              onChange={(event) => setMemoryReplacement(event.target.value)}
              placeholder="Replacement memory for correction"
              aria-label="Memory correction replacement"
              disabled={!selectedId}
              className="min-h-20 sm:col-span-2"
            />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Project Files"
        icon={<FileTextIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={filesQuery.refresh} disabled={!selectedId}>
            <RefreshCwIcon className={cn("size-3", filesQuery.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        {!selectedProject ? (
          <div className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
            Select a Jarvis project.
          </div>
        ) : null}
        {selectedProject && filesQuery.data?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Files failed</AlertTitle>
              <AlertDescription>
                {filesQuery.data.error?.message ?? "Jarvis did not return project files."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <SettingsRow
          title="Upload text artifact"
          description="Stores a project file through Jarvis using the project file API."
          control={
            <Button
              size="sm"
              onClick={() => void handleUploadProjectFile()}
              disabled={
                !selectedId || fileName.trim().length === 0 || fileContent.trim().length === 0
              }
            >
              <UploadIcon className="size-4" />
              Upload
            </Button>
          }
        >
          <div className="grid gap-3 pb-4 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)]">
            <Input
              value={fileTitle}
              onChange={(event) => setFileTitle(event.target.value)}
              placeholder="Title"
              aria-label="Project file title"
              disabled={!selectedId}
            />
            <Input
              value={fileArtifactType}
              onChange={(event) => setFileArtifactType(event.target.value)}
              placeholder="Artifact type"
              aria-label="Project file artifact type"
              disabled={!selectedId}
            />
            <Input
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="project-note.md"
              aria-label="Project file name"
              disabled={!selectedId}
              className="sm:col-span-2"
            />
            <Textarea
              value={fileContent}
              onChange={(event) => setFileContent(event.target.value)}
              placeholder="Project file content"
              aria-label="Project file content"
              disabled={!selectedId}
              className="min-h-28 sm:col-span-2"
            />
          </div>
        </SettingsRow>
        <SettingsRow
          title="File manifest"
          description="Lists durable project files indexed by Jarvis."
          control={
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeRetractedFiles}
                onChange={(event) => setIncludeRetractedFiles(event.currentTarget.checked)}
                disabled={!selectedId}
                className="size-4 accent-primary"
              />
              Include retracted
            </label>
          }
        >
          <div className="space-y-2 pb-4 pt-3">
            {filesQuery.isPending && !filesQuery.data ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                Loading project files
              </div>
            ) : null}
            {(filesQuery.data?.files ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">No project files recorded.</div>
            ) : null}
            {(filesQuery.data?.files ?? []).map((file) => (
              <div
                key={file.doc_id}
                className="flex flex-col gap-2 border-t border-border/60 py-2 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {file.title || file.doc_id}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {file.artifact_type || "file"} · {file.doc_id}
                    {file.retracted ? " · retracted" : ""}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (!selectedId) return;
                    setPendingDestructiveAction({
                      kind: "retract-file",
                      projectId: selectedId,
                      file,
                    });
                  }}
                  disabled={file.retracted || !selectedId}
                >
                  <Trash2Icon className="size-3" />
                  Retract
                </Button>
              </div>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Codex Conversations"
        icon={<MessagesSquareIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={threadsQuery.refresh} disabled={!selectedId}>
            <RefreshCwIcon className={cn("size-3", threadsQuery.isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        <SettingsRow
          title="New conversation"
          description="Creates a Jarvis project orchestrator conversation backed by Codex context."
          control={
            <div className="flex w-full gap-2 sm:w-96">
              <Input
                value={newThreadTitle}
                onChange={(event) => setNewThreadTitle(event.target.value)}
                placeholder="Title"
                aria-label="Conversation title"
                disabled={!selectedId}
              />
              <Button size="sm" onClick={() => void handleCreateThread()} disabled={!selectedId}>
                <PlusIcon className="size-4" />
                Create
              </Button>
            </div>
          }
        />
        {threads.map((thread) => (
          <SettingsRow
            key={thread.thread_id}
            title={thread.title}
            description={thread.session_id}
            status={`Updated ${thread.updated_at}`}
            control={
              <div className="flex gap-2">
                <Button
                  size="xs"
                  variant={thread.thread_id === selectedThread?.thread_id ? "default" : "outline"}
                  onClick={() => {
                    setSelectedThreadId(thread.thread_id);
                    setLatestReply(null);
                  }}
                >
                  Open
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void handleArchiveThread(thread)}
                >
                  <ArchiveIcon className="size-3" />
                  Archive
                </Button>
              </div>
            }
          />
        ))}
        <SettingsRow
          title="Send turn"
          description={
            selectedThread
              ? `Conversation: ${selectedThread.title}`
              : "Create or select a conversation."
          }
        >
          <div className="space-y-3 pb-4">
            <Textarea
              value={turnText}
              onChange={(event) => setTurnText(event.target.value)}
              placeholder="Ask Codex to reason about this Jarvis project"
              aria-label="Conversation turn"
              disabled={!selectedThread}
              className="min-h-24"
            />
            <div className="flex items-center justify-between gap-3">
              <span />
              <Button
                size="sm"
                onClick={() => void handleSendTurn()}
                disabled={!selectedThread || turnText.trim().length === 0}
              >
                <SendIcon className="size-4" />
                Send
              </Button>
            </div>
            {latestReply ? (
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-sm text-foreground">
                {latestReply}
              </div>
            ) : null}
          </div>
        </SettingsRow>
      </SettingsSection>
      <AlertDialog
        open={pendingDestructiveAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDestructiveAction(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructiveActionTitle(pendingDestructiveAction)}</AlertDialogTitle>
            <AlertDialogDescription>
              {destructiveActionDescription(pendingDestructiveAction)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" onClick={() => void handleConfirmDestructiveAction()}>
              {destructiveActionButtonLabel(pendingDestructiveAction)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </SettingsPageContainer>
  );
}
