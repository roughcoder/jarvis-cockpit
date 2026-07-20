import type { JarvisProject } from "@t3tools/contracts";

import { isJarvisStartProjectId } from "../../jarvisCockpit";

export function projectsForIndex(
  projects: ReadonlyArray<JarvisProject>,
): ReadonlyArray<JarvisProject> {
  return projects
    .filter((project) => !isJarvisStartProjectId(project.id))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function projectRepositorySummary(project: Pick<JarvisProject, "repos">): string {
  const preferredRepository =
    project.repos.find((repository) => repository.default) ?? project.repos[0] ?? null;

  if (preferredRepository === null) {
    return "No linked repositories";
  }

  const additionalRepositoryCount = project.repos.length - 1;
  return additionalRepositoryCount > 0
    ? `${preferredRepository.remote} +${additionalRepositoryCount}`
    : preferredRepository.remote;
}

export function projectStatusLabel(project: Pick<JarvisProject, "status">): string {
  const status = project.status?.trim();
  return status && status.length > 0 ? status : "active";
}
