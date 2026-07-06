/**
 * Jarvis cockpit "Start work" onboarding sources.
 *
 * In cockpit mode the command palette replaces the upstream T3 add-project
 * sources (local folder, Git URL, provider clones) with Jarvis work sources.
 * Sources whose Jarvis-side contract does not exist yet stay visible but
 * disabled, naming the missing capability instead of falling back to local
 * T3 project creation.
 */

export const START_WORK_TITLE = "Start work";
export const START_WORK_ROOT_VALUE = "action:add-project";

/**
 * Keeps upstream "add project" spellings searchable so muscle memory still
 * lands on the Jarvis-first action.
 */
export const START_WORK_SEARCH_TERMS: ReadonlyArray<string> = [
  "start work",
  "new run",
  "run",
  "work",
  "jarvis",
  "describe",
  "dispatch",
  "add project",
  "new project",
];

export type StartWorkSourceId =
  | "create-project"
  | "describe-work"
  | "github-issue"
  | "linear-ticket"
  | "continue-run"
  | "register-repository";

export interface StartWorkSourceDescriptor {
  readonly id: StartWorkSourceId;
  readonly value: string;
  readonly title: string;
  readonly description: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly enabled: boolean;
  /** Why the source is disabled: prerequisite state or missing Jarvis contract. */
  readonly disabledHint?: string;
}

export interface StartWorkCatalogInput {
  readonly sources?: ReadonlyArray<string>;
  readonly defaults?: {
    readonly repo?: string | null;
    readonly worker_id?: string | null;
    readonly engine?: string | null;
    readonly engine_strategy?: string | null;
    readonly landing_mode?: string | null;
  };
}

export interface StartWorkProjectRepositoryInput {
  readonly name: string;
  readonly remote: string;
  readonly default?: boolean;
}

export interface StartWorkProjectInput {
  readonly id: string;
  readonly name: string;
  readonly repos?: ReadonlyArray<StartWorkProjectRepositoryInput>;
}

export interface StartWorkWorkerRepositoryInput {
  readonly repo: string;
  readonly status?: string | null | undefined;
  readonly default_branch?: string | null | undefined;
  readonly is_default?: boolean;
  readonly can_start_work?: boolean;
}

export interface StartWorkWorkerInput {
  readonly worker_id: string;
  readonly display_name?: string | null;
  readonly status?: string | null | undefined;
  readonly health?: string | null | undefined;
  readonly engines?: ReadonlyArray<{
    readonly engine: string;
    readonly status?: string | null | undefined;
  }>;
  readonly repositories?: ReadonlyArray<StartWorkWorkerRepositoryInput>;
}

export interface BuildStartWorkSourcesInput {
  /** A Jarvis run projection exists to anchor a new draft thread. */
  readonly hasAnchorProject: boolean;
  /** A Jarvis session thread exists that can be reopened. */
  readonly hasResumableThread: boolean;
  /** Development fixture data is active, so work starts are simulations. */
  readonly fixtureMode?: boolean;
  /** Jarvis-owned form/source defaults from `/v1/cockpit/catalog`. */
  readonly catalog?: StartWorkCatalogInput | null;
  /** Selected Jarvis dispatch route shown in the start-work surface. */
  readonly routing?: StartWorkRoutingSummaryInput | null;
  /** Public-safe worker rows from the Jarvis snapshot. */
  readonly workers?: ReadonlyArray<StartWorkWorkerInput>;
}

