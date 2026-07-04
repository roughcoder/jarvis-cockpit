import { createFileRoute } from "@tanstack/react-router";

import { JarvisWorkersPanel } from "../components/settings/JarvisWorkers";

export const Route = createFileRoute("/settings/workers")({
  component: JarvisWorkersPanel,
});
