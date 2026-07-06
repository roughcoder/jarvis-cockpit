import { createFileRoute } from "@tanstack/react-router";

import { JarvisMcpPanel } from "../components/settings/JarvisMcp";

export const Route = createFileRoute("/settings/mcp")({
  component: JarvisMcpPanel,
});
