import { createFileRoute, redirect } from "@tanstack/react-router";

import { RoutinesPage } from "../components/routines/RoutinesPage";

export const Route = createFileRoute("/routines")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: RoutinesPage,
});
