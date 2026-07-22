import { JarvisProjectId, type JarvisProjectRepository } from "@t3tools/contracts";

import {
  repoNameFromRemote,
  validateProjectRepositoryDrafts,
  type ProjectRepositoryValidationError,
} from "../settings/JarvisProjects.logic";

export const CREATE_PROJECT_STEPS = ["details", "repositories", "review"] as const;
export const CREATE_PROJECT_COLLISION_CATALOG_INPUT = { includeArchived: true } as const;

export type CreateProjectStep = (typeof CREATE_PROJECT_STEPS)[number];
export type CreateProjectCollisionCatalogState = "unavailable" | "loading" | "ready" | "error";

export function createProjectCollisionCatalogState(input: {
  readonly hasEnvironment: boolean;
  readonly querySucceeded: boolean;
  readonly queryFailed: boolean;
}): CreateProjectCollisionCatalogState {
  if (!input.hasEnvironment) return "unavailable";
  if (input.querySucceeded) return "ready";
  return input.queryFailed ? "error" : "loading";
}

export interface CreateProjectRepositoryDraft {
  readonly rowId: string;
  readonly name: string;
  readonly remote: string;
  readonly default: boolean;
}

export interface CreateProjectDraft {
  readonly title: string;
  readonly repos: ReadonlyArray<CreateProjectRepositoryDraft>;
}

export type CreateProjectTitleValidation =
  | { readonly ok: true; readonly title: string }
  | { readonly ok: false; readonly message: string };

export interface CreateProjectPayload {
  readonly id: JarvisProjectId;
  readonly name: string;
  readonly repos: ReadonlyArray<JarvisProjectRepository>;
}

export type CreateProjectPayloadResult =
  | { readonly ok: true; readonly payload: CreateProjectPayload }
  | {
      readonly ok: false;
      readonly titleError: string | null;
      readonly repositoryErrors: ReadonlyArray<ProjectRepositoryValidationError>;
    };

export function projectSlugFromTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "project"
  );
}

export function uniqueProjectSlugFromTitle(
  title: string,
  existingProjectIds: ReadonlySet<string>,
): string {
  const baseSlug = projectSlugFromTitle(title);
  if (!existingProjectIds.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingProjectIds.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

export function createInitialProjectDraft(rowId = "repository-1"): CreateProjectDraft {
  return {
    title: "",
    repos: [{ rowId, name: "", remote: "", default: true }],
  };
}

export function validateCreateProjectTitle(title: string): CreateProjectTitleValidation {
  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0
    ? { ok: true, title: normalizedTitle }
    : { ok: false, message: "Project title is required." };
}

export function addCreateProjectRepository(
  repos: ReadonlyArray<CreateProjectRepositoryDraft>,
  rowId: string,
): ReadonlyArray<CreateProjectRepositoryDraft> {
  const normalizedRepos = ensureExactlyOneDefault(repos);
  return [
    ...normalizedRepos,
    { rowId, name: "", remote: "", default: normalizedRepos.length === 0 },
  ];
}

export function removeCreateProjectRepository(
  repos: ReadonlyArray<CreateProjectRepositoryDraft>,
  rowId: string,
): ReadonlyArray<CreateProjectRepositoryDraft> {
  if (repos.length <= 1) {
    return ensureExactlyOneDefault(repos);
  }
  return ensureExactlyOneDefault(repos.filter((repo) => repo.rowId !== rowId));
}

export function setDefaultCreateProjectRepository(
  repos: ReadonlyArray<CreateProjectRepositoryDraft>,
  rowId: string,
): ReadonlyArray<CreateProjectRepositoryDraft> {
  if (!repos.some((repo) => repo.rowId === rowId)) {
    return ensureExactlyOneDefault(repos);
  }
  return repos.map((repo) => ({ ...repo, default: repo.rowId === rowId }));
}

export function buildCreateProjectPayload(
  draft: CreateProjectDraft,
  existingProjectIds: ReadonlySet<string> = new Set(),
): CreateProjectPayloadResult {
  const titleValidation = validateCreateProjectTitle(draft.title);
  const repositoryValidation = validateProjectRepositoryDrafts(
    draft.repos.map((repo) => {
      const remote = repo.remote.trim();
      return {
        name: repo.name.trim() || repoNameFromRemote(remote),
        remote,
        default: repo.default,
      };
    }),
  );

  if (!titleValidation.ok || !repositoryValidation.ok) {
    return {
      ok: false,
      titleError: titleValidation.ok ? null : titleValidation.message,
      repositoryErrors: repositoryValidation.errors,
    };
  }

  return {
    ok: true,
    payload: {
      id: JarvisProjectId.make(
        uniqueProjectSlugFromTitle(titleValidation.title, existingProjectIds),
      ),
      name: titleValidation.title,
      repos: repositoryValidation.repos,
    },
  };
}

function ensureExactlyOneDefault(
  repos: ReadonlyArray<CreateProjectRepositoryDraft>,
): ReadonlyArray<CreateProjectRepositoryDraft> {
  if (repos.length === 0) {
    return repos;
  }
  const defaultIndex = Math.max(
    0,
    repos.findIndex((repo) => repo.default),
  );
  return repos.map((repo, index) => ({ ...repo, default: index === defaultIndex }));
}
