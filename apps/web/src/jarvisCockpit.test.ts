import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isJarvisCockpitEnvironment,
  isJarvisCockpitMode,
  isJarvisProjectId,
  isJarvisThreadId,
  jarvisCockpitEnvironmentIds,
} from "./jarvisCockpit";

function makeEnvironmentConfig(jarvisCockpit: boolean, id = "environment-1") {
  return {
    environment: {
      environmentId: EnvironmentId.make(id),
      label: "Test",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0",
      capabilities: {
        repositoryIdentity: true,
        jarvisCockpit,
      },
    },
  } as const;
}

describe("jarvisCockpit", () => {
  it("detects cockpit mode from environment capabilities", () => {
    expect(isJarvisCockpitEnvironment(makeEnvironmentConfig(true))).toBe(true);
    expect(isJarvisCockpitEnvironment(makeEnvironmentConfig(false))).toBe(false);
    expect(isJarvisCockpitEnvironment(undefined)).toBe(false);
  });

  it("reports cockpit mode when any environment has the capability", () => {
    const configs = new Map([
      [EnvironmentId.make("environment-local"), makeEnvironmentConfig(false, "environment-local")],
      [
        EnvironmentId.make("environment-cockpit"),
        makeEnvironmentConfig(true, "environment-cockpit"),
      ],
    ]);
    expect(isJarvisCockpitMode(configs)).toBe(true);
    expect(jarvisCockpitEnvironmentIds(configs)).toEqual(
      new Set([EnvironmentId.make("environment-cockpit")]),
    );
  });

  it("reports no cockpit mode when no environment has the capability", () => {
    const configs = new Map([
      [EnvironmentId.make("environment-local"), makeEnvironmentConfig(false, "environment-local")],
    ]);
    expect(isJarvisCockpitMode(configs)).toBe(false);
    expect(jarvisCockpitEnvironmentIds(configs).size).toBe(0);
  });

  it("identifies Jarvis-projected ids", () => {
    expect(isJarvisProjectId("jarvis-run_run_123")).toBe(true);
    expect(isJarvisProjectId("project-1")).toBe(false);
    expect(isJarvisThreadId("jarvis-session_sess_123")).toBe(true);
    expect(isJarvisThreadId("thread-1")).toBe(false);
  });
});
