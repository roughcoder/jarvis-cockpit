import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { normalizeDispatchCommand } from "./Normalizer.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  failEnvironmentInvalidRequest,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { JarvisClientError, makeJarvisClient } from "../jarvis/JarvisClient.ts";
import { makeJarvisOAuthAccessToken } from "../jarvis/JarvisOAuth.ts";
import { dispatchJarvisCommand } from "../jarvis/JarvisDispatch.ts";
import {
  loadJarvisReadModel,
  shouldUseJarvisCockpitReads,
} from "../jarvis/JarvisOrchestrationReadModel.ts";
import { ServerConfig } from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";

export const orchestrationHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "orchestration",
  Effect.fnUntraced(function* (handlers) {
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const config = yield* ServerConfig;
    const serverSettings = yield* ServerSettings.ServerSettingsService;
    const secretStore = yield* ServerSecretStore.ServerSecretStore;
    const jarvisOAuthAccessToken = (operation: string) =>
      makeJarvisOAuthAccessToken({ config, secrets: secretStore }).pipe(
        Effect.mapError(
          (cause) =>
            new JarvisClientError({
              operation,
              message: "Failed to issue Jarvis OAuth access token.",
              cause,
            }),
        ),
      );
    const jarvisClient = makeJarvisClient({
      ...config,
      getSettings: serverSettings.getSettings,
      oauthAccessToken: jarvisOAuthAccessToken,
    });

    return handlers
      .handle(
        "snapshot",
        Effect.fn("environment.orchestration.snapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          if (shouldUseJarvisCockpitReads(config)) {
            return yield* loadJarvisReadModel(jarvisClient).pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
          }
          return yield* projectionSnapshotQuery
            .getSnapshot()
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
        }),
      )
      .handle(
        "dispatch",
        Effect.fn("environment.orchestration.dispatch")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const normalizedCommand = yield* normalizeDispatchCommand(args.payload).pipe(
            Effect.catch(() => failEnvironmentInvalidRequest("invalid_command")),
          );
          const jarvisResult = yield* dispatchJarvisCommand({
            client: jarvisClient,
            enabled: shouldUseJarvisCockpitReads(config),
            command: normalizedCommand,
          }).pipe(
            Effect.catch((cause) =>
              failEnvironmentInternal("orchestration_dispatch_failed", cause),
            ),
          );
          if (jarvisResult !== null) {
            return jarvisResult;
          }
          return yield* orchestrationEngine
            .dispatch(normalizedCommand)
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_dispatch_failed", cause),
              ),
            );
        }),
      );
  }),
);
