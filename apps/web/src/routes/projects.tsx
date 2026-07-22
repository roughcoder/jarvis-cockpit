import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectsPage } from "../components/projects/ProjectsPage";

export type ProjectsSearch = {
  readonly create?: boolean;
  readonly environmentId?: string;
};

export const Route = createFileRoute("/projects")({
  validateSearch: (search: Record<string, unknown>): ProjectsSearch => {
    const create =
      typeof search.create === "boolean"
        ? search.create
        : search.create === "true"
          ? true
          : search.create === "false"
            ? false
            : undefined;
    const environmentId =
      typeof search.environmentId === "string" && search.environmentId.trim().length > 0
        ? search.environmentId.trim()
        : undefined;

    return {
      ...(create === undefined ? {} : { create }),
      ...(environmentId === undefined ? {} : { environmentId }),
    };
  },
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ProjectsPage,
});
