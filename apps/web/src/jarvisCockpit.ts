import type { EnvironmentId, ServerConfig } from "@t3tools/contracts";

/**
 * Jarvis cockpit mode: the environment's server proxies orchestration reads
 * and writes to Jarvis (`JARVIS_COCKPIT_ENABLED` or `JARVIS_FIXTURE_MODE`).
 * In this mode onboarding is Jarvis-first ("Start work"), and local T3
 * project/worktree affordances stay hidden.
 */
export const JARVIS_PROJECT_ID_PREFIX = "jarvis-run_";
export const JARVIS_THREAD_ID_PREFIX = "jarvis-session_";
export const JARVIS_START_PROJECT_ID = "jarvis-start";

export function isJarvisCockpitEnvironment(
  config: Pick<ServerConfig, "environment"> | undefined,
): boolean {
  return config?.environment.capabilities.jarvisCockpit === true;
}

export function jarvisCockpitEnvironmentIds(
  serverConfigs: ReadonlyMap<EnvironmentId, Pick<ServerConfig, "environment">>,
): ReadonlySet<EnvironmentId> {
  const ids = new Set<EnvironmentId>();
  for (const [environmentId, config] of serverConfigs) {
    if (isJarvisCockpitEnvironment(config)) {
      ids.add(environmentId);
    }
  }
  return ids;
}

export function isJarvisCockpitMode(
  serverConfigs: ReadonlyMap<EnvironmentId, Pick<ServerConfig, "environment">>,
): boolean {
  for (const config of serverConfigs.values()) {
    if (isJarvisCockpitEnvironment(config)) {
      return true;
    }
  }
  return false;
}

export function isJarvisProjectId(projectId: string): boolean {
  return projectId.startsWith(JARVIS_PROJECT_ID_PREFIX);
}

export function isJarvisStartProjectId(projectId: string): boolean {
  return projectId === JARVIS_START_PROJECT_ID;
}

export function isJarvisThreadId(threadId: string): boolean {
  return threadId.startsWith(JARVIS_THREAD_ID_PREFIX);
}
