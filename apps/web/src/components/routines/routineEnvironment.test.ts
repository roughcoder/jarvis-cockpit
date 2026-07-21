import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveRoutineEnvironment } from "./routineEnvironment";

describe("routine environment selection", () => {
  const environments = [
    { environmentId: EnvironmentId.make("jarvis-a"), label: "Jarvis A" },
    { environmentId: EnvironmentId.make("jarvis-b"), label: "Jarvis B" },
  ];

  it("keeps the explicitly selected Jarvis environment", () => {
    expect(resolveRoutineEnvironment(environments, EnvironmentId.make("jarvis-b"))?.label).toBe(
      "Jarvis B",
    );
  });

  it("falls back safely when the selected environment disconnects", () => {
    expect(
      resolveRoutineEnvironment(environments, EnvironmentId.make("jarvis-missing"))?.label,
    ).toBe("Jarvis A");
  });
});
