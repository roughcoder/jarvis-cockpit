import type { JarvisConversationWorkspace, JarvisTurnWorkspaceInput } from "@t3tools/contracts";

export type ProjectConversationWorkspaceEngine = "codex" | "claude";

export interface ProjectConversationWorkspaceStagedRepo {
  readonly name: string;
  readonly baseRef: string;
}

export interface ProjectConversationWorkspaceStaging {
  readonly engine: ProjectConversationWorkspaceEngine;
  readonly repos: ReadonlyArray<ProjectConversationWorkspaceStagedRepo>;
}

export interface ProjectConversationProvisionStep {
  readonly phase: string;
  readonly label: string;
  readonly active: boolean;
  readonly complete: boolean;
}

const PROVISION_PHASES = ["resolving-access", "cloning", "creating-worktree", "running"] as const;

export function createProjectConversationWorkspaceStaging(
  engine: ProjectConversationWorkspaceEngine = "codex",
): ProjectConversationWorkspaceStaging {
  return { engine, repos: [] };
}

export function setProjectConversationWorkspaceEngine(
  staging: ProjectConversationWorkspaceStaging,
  engine: string,
): ProjectConversationWorkspaceStaging {
  return {
    ...staging,
    engine: normalizeWorkspaceEngine(engine),
  };
}

export function toggleProjectConversationWorkspaceRepo(
  staging: ProjectConversationWorkspaceStaging,
  repoName: string,
): ProjectConversationWorkspaceStaging {
  const name = repoName.trim();
  if (name.length === 0) {
    return staging;
  }
  const exists = staging.repos.some((repo) => repo.name === name);
  return {
    ...staging,
    repos: exists
      ? staging.repos.filter((repo) => repo.name !== name)
      : [...staging.repos, { name, baseRef: "" }],
  };
}

export function setProjectConversationWorkspaceRepoBaseRef(
  staging: ProjectConversationWorkspaceStaging,
  repoName: string,
  baseRef: string,
): ProjectConversationWorkspaceStaging {
  const name = repoName.trim();
  if (name.length === 0) {
    return staging;
  }
  return {
    ...staging,
    repos: staging.repos.map((repo) => (repo.name === name ? { ...repo, baseRef } : repo)),
  };
}

export function clearProjectConversationWorkspaceRepos(
  staging: ProjectConversationWorkspaceStaging,
): ProjectConversationWorkspaceStaging {
  return { ...staging, repos: [] };
}

export function buildTurnWorkspaceInput(
  staging: ProjectConversationWorkspaceStaging,
): JarvisTurnWorkspaceInput | undefined {
  const repos = uniqueStagedRepos(staging.repos)
    .map((repo) => {
      const baseRef = repo.baseRef.trim();
      return {
        name: repo.name.trim(),
        ...(baseRef.length > 0 ? { base_ref: baseRef } : {}),
      };
    })
    .filter((repo) => repo.name.length > 0);

  if (repos.length === 0) {
    return undefined;
  }

  return {
    repos,
    engine: staging.engine,
  };
}

export function shouldPollProjectConversationWorkspace(input: {
  readonly turnInFlight: boolean;
  /**
   * True when the in-flight turn itself staged a `workspace` (initial escalation
   * OR adding repos to an already-running workspace). Without this, an add-repo
   * turn on a workspace whose phase is already "running" would never poll, so
   * the stepper and worktree list would stay stale until the turn finished.
   */
  readonly turnRequestedWorkspace?: boolean;
  readonly workspace: Pick<JarvisConversationWorkspace, "provision_phase"> | null | undefined;
}): boolean {
  if (!input.turnInFlight) {
    return false;
  }
  if (input.turnRequestedWorkspace === true) {
    return true;
  }
  const phase = input.workspace?.provision_phase?.trim().toLowerCase();
  return phase !== "running";
}

export function deriveWorkspaceProvisionSteps(
  phase: string | null | undefined,
): ProjectConversationProvisionStep[] {
  const normalizedPhase = phase?.trim() || PROVISION_PHASES[0];
  const knownIndex = PROVISION_PHASES.findIndex((candidate) => candidate === normalizedPhase);
  if (knownIndex === -1) {
    return [
      ...PROVISION_PHASES.map((candidate) => ({
        phase: candidate,
        label: formatWorkspacePhaseLabel(candidate),
        active: false,
        complete: false,
      })),
      {
        phase: normalizedPhase,
        label: formatWorkspacePhaseLabel(normalizedPhase),
        active: true,
        complete: false,
      },
    ];
  }
  return PROVISION_PHASES.map((candidate, index) => ({
    phase: candidate,
    label: formatWorkspacePhaseLabel(candidate),
    active: index === knownIndex,
    complete: index < knownIndex,
  }));
}

export function formatWorkspacePhaseLabel(phase: string | null | undefined): string {
  const value = phase?.trim();
  if (!value) {
    return "resolving access";
  }
  return value.replaceAll("-", " ");
}

export function workspaceRepoNames(
  workspace: Pick<JarvisConversationWorkspace, "worktrees"> | null | undefined,
): ReadonlySet<string> {
  return new Set(
    (workspace?.worktrees ?? [])
      .flatMap((worktree) => [worktree.repo, worktree.name])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  );
}

function normalizeWorkspaceEngine(engine: string): ProjectConversationWorkspaceEngine {
  return engine.trim().toLowerCase() === "claude" ? "claude" : "codex";
}

function uniqueStagedRepos(
  repos: ReadonlyArray<ProjectConversationWorkspaceStagedRepo>,
): ProjectConversationWorkspaceStagedRepo[] {
  const seen = new Set<string>();
  const result: ProjectConversationWorkspaceStagedRepo[] = [];
  for (const repo of repos) {
    const name = repo.name.trim();
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push({ name, baseRef: repo.baseRef });
  }
  return result;
}
