import type { JarvisProjectRepository } from "@t3tools/contracts";

export interface ProjectRepositoryDraft {
  readonly name: string;
  readonly remote: string;
  readonly default: boolean;
}

export interface ProjectRepositoryValidationError {
  readonly rowIndex?: number;
  readonly field?: "name" | "remote" | "default";
  readonly message: string;
}

export type ProjectRepositoryValidationResult =
  | {
      readonly ok: true;
      readonly repos: ReadonlyArray<JarvisProjectRepository>;
      readonly errors: readonly [];
    }
  | {
      readonly ok: false;
      readonly repos: ReadonlyArray<JarvisProjectRepository>;
      readonly errors: ReadonlyArray<ProjectRepositoryValidationError>;
    };

export function repoNameFromRemote(remote: string): string {
  return (
    remote
      .split("/")
      .at(-1)
      ?.replace(/\.git$/u, "") || "repo"
  );
}

export function repositoryDraftsFromProjectRepos(
  repos: ReadonlyArray<JarvisProjectRepository>,
): ReadonlyArray<ProjectRepositoryDraft> {
  return repos.map((repo) => ({
    name: repo.name,
    remote: repo.remote,
    default: repo.default,
  }));
}

export function validateProjectRepositoryDrafts(
  drafts: ReadonlyArray<ProjectRepositoryDraft>,
): ProjectRepositoryValidationResult {
  const errors: ProjectRepositoryValidationError[] = [];
  const repos: JarvisProjectRepository[] = drafts.map((draft) => ({
    name: draft.name.trim(),
    remote: draft.remote.trim(),
    default: draft.default,
  }));

  if (repos.length === 0) {
    errors.push({ message: "Add at least one repository." });
  }

  const defaultCount = repos.filter((repo) => repo.default).length;
  if (defaultCount !== 1) {
    errors.push({ field: "default", message: "Select exactly one default repository." });
  }

  const remoteRowByKey = new Map<string, number>();
  repos.forEach((repo, rowIndex) => {
    if (repo.name.length === 0) {
      errors.push({ rowIndex, field: "name", message: "Repository name is required." });
    }
    if (repo.remote.length === 0) {
      errors.push({ rowIndex, field: "remote", message: "Remote is required." });
      return;
    }
    const key = repo.remote.toLowerCase();
    const firstRowIndex = remoteRowByKey.get(key);
    if (firstRowIndex !== undefined) {
      errors.push({
        rowIndex,
        field: "remote",
        message: `Remote duplicates row ${firstRowIndex + 1}.`,
      });
      return;
    }
    remoteRowByKey.set(key, rowIndex);
  });

  return errors.length === 0 ? { ok: true, repos, errors: [] } : { ok: false, repos, errors };
}

export function projectRepositoryValidationSummary(
  result: ProjectRepositoryValidationResult,
): string {
  if (result.ok) {
    return "";
  }
  return result.errors.map((error) => error.message).join(" ");
}

export function formatCommandFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string") {
    const message = error.trim();
    if (/^(Jarvis request|HTTP \d{3}|missing authority:)/u.test(message)) {
      return message;
    }
  }
  return "The Jarvis brain request failed.";
}

export type ProjectWriteFailureKind =
  | "network"
  | "auth"
  | "missing-authority"
  | "missing-route"
  | "validation"
  | "generic";

export interface ProjectWriteFailureClassification {
  readonly kind: ProjectWriteFailureKind;
  readonly message: string;
}

export function classifyProjectWriteFailure(error: unknown): ProjectWriteFailureClassification {
  const rawMessage = rawFailureMessage(error);
  const commandMessage = formatCommandFailure(error);
  const message = rawMessage || commandMessage;

  if (/HTTP 403/u.test(message) && /missing authority:/iu.test(message)) {
    return {
      kind: "missing-authority",
      message: `Jarvis denied the project write${formatStatusDetail(message)}`,
    };
  }
  if (/HTTP 403/u.test(message)) {
    return {
      kind: "auth",
      message: `Jarvis denied the project write${formatStatusDetail(message)}`,
    };
  }
  if (/(HTTP 401|unauthorized|authentication|auth token|invalid token)/iu.test(message)) {
    return {
      kind: "auth",
      message:
        "Jarvis rejected the project write authentication. Check the Jarvis connection auth mode and token.",
    };
  }
  if (
    /(projects\.(create|update|archive|delete).*HTTP (404|405|501)|HTTP (404|405|501))/u.test(
      message,
    )
  ) {
    return {
      kind: "missing-route",
      message:
        "This Jarvis brain does not expose project-management writes for this API version. Cockpit reached Jarvis, but the project route is missing or disabled.",
    };
  }
  if (/(HTTP (400|409|422)|validation|invalid|duplicate|required|schema)/iu.test(message)) {
    return {
      kind: "validation",
      message: `Jarvis rejected the project write as invalid: ${stripJarvisRequestPrefix(message)}`,
    };
  }
  if (
    /(network|failed to fetch|fetch failed|load failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|timeout|offline)/iu.test(
      message,
    )
  ) {
    return {
      kind: "network",
      message:
        "Cockpit could not reach the Jarvis brain for this project write. Check the brain connection and try again.",
    };
  }
  if (commandMessage === "The Jarvis brain request failed.") {
    return {
      kind: "generic",
      message:
        "Cockpit could not complete the project write against this Jarvis brain. Check the brain connection, auth mode, and project permissions.",
    };
  }
  return { kind: "generic", message };
}

export function formatProjectWriteFailure(error: unknown): string {
  return classifyProjectWriteFailure(error).message;
}

export function formatProjectConversationFailure(error: unknown): string {
  const message = formatCommandFailure(error);
  if (/projects\.threads\.archive.*HTTP 404/u.test(message)) {
    return "This Jarvis brain does not expose project conversation archive yet. Cockpit reached Jarvis, but the conversation archive route returned HTTP 404.";
  }
  if (/HTTP 403/u.test(message)) {
    return `Jarvis denied the conversation action${formatStatusDetail(message)}`;
  }
  return message;
}

function formatStatusDetail(message: string): string {
  const detail = message.match(/HTTP 403:\s*(?<detail>.+)$/u)?.groups?.detail?.trim();
  return detail ? `: ${detail}` : ". Check the Jarvis project permissions for this operator.";
}

function rawFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  return typeof error === "string" ? error.trim() : "";
}

function stripJarvisRequestPrefix(message: string): string {
  return message
    .replace(/^Jarvis request [\w.]+ failed with HTTP \d{3}:?\s*/u, "")
    .replace(/^HTTP \d{3}:?\s*/u, "")
    .trim();
}
