import type {
  JarvisConversationWorkspace,
  JarvisTurnWorkspaceInput,
  JarvisWorkerProfile,
} from "@t3tools/contracts";

export type ProjectConversationWorkspaceEngine = "codex" | "claude";

export interface ProjectConversationWorkspaceEngineModel {
  readonly id: string;
  readonly label: string;
}

export interface ProjectConversationWorkspaceEngineOption {
  readonly value: ProjectConversationWorkspaceEngine;
  readonly label: string;
  readonly description: string;
  readonly models: ReadonlyArray<ProjectConversationWorkspaceEngineModel>;
  readonly defaultModel: string | null;
}

export interface ProjectConversationWorkspaceStagedRepo {
  readonly name: string;
  readonly baseRef: string;
}

export interface ProjectConversationWorkspaceStaging {
  readonly engine: ProjectConversationWorkspaceEngine;
  readonly model: string | null;
  readonly repos: ReadonlyArray<ProjectConversationWorkspaceStagedRepo>;
}

export interface ProjectConversationProvisionStep {
  readonly phase: string;
  readonly label: string;
  readonly active: boolean;
  readonly complete: boolean;
}

const PROVISION_PHASES = ["resolving-access", "cloning", "creating-worktree", "running"] as const;

const DEFAULT_ENGINE_OPTIONS: ReadonlyArray<ProjectConversationWorkspaceEngineOption> = [
  {
    value: "codex",
    label: "Codex",
    description: "OpenAI Codex app-server.",
    models: [],
    defaultModel: null,
  },
  {
    value: "claude",
    label: "Claude",
    description: "Claude Code agent.",
    models: [],
    defaultModel: null,
  },
];

export function createProjectConversationWorkspaceStaging(
  engine: ProjectConversationWorkspaceEngine = "codex",
  model: string | null = null,
): ProjectConversationWorkspaceStaging {
  return { engine, model: normalizeWorkspaceModel(model), repos: [] };
}

export function setProjectConversationWorkspaceEngine(
  staging: ProjectConversationWorkspaceStaging,
  engine: string,
): ProjectConversationWorkspaceStaging {
  const nextEngine = normalizeWorkspaceEngine(engine);
  if (nextEngine === staging.engine) {
    return staging;
  }
  return {
    ...staging,
    engine: nextEngine,
    model: null,
  };
}

export function setProjectConversationWorkspaceModel(
  staging: ProjectConversationWorkspaceStaging,
  model: string | null,
): ProjectConversationWorkspaceStaging {
  return {
    ...staging,
    model: normalizeWorkspaceModel(model),
  };
}

export function syncProjectConversationWorkspaceSelection(
  staging: ProjectConversationWorkspaceStaging,
  input: {
    readonly engine: string | null | undefined;
    readonly model: string | null | undefined;
  },
): ProjectConversationWorkspaceStaging {
  const engine = normalizeWorkspaceEngineOrNull(input.engine);
  if (engine === null) {
    return staging;
  }
  return {
    ...staging,
    engine,
    model: normalizeWorkspaceModel(input.model),
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
  currentEngine?: string | null,
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
    // The engine picker must still take effect with no staged repos, but only
    // for conversations already routed to a worker engine — brain ("jarvis")
    // threads never get an engine-only workspace, which would escalate them.
    const normalizedCurrent = currentEngine?.trim().toLowerCase();
    const engineChanged =
      (normalizedCurrent === "codex" || normalizedCurrent === "claude") &&
      normalizedCurrent !== staging.engine;
    return engineChanged ? { engine: staging.engine } : undefined;
  }

  return {
    repos,
    engine: staging.engine,
  };
}

export function buildTurnModelInput(
  staging: ProjectConversationWorkspaceStaging,
  currentEngine: string | null | undefined,
  currentModel: string | null | undefined,
  engineOptions: ReadonlyArray<ProjectConversationWorkspaceEngineOption>,
): string | undefined {
  const explicitModel = normalizeWorkspaceModel(staging.model);
  const selectedModel =
    explicitModel ?? resolveWorkspaceEngineDefaultModel(engineOptions, staging.engine);
  if (selectedModel === null) {
    return undefined;
  }

  const normalizedCurrentEngine = normalizeWorkspaceEngineOrNull(currentEngine);
  if (normalizedCurrentEngine !== staging.engine) {
    return selectedModel;
  }

  if (explicitModel !== null && explicitModel !== normalizeWorkspaceModel(currentModel)) {
    return explicitModel;
  }

  return undefined;
}

