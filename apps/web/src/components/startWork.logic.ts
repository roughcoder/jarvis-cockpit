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

export interface BuildStartWorkSourcesInput {
  /** A Jarvis run projection exists to anchor a new draft thread. */
  readonly hasAnchorProject: boolean;
  /** A Jarvis session thread exists that can be reopened. */
  readonly hasResumableThread: boolean;
}

export function buildStartWorkSources(
  input: BuildStartWorkSourcesInput,
): StartWorkSourceDescriptor[] {
  return [
    {
      id: "describe-work",
      value: "action:start-work:describe",
      title: "Describe work",
      description: "Freeform objective, dispatched to Jarvis",
      searchTerms: ["describe", "objective", "prompt", "freeform", "new work"],
      enabled: true,
    },
    {
      id: "github-issue",
      value: "action:start-work:github-issue",
      title: "GitHub issue or PR",
      description: "Start from an issue or pull request",
      searchTerms: ["github", "issue", "pull request", "pr"],
      enabled: false,
      disabledHint:
        "Jarvis does not expose a GitHub issue/PR source resolver yet. Needs a Jarvis endpoint that turns an issue/PR reference into a run source.",
    },
    {
      id: "linear-ticket",
      value: "action:start-work:linear-ticket",
      title: "Linear ticket",
      description: "Start from a Linear ticket",
      searchTerms: ["linear", "ticket"],
      enabled: false,
      disabledHint:
        "Jarvis does not expose a Linear ticket source resolver yet. Needs a Jarvis endpoint that turns a ticket reference into a run source.",
    },
    {
      id: "continue-run",
      value: "action:start-work:continue-run",
      title: "Continue run",
      description: "Reopen the latest Jarvis run timeline",
      searchTerms: ["continue", "resume", "run", "latest"],
      enabled: input.hasResumableThread,
      ...(input.hasResumableThread ? {} : { disabledHint: "No Jarvis runs to continue yet." }),
    },
    {
      id: "register-repository",
      value: "action:start-work:register-repository",
      title: "Register repository",
      description: "Make a repository available to Jarvis",
      searchTerms: ["register", "repository", "repo", "git"],
      enabled: false,
      disabledHint:
        "Jarvis does not expose a repository registry endpoint yet. Worker repository metadata is read-only in the cockpit.",
    },
  ];
}
