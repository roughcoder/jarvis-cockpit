import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "./ServerEnvironment.ts";

const isServerEnvironmentIdPersistenceError = Schema.is(
  ServerEnvironment.ServerEnvironmentIdPersistenceError,
);

const makeServerEnvironmentLayer = (baseDir: string) =>
  ServerEnvironment.layer.pipe(Layer.provide(ServerConfig.layerTest(process.cwd(), baseDir)));

const makeServerConfig = Effect.fn(function* (baseDir: string) {
  const derivedPaths = yield* ServerConfig.deriveServerPaths(baseDir, undefined);

  return {
    ...derivedPaths,
    logLevel: "Error",
    traceMinLevel: "Info",
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server",
    cwd: process.cwd(),
    baseDir,
    mode: "web",
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    jarvisCockpitEnabled: false,
    jarvisApiBaseUrl: undefined,
    jarvisApiToken: undefined,
    jarvisDefaultRepo: undefined,
    jarvisFixtureMode: false,
    port: 0,
    host: undefined,
    desktopBootstrapToken: undefined,
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: false,
    startupPresentation: "browser",
  } satisfies ServerConfig.ServerConfig["Service"];
});

it.layer(NodeServices.layer)("ServerEnvironmentLive", (it) => {
  it.effect("persists the environment id across service restarts", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-server-environment-test-",
      });

      const first = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(Effect.provide(makeServerEnvironmentLayer(baseDir)));
      const second = yield* Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      }).pipe(Effect.provide(makeServerEnvironmentLayer(baseDir)));

      expect(first.environmentId).toBe(second.environmentId);
      expect(second.capabilities.repositoryIdentity).toBe(true);
    }),
  );

  it.effect("reports the jarvis cockpit capability from server config", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-server-environment-test-",
      });
      const config = yield* makeServerConfig(baseDir);
      yield* ServerConfig.ensureServerDirectories(config);

      const getDescriptor = Effect.gen(function* () {
        const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
        return yield* serverEnvironment.getDescriptor;
      });

      const defaultDescriptor = yield* getDescriptor.pipe(
        Effect.provide(ServerEnvironment.layer.pipe(Layer.provide(ServerConfig.layer(config)))),
      );
      expect(defaultDescriptor.capabilities.jarvisCockpit).toBe(false);

      const cockpitDescriptor = yield* getDescriptor.pipe(
        Effect.provide(
          ServerEnvironment.layer.pipe(
            Layer.provide(ServerConfig.layer({ ...config, jarvisCockpitEnabled: true })),
          ),
        ),
      );
      expect(cockpitDescriptor.capabilities.jarvisCockpit).toBe(true);

      const fixtureDescriptor = yield* getDescriptor.pipe(
        Effect.provide(
          ServerEnvironment.layer.pipe(
            Layer.provide(ServerConfig.layer({ ...config, jarvisFixtureMode: true })),
          ),
        ),
      );
      expect(fixtureDescriptor.capabilities.jarvisCockpit).toBe(true);
    }),
  );

  it.effect("structures persisted environment id filesystem failures", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-server-environment-error-test-",
      });
      const serverConfig = yield* makeServerConfig(baseDir);
      const environmentIdPath = serverConfig.environmentIdPath;
      const methodByOperation = {
        check: "exists",
        read: "readFileString",
        write: "writeFileString",
      } as const;

      for (const operation of ["check", "read", "write"] as const) {
        const writeAttempts: string[] = [];
        const cause = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: methodByOperation[operation],
          description: "permission denied",
          pathOrDescriptor: environmentIdPath,
        });
        const failingFileSystemLayer = FileSystem.layerNoop({
          exists: () =>
            operation === "check" ? Effect.fail(cause) : Effect.succeed(operation === "read"),
          readFileString: () => Effect.fail(cause),
          writeFileString: (path) => {
            writeAttempts.push(path);
            return Effect.fail(cause);
          },
        });

        const error = yield* Effect.gen(function* () {
          const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;
          return yield* serverEnvironment.getDescriptor;
        }).pipe(
          Effect.provide(
            ServerEnvironment.layer.pipe(
              Layer.provide(Layer.merge(ServerConfig.layer(serverConfig), failingFileSystemLayer)),
            ),
          ),
          Effect.flip,
        );

        expect(isServerEnvironmentIdPersistenceError(error)).toBe(true);
        if (!isServerEnvironmentIdPersistenceError(error)) {
          throw error;
        }
        expect(error.operation).toBe(operation);
        expect(error.environmentIdPath).toBe(environmentIdPath);
        expect(error.cause).toBe(cause);
        expect(error.message).toBe(
          `Server environment ID ${operation} failed at '${environmentIdPath}'.`,
        );
        expect(writeAttempts).toEqual(operation === "write" ? [environmentIdPath] : []);
      }
    }),
  );
});
