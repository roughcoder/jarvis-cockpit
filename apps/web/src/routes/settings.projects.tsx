import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/projects")({
  beforeLoad: () => {
    throw redirect({ to: "/projects/manage", replace: true });
  },
});
