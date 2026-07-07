import type { EnvironmentId, JarvisProject, JarvisProjectRepository } from "@t3tools/contracts";

import {
  repositoryDraftsFromProjectRepos,
  type ProjectRepositoryDraft,
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
