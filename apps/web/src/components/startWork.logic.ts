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

export interface StartWorkWorkerRepositoryInput {
  readonly repo: string;
  readonly status?: string | null;
  readonly default_branch?: string | null;
  readonly is_default?: boolean;
  readonly can_start_work?: boolean;
}

export interface StartWorkWorkerInput {
  readonly worker_id: string;
  readonly display_name?: string | null;
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
  const describeDetails = [
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

function firstNonEmpty(...values: ReadonlyArray<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