export function buildStartWorkSources(
  input: BuildStartWorkSourcesInput,
): StartWorkSourceDescriptor[] {
  const catalogSources = new Set(input.catalog?.sources ?? ["manual"]);
  const repositoryOptions = buildStartWorkRepositoryOptions(input.workers ?? []);
  const defaultRepo = firstNonEmpty(
    input.catalog?.defaults?.repo,
    repositoryOptions.find((repo) => repo.isDefault && repo.canStartWork)?.repo,
    repositoryOptions.find((repo) => repo.canStartWork)?.repo,
  );
  const defaultEngine = firstNonEmpty(input.catalog?.defaults?.engine);
  const defaultLandingMode = firstNonEmpty(input.catalog?.defaults?.landing_mode);
  const routingSummary = input.routing
    ? buildStartWorkRoutingSummary({
        ...input.routing,
        fixtureMode: input.fixtureMode === true || input.routing.fixtureMode === true,
      })
    : null;
  const describeDetails =
    routingSummary !== null
      ? [
          `Project: ${routingSummary.projectLabel}`,
          `Repo: ${routingSummary.repoLabel}`,
          `Worker: ${routingSummary.workerLabel}`,
          `Engine: ${routingSummary.engineSupport}`,
          routingSummary.compatibilityLabel,
        ]
      : [
          defaultRepo ? `Repo: ${defaultRepo}` : "Repo selected by Jarvis",
          defaultEngine ? `Engine: ${defaultEngine}` : null,
          defaultLandingMode ? `Landing: ${defaultLandingMode}` : null,
        ].filter((item): item is string => item !== null);
  const describeTitle = input.fixtureMode ? "Simulate work" : "Describe work";
  const describePrefix = input.fixtureMode
    ? "Freeform objective, simulated by fixture mode. No live workers."
    : "Freeform objective, dispatched to Jarvis";

  return [
    {
      id: "create-project",
      value: "action:start-work:create-project",
      title: "Create project",
      description: "Add the first Jarvis project and its repositories",
      searchTerms: ["create", "project", "new project", "add project", "jarvis", "repository"],
      enabled: true,
    },
    {
      id: "describe-work",
      value: "action:start-work:describe",
      title: describeTitle,
      description:
        describeDetails.length > 0
          ? `${describePrefix} ${describeDetails.join(" · ")}`
          : describePrefix,
      searchTerms: ["describe", "objective", "prompt", "freeform", "new work", "simulate"],
      enabled: catalogSources.has("manual"),
      ...(catalogSources.has("manual")
        ? {}
        : { disabledHint: "Jarvis catalog does not currently expose manual work starts." }),
    },
    {
      id: "github-issue",
      value: "action:start-work:github-issue",
      title: "GitHub issue or PR",
      description: "Start from an issue or pull request",
      searchTerms: ["github", "issue", "pull request", "pr"],
      enabled: catalogSources.has("github"),
      ...(catalogSources.has("github")
        ? {}
        : { disabledHint: "Jarvis catalog does not currently expose GitHub starts." }),
    },
    {
      id: "linear-ticket",
      value: "action:start-work:linear-ticket",
      title: "Linear ticket",
      description: "Start from a Linear ticket",
      searchTerms: ["linear", "ticket"],
      enabled: catalogSources.has("linear"),
      ...(catalogSources.has("linear")
        ? {}
        : { disabledHint: "Jarvis catalog does not currently expose Linear starts." }),
    },
    {
      id: "continue-run",
      value: "action:start-work:continue-run",
      title: "Continue work",
      description: "Reopen the latest Jarvis work timeline",
      searchTerms: ["continue", "resume", "run", "latest"],
      enabled: input.hasResumableThread,
      ...(input.hasResumableThread ? {} : { disabledHint: "No Jarvis work to continue yet." }),
    },
    {
      id: "register-repository",
      value: "action:start-work:register-repository",
      title: "Register repository",
      description: "Make a repository available to Jarvis",
      searchTerms: ["register", "repository", "repo", "git"],
      enabled: false,
      disabledHint:
        repositoryOptions.length > 0
          ? "Jarvis repository metadata is read-only in the cockpit."
          : "Jarvis has not reported worker repository metadata yet.",
    },
  ];
}

export interface StartWorkRepositoryOption {
  readonly repo: string;
  readonly workerId: string;
  readonly workerName: string;
  readonly defaultBranch: string | null;
  readonly isDefault: boolean;
  readonly canStartWork: boolean;
}

