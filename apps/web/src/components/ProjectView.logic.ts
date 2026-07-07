import type {
  EnvironmentId,
  JarvisProject,
  JarvisProjectFileUploadInput,
  JarvisProjectMemoryCurationInput,
  JarvisProjectRepository,
} from "@t3tools/contracts";

import {
  repositoryDraftsFromProjectRepos,
  validateProjectRepositoryDrafts,
  type ProjectRepositoryDraft,
  type ProjectRepositoryValidationError,
} from "./settings/JarvisProjects.logic";

export interface ProjectRouteParams {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
}

export type ProjectRouteRenderState =
  | { readonly status: "invalid" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly params: ProjectRouteParams };

export interface ProjectRouteInput {
  readonly environmentId: EnvironmentId | string;
  readonly projectId: string;
}

export type ProjectRepositoryDraftRow = ProjectRepositoryDraft & {
  readonly rowId: string;
};

export interface ProjectFileUploadDraft {
  readonly title: string;
  readonly artifactType: string;
  readonly filename: string;
  readonly content: string;
}

export type ProjectFileUploadBuildResult =
  | {
      readonly ok: true;
      readonly input: JarvisProjectFileUploadInput;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type ProjectMemoryRecordKind = "finding" | "decision";

export type ProjectMemoryRecordCommand = "recordFinding" | "recordDecision";

export interface ProjectMemoryRecordDraft {
  readonly kind: ProjectMemoryRecordKind;
  readonly content: string;
}

export type ProjectMemoryRecordBuildResult =
  | {
      readonly ok: true;
      readonly kind: ProjectMemoryRecordKind;
      readonly command: ProjectMemoryRecordCommand;
      readonly input: JarvisProjectMemoryCurationInput;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type ProjectRepositoryAddValidationResult =
  | {
      readonly ok: true;
      readonly drafts: ReadonlyArray<ProjectRepositoryDraftRow>;
      readonly repos: ReadonlyArray<JarvisProjectRepository>;
      readonly errors: readonly [];
    }
  | {
      readonly ok: false;
      readonly drafts: ReadonlyArray<ProjectRepositoryDraftRow>;
      readonly repos: ReadonlyArray<JarvisProjectRepository>;
      readonly errors: ReadonlyArray<ProjectRepositoryValidationError>;
    };

export function buildProjectRouteParams(input: ProjectRouteInput): ProjectRouteParams {
  return {
    environmentId: input.environmentId as EnvironmentId,
    projectId: input.projectId,
  };
}

export function resolveProjectRouteParams(
  params: Partial<Record<"environmentId" | "projectId", string | undefined>>,
): ProjectRouteParams | null {
  if (!params.environmentId || !params.projectId) {
    return null;
  }
  return buildProjectRouteParams({
    environmentId: params.environmentId,
    projectId: params.projectId,
  });
}

export function resolveProjectRouteRenderState(input: {
  readonly params: ProjectRouteParams | null;
  readonly shellError: string | null;
  readonly shellHasSnapshot: boolean;
  readonly shellPending: boolean;
}): ProjectRouteRenderState {
  if (input.params === null) {
    return { status: "invalid" };
  }
  if (input.shellError !== null) {
    return { status: "error", message: input.shellError };
  }
  if (input.shellPending && !input.shellHasSnapshot) {
    return { status: "loading" };
  }
  return { status: "ready", params: input.params };
}

export function findProjectById(
  projects: ReadonlyArray<JarvisProject>,
  projectId: string,
): JarvisProject | null {
  return projects.find((project) => project.id === projectId) ?? null;
}

export function buildProjectFileUploadInput(
  draft: ProjectFileUploadDraft,
  encodeContentBase64: (content: string) => string,
): ProjectFileUploadBuildResult {
  const filename = draft.filename.trim();
  const content = draft.content.trim();
  if (filename.length === 0 || content.length === 0) {
    return { ok: false, message: "File name and content are required." };
  }
  return {
    ok: true,
    input: {
      filename,
      content_base64: encodeContentBase64(draft.content),
      title: draft.title.trim() || filename,
      artifact_type: draft.artifactType.trim() || "spec",
      mime_type: "text/markdown",
    },
  };
}

export function projectMemoryRecordCommandForKind(
  kind: ProjectMemoryRecordKind,
): ProjectMemoryRecordCommand {
  return kind === "finding" ? "recordFinding" : "recordDecision";
}

export function buildProjectMemoryRecordInput(
  draft: ProjectMemoryRecordDraft,
): ProjectMemoryRecordBuildResult {
  const content = draft.content.trim();
  if (content.length === 0) {
    return { ok: false, message: "Memory content is required." };
  }
  return {
    ok: true,
    kind: draft.kind,
    command: projectMemoryRecordCommandForKind(draft.kind),
    input: { content },
  };
}

export function buildProjectRepositoryDraftRows(input: {
  readonly repos: ReadonlyArray<JarvisProjectRepository>;
  readonly makeRowId: (index: number, repo: ProjectRepositoryDraft) => string;
}): ReadonlyArray<ProjectRepositoryDraftRow> {
  return repositoryDraftsFromProjectRepos(input.repos).map((repo, index) => ({
    ...repo,
    rowId: input.makeRowId(index, repo),
  }));
}

export function appendProjectRepositoryDraftRow(
  drafts: ReadonlyArray<ProjectRepositoryDraftRow>,
  rowId: string,
): ReadonlyArray<ProjectRepositoryDraftRow> {
  return [...drafts, { rowId, name: "", remote: "", default: drafts.length === 0 }];
}

export function buildAddedProjectRepositoryDraftRows(input: {
  readonly drafts: ReadonlyArray<ProjectRepositoryDraftRow>;
  readonly draft: ProjectRepositoryDraft;
  readonly rowId: string;
}): ReadonlyArray<ProjectRepositoryDraftRow> {
  const existingDrafts = input.draft.default
    ? input.drafts.map((repo) => ({ ...repo, default: false }))
    : input.drafts;
  return [
    ...existingDrafts,
    {
      ...input.draft,
      rowId: input.rowId,
    },
  ];
}

export function validateAddedProjectRepositoryDraft(input: {
  readonly drafts: ReadonlyArray<ProjectRepositoryDraftRow>;
  readonly draft: ProjectRepositoryDraft;
  readonly rowId: string;
}): ProjectRepositoryAddValidationResult {
  const drafts = buildAddedProjectRepositoryDraftRows(input);
  const validation = validateProjectRepositoryDrafts(drafts);
  return validation.ok
    ? { ok: true, drafts, repos: validation.repos, errors: [] }
    : { ok: false, drafts, repos: validation.repos, errors: validation.errors };
}

export function removeProjectRepositoryDraftRow(
  drafts: ReadonlyArray<ProjectRepositoryDraftRow>,
  indexToRemove: number,
): ReadonlyArray<ProjectRepositoryDraftRow> {
  const removedDefault = drafts[indexToRemove]?.default === true;
  const next = drafts.filter((_, index) => index !== indexToRemove);
  if (next.length === 0 || !removedDefault || next.some((repo) => repo.default)) {
    return next;
  }
  return next.map((repo, index) => (index === 0 ? { ...repo, default: true } : repo));
}

export function patchProjectRepositoryDraftRow(
  drafts: ReadonlyArray<ProjectRepositoryDraftRow>,
  indexToUpdate: number,
  patch: Partial<ProjectRepositoryDraft>,
): ReadonlyArray<ProjectRepositoryDraftRow> {
  return drafts.map((repo, index) => (index === indexToUpdate ? { ...repo, ...patch } : repo));
}

export function setDefaultProjectRepositoryDraftRow(
  drafts: ReadonlyArray<ProjectRepositoryDraftRow>,
  indexToUpdate: number,
  checked: boolean,
): ReadonlyArray<ProjectRepositoryDraftRow> {
  return drafts.map((repo, index) => ({
    ...repo,
    default: checked ? index === indexToUpdate : index === indexToUpdate ? false : repo.default,
  }));
}