export function projectConversationWorkspaceMatchesSubmission(
  current: JarvisTurnWorkspaceInput | null | undefined,
  submitted: JarvisTurnWorkspaceInput | null | undefined,
): boolean {
  if (!current || !submitted) return !current && !submitted;
  if (current.engine !== submitted.engine) return false;
  const currentRepos = current.repos ?? [];
  const submittedRepos = submitted.repos ?? [];
  return (
    currentRepos.length === submittedRepos.length &&
    currentRepos.every(
      (repo, index) =>
        repo.name === submittedRepos[index]?.name &&
        repo.base_ref === submittedRepos[index]?.base_ref,
    )
  );
}

export function projectConversationModelMatchesSubmission(
  current: string | null | undefined,
  submitted: string | null | undefined,
): boolean {
  return normalizeWorkspaceModel(current) === normalizeWorkspaceModel(submitted);
}

export function workspaceEngineOptionsFromWorkers(
  workers: ReadonlyArray<JarvisWorkerProfile>,
): ProjectConversationWorkspaceEngineOption[] {
  return DEFAULT_ENGINE_OPTIONS.map((fallback) => {
    const matchingEngines = workers
      .flatMap((worker) => worker.engines)
      .filter((engine) => normalizeWorkspaceEngineOrNull(engine.engine) === fallback.value);
    const first = matchingEngines[0];
    const modelById = new Map<string, ProjectConversationWorkspaceEngineModel>();
    for (const engine of matchingEngines) {
      for (const model of engine.models ?? []) {
        const id = normalizeWorkspaceModel(model.id);
        if (id === null || modelById.has(id)) {
          continue;
        }
        modelById.set(id, { id, label: model.label.trim() || id });
      }
    }
    const defaultModel =
      matchingEngines
        .map((engine) => normalizeWorkspaceModel(engine.default_model))
        .find((model): model is string => model !== null) ?? null;

    return {
      value: fallback.value,
      label: first?.display_name?.trim() || fallback.label,
      description: fallback.description,
      models: [...modelById.values()],
      defaultModel,
    };
  });
}

export function resolveWorkspaceEngineOption(
  engineOptions: ReadonlyArray<ProjectConversationWorkspaceEngineOption>,
  engine: string | null | undefined,
): ProjectConversationWorkspaceEngineOption {
  const normalized = normalizeWorkspaceEngineOrNull(engine) ?? "codex";
  return (
    engineOptions.find((option) => option.value === normalized) ??
    DEFAULT_ENGINE_OPTIONS.find((option) => option.value === normalized) ??
    DEFAULT_ENGINE_OPTIONS[0]!
  );
}

export function resolveWorkspaceEngineModel(input: {
  readonly engineOptions: ReadonlyArray<ProjectConversationWorkspaceEngineOption>;
  readonly engine: string | null | undefined;
  readonly model: string | null | undefined;
}): ProjectConversationWorkspaceEngineModel | null {
  const option = resolveWorkspaceEngineOption(input.engineOptions, input.engine);
  const model = normalizeWorkspaceModel(input.model) ?? option.defaultModel;
  if (model === null) {
    return null;
  }
  return option.models.find((candidate) => candidate.id === model) ?? { id: model, label: model };
}

export function resolveWorkspaceEngineDefaultModel(
  engineOptions: ReadonlyArray<ProjectConversationWorkspaceEngineOption>,
  engine: string | null | undefined,
): string | null {
  return resolveWorkspaceEngineOption(engineOptions, engine).defaultModel;
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

export function normalizeWorkspaceEngine(engine: string): ProjectConversationWorkspaceEngine {
  return engine.trim().toLowerCase() === "claude" ? "claude" : "codex";
}

export function normalizeWorkspaceEngineOrNull(
  engine: string | null | undefined,
): ProjectConversationWorkspaceEngine | null {
  const normalized = engine?.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude") {
    return normalized;
  }
  return null;
}

function normalizeWorkspaceModel(model: string | null | undefined): string | null {
  const normalized = model?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
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