export interface StartWorkValidationSummaryInput {
  readonly ok?: boolean;
  readonly validation?:
    | {
        readonly can_start: boolean;
        readonly missing?: ReadonlyArray<string> | undefined;
        readonly missing_authority?: ReadonlyArray<string> | undefined;
        readonly reasons?: ReadonlyArray<string> | undefined;
        readonly notes?: ReadonlyArray<string> | undefined;
      }
    | undefined;
  readonly error?: { readonly message?: string | undefined } | undefined;
}

export interface StartWorkRoutingSummaryInput {
  readonly projects?: ReadonlyArray<StartWorkProjectInput>;
  readonly workers?: ReadonlyArray<StartWorkWorkerInput>;
  readonly selectedProjectId?: string | null;
  readonly selectedRepo?: string | null;
  readonly selectedWorkerId?: string | null;
  readonly engine?: string | null;
  readonly validation?: StartWorkValidationSummaryInput | null;
  readonly validationPending?: boolean;
  readonly validationError?: string | null;
  readonly fixtureMode?: boolean;
}

export interface StartWorkRoutingSummary {
  readonly projectLabel: string;
  readonly repoLabel: string;
  readonly workerLabel: string;
  readonly compatibilityLabel: string;
  readonly engineSupport: string;
  readonly canDispatch: boolean;
  readonly validationMessages: ReadonlyArray<string>;
}

export function buildStartWorkRoutingSummary(
  input: StartWorkRoutingSummaryInput,
): StartWorkRoutingSummary {
  const projects = input.projects ?? [];
  const workers = input.workers ?? [];
  const selectedProject = selectStartWorkProject(projects, input.selectedProjectId ?? null);
  const selectedRepo = firstNonEmpty(input.selectedRepo, defaultRepoForProject(selectedProject));
  const engine = firstNonEmpty(input.engine) ?? "codex";
  const validationMessages = startWorkValidationMessages(input.validation, input.validationError);
  const compatibleWorkers = workers.filter(
    (worker) =>
      workerIsStartable(worker) &&
      workerSupportsEngine(worker, engine) &&
      workerCanStartRepo(worker, selectedRepo),
  );
  const selectedWorker = workers.find((worker) => worker.worker_id === input.selectedWorkerId);
  const selectedWorkerCompatible =
    selectedWorker !== undefined &&
    compatibleWorkers.some((worker) => worker.worker_id === selectedWorker.worker_id);
  const defaultWorker = compatibleWorkers[0] ?? null;
  const workerLabel =
    selectedWorker !== undefined
      ? startWorkWorkerLabel(selectedWorker)
      : defaultWorker !== null
        ? `Auto: ${startWorkWorkerLabel(defaultWorker)}`
        : "Auto";
  const engineSupported = workers.some((worker) => workerSupportsEngine(worker, engine));

  let compatibilityLabel = "Compatible";
  if (input.fixtureMode === true) {
    compatibilityLabel = "Simulation only";
  } else if (input.validationPending === true) {
    compatibilityLabel = "Validating";
  } else if (validationMessages.length > 0) {
    compatibilityLabel = input.validation?.validation?.can_start === false ? "Blocked" : "Warning";
  } else if (workers.length === 0) {
    compatibilityLabel = "No workers reported";
  } else if (compatibleWorkers.length === 0) {
    compatibilityLabel = "No compatible worker";
  } else if (selectedWorker !== undefined && !selectedWorkerCompatible) {
    compatibilityLabel = "Worker override warning";
  }

  const canDispatch =
    input.fixtureMode === true ||
    (validationMessages.length === 0 &&
      input.validationPending !== true &&
      compatibleWorkers.length > 0 &&
      (selectedWorker === undefined || selectedWorkerCompatible));

  return {
    projectLabel: selectedProject?.name ?? "No project",
    repoLabel: selectedRepo ?? "No repo",
    workerLabel,
    compatibilityLabel,
    engineSupport: engineSupported || workers.length === 0 ? engine : `${engine} unsupported`,
    canDispatch,
    validationMessages,
  };
}

