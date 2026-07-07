import type {
  JarvisProject,
  JarvisWorkerProfile,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";

export const WORKER_AUTO_VALUE = "__auto__";

export type ComposerJarvisProject = Pick<JarvisProject, "id" | "name" | "repos">;
export type ComposerJarvisRepo = ComposerJarvisProject["repos"][number];

export function jarvisEngineForComposerSelection(input: {
  readonly selectedProvider: ProviderDriverKind;
  readonly selectedInstanceId: ProviderInstanceId;
  readonly selectedModel: string;
}): string {
  const model = input.selectedModel.trim().toLowerCase();
  if (model === "codex" || model === "claude") {
    return model;
  }
  const instanceId = String(input.selectedInstanceId).trim().toLowerCase();
  if (input.selectedProvider === "claudeAgent" || instanceId === "claudeagent") {
    return "claude";
  }
  if (input.selectedProvider === "claude" || instanceId.startsWith("claude")) {
    return "claude";
  }
  return "codex";
}

export function jarvisRepoForProject(project: ComposerJarvisProject | null): string | null {
  const repo = project?.repos.find((candidate) => candidate.default) ?? project?.repos[0];
  return repo?.remote ?? null;
}

export function jarvisRepoLabel(repo: ComposerJarvisRepo | null | undefined): string {
  return repo?.remote?.trim() || repo?.name?.trim() || "No repo";
}

export function lastPathSegment(path: string): string | undefined {
  return path.split(/[\\/]/u).findLast((segment) => segment.length > 0);
}

export function workerSupportsEngine(worker: JarvisWorkerProfile, engine: string): boolean {
  return worker.engines.some(
    (candidate) =>
      candidate.engine.trim().toLowerCase() === engine &&
      (candidate.status === "available" || candidate.status === "degraded"),
  );
}

export function workerCanStartRepo(worker: JarvisWorkerProfile, repo: string | null): boolean {
  const repositories = worker.repositories ?? [];
  if (repositories.length === 0 || repo === null) {
    return true;
  }
  const selected = repo.trim().toLowerCase();
  const selectedSegment = lastPathSegment(selected);
  return repositories.some((repository) => {
    if (!repository.can_start_work) return false;
    const workerRepo = repository.repo.trim().toLowerCase();
    return workerRepo === selected || workerRepo === selectedSegment;
  });
}

export function workerIsHealthyEnough(worker: JarvisWorkerProfile): boolean {
  return worker.status !== "offline" && worker.health !== "unhealthy";
}

export function sortWorkers(workers: ReadonlyArray<JarvisWorkerProfile>): JarvisWorkerProfile[] {
  return [...workers].sort((left, right) => left.display_name.localeCompare(right.display_name));
}

export function workerLabel(worker: JarvisWorkerProfile | null | undefined): string {
  return worker?.display_name?.trim() || worker?.worker_id || "Unknown worker";
}

export function shortProjectLabel(project: ComposerJarvisProject | null): string {
  if (!project) return "Project";
  return project.name || "Project";
}
