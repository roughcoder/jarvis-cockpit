import { createFileRoute } from "@tanstack/react-router";

import { JarvisSettingsPanel } from "../components/settings/JarvisSettings";

export const Route = createFileRoute("/settings/jarvis")({
  component: JarvisSettingsPanel,
});