export function startWorkValidationMessages(
  validation: StartWorkValidationSummaryInput | null | undefined,
  validationError?: string | null,
): string[] {
  const messages: string[] = [];
  const errorMessage = firstNonEmpty(validationError, validation?.error?.message);
  if (errorMessage) {
    messages.push(errorMessage);
  }
  const result = validation?.validation;
  if (!result) {
    return messages;
  }
  const missing = result.missing ?? [];
  const missingAuthority = result.missing_authority ?? [];
  if (missing.length > 0) {
    messages.push(`Missing: ${missing.join(", ")}`);
  }
  if (missingAuthority.length > 0) {
    messages.push(`Missing authority: ${missingAuthority.join(", ")}`);
  }
  messages.push(...(result.reasons ?? []));
  return dedupe(messages);
}

export function buildStartWorkRepositoryOptions(
  workers: ReadonlyArray<StartWorkWorkerInput>,
): StartWorkRepositoryOption[] {
  return workers
    .flatMap((worker) =>
      (worker.repositories ?? []).map((repository) => ({
        repo: repository.repo,
        workerId: worker.worker_id,
        workerName: firstNonEmpty(worker.display_name, worker.worker_id) ?? worker.worker_id,
        defaultBranch: firstNonEmpty(repository.default_branch),
        isDefault: repository.is_default === true,
        canStartWork: repository.can_start_work === true,
      })),
    )
    .sort((left, right) => {
      if (left.canStartWork !== right.canStartWork) {
        return left.canStartWork ? -1 : 1;
      }
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      return left.repo.localeCompare(right.repo);
    });
}

function selectStartWorkProject(
  projects: ReadonlyArray<StartWorkProjectInput>,
  selectedProjectId: string | null,
): StartWorkProjectInput | null {
  const selected =
    selectedProjectId === null
      ? undefined
      : projects.find((project) => project.id === selectedProjectId);
  return selected ?? projects[0] ?? null;
}

function defaultRepoForProject(project: StartWorkProjectInput | null): string | null {
  const repo = project?.repos?.find((candidate) => candidate.default) ?? project?.repos?.[0];
  return firstNonEmpty(repo?.remote, repo?.name);
}

function workerIsStartable(worker: StartWorkWorkerInput): boolean {
  const status = "status" in worker && typeof worker.status === "string" ? worker.status : null;
  const health = "health" in worker && typeof worker.health === "string" ? worker.health : null;
  return status !== "offline" && health !== "unhealthy";
}

function workerSupportsEngine(worker: StartWorkWorkerInput, engine: string): boolean {
  const engines = "engines" in worker && Array.isArray(worker.engines) ? worker.engines : [];
  if (engines.length === 0) {
    return true;
  }
  const selected = engine.trim().toLowerCase();
  return engines.some((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return false;
    }
    const candidateEngine =
      "engine" in candidate && typeof candidate.engine === "string" ? candidate.engine : "";
    const status =
      "status" in candidate && typeof candidate.status === "string" ? candidate.status : "";
    return (
      candidateEngine.trim().toLowerCase() === selected &&
      (status === "available" || status === "degraded")
    );
  });
}

function workerCanStartRepo(worker: StartWorkWorkerInput, repo: string | null): boolean {
  const repositories = worker.repositories ?? [];
  if (repositories.length === 0 || repo === null) {
    return true;
  }
  const selected = repo.trim().toLowerCase();
  const selectedName = selected.split("/").at(-1);
  return repositories.some((repository) => {
    if (repository.can_start_work !== true) {
      return false;
    }
    const workerRepo = repository.repo.trim().toLowerCase();
    return workerRepo === selected || workerRepo === selectedName;
  });
}

function startWorkWorkerLabel(worker: StartWorkWorkerInput): string {
  return firstNonEmpty(worker.display_name, worker.worker_id) ?? worker.worker_id;
}

function dedupe(values: ReadonlyArray<string>): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function firstNonEmpty(...values: ReadonlyArray<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
