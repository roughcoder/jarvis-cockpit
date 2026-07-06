import { createFileRoute } from "@tanstack/react-router";

import { JarvisCapabilitiesPanel } from "../components/settings/JarvisCapabilities";

export const Route = createFileRoute("/settings/capabilities")({
  component: JarvisCapabilitiesPanel,
});
