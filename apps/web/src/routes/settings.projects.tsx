import { createFileRoute } from "@tanstack/react-router";

import { JarvisProjectsPanel } from "../components/settings/JarvisProjects";

export const Route = createFileRoute("/settings/projects")({
  component: JarvisProjectsPanel,
});
