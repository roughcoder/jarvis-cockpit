import {
  type EnvironmentId,
  type JarvisProjectThreadDetail,
  type JarvisProjectThreadStreamItem,
  type ServerConfig,
  type ServerConfigStreamEvent,
  type ServerLifecycleWelcomePayload,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { FINITE_QUERY_FAMILY_MAX_ENTRIES } from "./retention.ts";

export interface ServerConfigProjection {
  readonly config: ServerConfig;
  readonly latestEvent: ServerConfigStreamEvent;
}

function projectThreadMessageKey(message: JarvisProjectThreadDetail["messages"][number]): string {
  return `${message.role}\u0000${message.peer_id ?? ""}\u0000${message.observed_at}\u0000${message.content}`;
}

/** Apply a durable project-thread update without replacing an unchanged transcript. */
export function applyJarvisProjectThreadStreamItem(
  current: JarvisProjectThreadDetail | null,
  item: JarvisProjectThreadStreamItem,
): JarvisProjectThreadDetail | null {
  switch (item.kind) {
    case "snapshot":
      return item.thread;
    case "thread-updated":
      return current === null ? null : { ...current, ...item.thread, messages: current.messages };
    case "messages-appended": {
      if (current === null) return null;
      const seen = new Set(current.messages.map(projectThreadMessageKey));
      const messages = [...current.messages];
      for (const message of item.messages) {
        const key = projectThreadMessageKey(message);
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push(message);
      }
      return messages.length === current.messages.length ? current : { ...current, messages };
    }
  }
}

export function applyServerConfigProjection(
  current: Option.Option<ServerConfigProjection>,
  event: ServerConfigStreamEvent,
): Option.Option<ServerConfigProjection> {
  switch (event.type) {
    case "snapshot":
      return Option.some({
        config: event.config,
        latestEvent: event,
      });
    case "keybindingsUpdated":
      return Option.map(current, (projection) => ({
        config: {
          ...projection.config,
          keybindings: event.payload.keybindings,
          issues: event.payload.issues,
        },
        latestEvent: event,
      }));
    case "providerStatuses":
      return Option.map(current, (projection) => ({
        config: {
          ...projection.config,
          providers: event.payload.providers,
        },
        latestEvent: event,
      }));
    case "settingsUpdated":
      return Option.map(current, (projection) => ({
        config: {
          ...projection.config,
          settings: event.payload.settings,
        },
        latestEvent: event,
      }));
  }
}

export function projectServerConfig(
  current: Option.Option<ServerConfigProjection>,
  event: ServerConfigStreamEvent,
): readonly [Option.Option<ServerConfigProjection>, ReadonlyArray<ServerConfigProjection>] {
  const next = applyServerConfigProjection(current, event);
  return [next, Option.toArray(next)];
}

export function projectServerWelcome(
  current: Option.Option<ServerLifecycleWelcomePayload>,
  event: {
    readonly type: "welcome" | "ready";
    readonly payload: unknown;
  },
): readonly [
  Option.Option<ServerLifecycleWelcomePayload>,
  ReadonlyArray<ServerLifecycleWelcomePayload>,
] {
  if (event.type !== "welcome") {
    return [current, []];
  }
  const welcome = event.payload as ServerLifecycleWelcomePayload;
  return [Option.some(welcome), [welcome]];
}

export function createServerEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
  options: {
    readonly initialConfigValueAtom: (
      environmentId: EnvironmentId,
    ) => Atom.Atom<ServerConfig | null>;
  },
) {
  const configScheduler = createAtomCommandScheduler();
  const configConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  };
  const configProjection = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:server:config-projection",
    tag: WS_METHODS.subscribeServerConfig,
    transform: (stream) =>
      stream.pipe(Stream.mapAccum(Option.none<ServerConfigProjection>, projectServerConfig)),
  });
  const emptyConfigAtom = Atom.make<ServerConfig | null>(null).pipe(
    Atom.withLabel("environment-data:server:config:empty"),
  );
  const configValueAtom = Atom.family((environmentId: EnvironmentId | null) => {
    if (environmentId === null) {
      return emptyConfigAtom;
    }
    return Atom.make((get): ServerConfig | null => {
      const projection = Option.getOrNull(
        AsyncResult.value(get(configProjection({ environmentId, input: {} }))),
      );
      return projection?.config ?? get(options.initialConfigValueAtom(environmentId));
    }).pipe(Atom.withLabel(`environment-data:server:config:${environmentId}`));
  });
  const settingsValueAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => get(configValueAtom(environmentId))?.settings ?? null).pipe(
      Atom.withLabel(`environment-data:server:settings:${environmentId}`),
    ),
  );
  const providersValueAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => get(configValueAtom(environmentId))?.providers ?? null).pipe(
      Atom.withLabel(`environment-data:server:providers:${environmentId}`),
    ),
  );

  return {
    configValueAtom,
    settingsValueAtom,
    providersValueAtom,
    traceDiagnostics: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:trace-diagnostics",
      tag: WS_METHODS.serverGetTraceDiagnostics,
    }),
    processDiagnostics: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:process-diagnostics",
      tag: WS_METHODS.serverGetProcessDiagnostics,
    }),
    processResourceHistory: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:process-resource-history",
      tag: WS_METHODS.serverGetProcessResourceHistory,
    }),
    configProjection,
    welcome: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:server:welcome",
      tag: WS_METHODS.subscribeServerLifecycle,
      transform: (stream) =>
        stream.pipe(
          Stream.mapAccum(Option.none<ServerLifecycleWelcomePayload>, projectServerWelcome),
        ),
    }),
    refreshProviders: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:refresh-providers",
      tag: WS_METHODS.serverRefreshProviders,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId }) => environmentId,
      },
    }),
    updateProvider: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:update-provider",
      tag: WS_METHODS.serverUpdateProvider,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    upsertKeybinding: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:upsert-keybinding",
      tag: WS_METHODS.serverUpsertKeybinding,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    removeKeybinding: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:remove-keybinding",
      tag: WS_METHODS.serverRemoveKeybinding,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    updateSettings: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:update-settings",
      tag: WS_METHODS.serverUpdateSettings,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    checkJarvisBrain: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:check-jarvis-brain",
      tag: WS_METHODS.serverCheckJarvisBrain,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId }) => environmentId,
      },
    }),
    jarvisCapabilities: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-capabilities",
      tag: WS_METHODS.serverGetJarvisCapabilities,
    }),
    jarvisSnapshot: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-snapshot",
      tag: WS_METHODS.serverGetJarvisSnapshot,
      // One atom family member exists per environment/input pair, so every
      // mounted panel shares this visible-state reconciliation cadence.
      refreshIntervalMs: 10_000,
    }),
    jarvisMcpStatus: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-mcp-status",
      tag: WS_METHODS.serverGetJarvisMcpStatus,
    }),
    jarvisProjects: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-projects",
      tag: WS_METHODS.serverGetJarvisProjects,
    }),
    jarvisProject: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project",
      tag: WS_METHODS.serverGetJarvisProject,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectPullRequests: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-pull-requests",
      tag: WS_METHODS.serverGetJarvisProjectPullRequests,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectMemory: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-memory",
      tag: WS_METHODS.serverGetJarvisProjectMemory,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectFiles: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-files",
      tag: WS_METHODS.serverGetJarvisProjectFiles,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectThreads: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-threads",
      tag: WS_METHODS.serverGetJarvisProjectThreads,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectThread: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-thread",
      tag: WS_METHODS.serverGetJarvisProjectThread,
      maxEntries: FINITE_QUERY_FAMILY_MAX_ENTRIES,
    }),
    jarvisProjectThreadStream: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:server:jarvis-project-thread-stream",
      tag: WS_METHODS.subscribeJarvisProjectThread,
      transform: (stream) =>
        stream.pipe(
          Stream.mapAccum(
            (): JarvisProjectThreadDetail | null => null,
            (current, item) => {
              const next = applyJarvisProjectThreadStreamItem(current, item);
              return [next, [next]];
            },
          ),
        ),
    }),
    validateJarvisWork: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:server:validate-jarvis-work",
      tag: WS_METHODS.serverValidateJarvisWork,
    }),
    pruneJarvisWorkerWorktrees: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:prune-jarvis-worker-worktrees",
      tag: WS_METHODS.serverPruneJarvisWorkerWorktrees,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    closeJarvisSession: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:close-jarvis-session",
      tag: WS_METHODS.serverCloseJarvisSession,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    deleteJarvisSession: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:delete-jarvis-session",
      tag: WS_METHODS.serverDeleteJarvisSession,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    deleteJarvisRun: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:delete-jarvis-run",
      tag: WS_METHODS.serverDeleteJarvisRun,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    createJarvisProject: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:create-jarvis-project",
      tag: WS_METHODS.serverCreateJarvisProject,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    updateJarvisProject: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:update-jarvis-project",
      tag: WS_METHODS.serverUpdateJarvisProject,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    archiveJarvisProject: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:archive-jarvis-project",
      tag: WS_METHODS.serverArchiveJarvisProject,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    deleteJarvisProject: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:delete-jarvis-project",
      tag: WS_METHODS.serverDeleteJarvisProject,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    recordJarvisProjectFinding: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:record-jarvis-project-finding",
      tag: WS_METHODS.serverRecordJarvisProjectFinding,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    recordJarvisProjectDecision: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:record-jarvis-project-decision",
      tag: WS_METHODS.serverRecordJarvisProjectDecision,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    forgetJarvisProjectMemory: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:forget-jarvis-project-memory",
      tag: WS_METHODS.serverForgetJarvisProjectMemory,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    correctJarvisProjectMemory: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:correct-jarvis-project-memory",
      tag: WS_METHODS.serverCorrectJarvisProjectMemory,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    uploadJarvisProjectFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:upload-jarvis-project-file",
      tag: WS_METHODS.serverUploadJarvisProjectFile,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    retractJarvisProjectFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:retract-jarvis-project-file",
      tag: WS_METHODS.serverRetractJarvisProjectFile,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    createJarvisProjectThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:create-jarvis-project-thread",
      tag: WS_METHODS.serverCreateJarvisProjectThread,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    archiveJarvisProjectThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:archive-jarvis-project-thread",
      tag: WS_METHODS.serverArchiveJarvisProjectThread,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    renameJarvisProjectThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:rename-jarvis-project-thread",
      tag: WS_METHODS.serverRenameJarvisProjectThread,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    generateThreadTitle: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:generate-thread-title",
      tag: WS_METHODS.serverGenerateThreadTitle,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    unarchiveJarvisProjectThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:unarchive-jarvis-project-thread",
      tag: WS_METHODS.serverUnarchiveJarvisProjectThread,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    sendJarvisProjectThreadTurn: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:send-jarvis-project-thread-turn",
      tag: WS_METHODS.serverSendJarvisProjectThreadTurn,
      scheduler: configScheduler,
      concurrency: configConcurrency,
    }),
    signalProcess: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:server:signal-process",
      tag: WS_METHODS.serverSignalProcess,
    }),
  };
}
