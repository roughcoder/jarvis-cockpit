import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from "jose";

import { ServerConfig } from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";

const JARVIS_OAUTH_SIGNING_KEY_SECRET = "jarvis-oauth-signing-jwk";
const JARVIS_OAUTH_KEY_ID = "jarvis-cockpit-local-rs256";
const JARVIS_OAUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type JarvisOAuthConfig = Pick<
  ServerConfig["Service"],
  | "jarvisOAuthIssuer"
  | "jarvisOAuthAudience"
  | "jarvisOAuthScopes"
  | "jarvisOAuthUserEmail"
  | "jarvisOAuthJarvisUser"
>;

type SecretStore = ServerSecretStore.ServerSecretStore["Service"];
type JarvisOAuthEffectError = ServerSecretStore.SecretStoreError | JarvisOAuthError;

export class JarvisOAuthError extends Data.TaggedError("JarvisOAuthError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Jarvis OAuth ${this.operation} failed.`;
  }
}

export function isJarvisOAuthConfigured(config: JarvisOAuthConfig): boolean {
  return Boolean(config.jarvisOAuthAudience?.trim() && config.jarvisOAuthJarvisUser?.trim());
}

export function makeJarvisOAuthAccessToken(input: {
  readonly config: JarvisOAuthConfig;
  readonly secrets: SecretStore;
}): Effect.Effect<string | undefined, JarvisOAuthEffectError> {
  if (!isJarvisOAuthConfigured(input.config)) {
    return Effect.map(Effect.void, () => undefined);
  }
  return Effect.gen(function* () {
    const privateJwk = yield* loadSigningJwk(input.secrets);
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1_000);
    return yield* Effect.tryPromise({
      try: async () => {
        const key = await importJWK(privateJwk, "RS256");
        const jarvisUser = input.config.jarvisOAuthJarvisUser?.trim() ?? "";
        const email = input.config.jarvisOAuthUserEmail?.trim();
        return new SignJWT({
          scope: normalizeScopes(input.config.jarvisOAuthScopes),
          jarvis_user: jarvisUser,
          ...(email ? { email } : {}),
        })
          .setProtectedHeader({ alg: "RS256", kid: JARVIS_OAUTH_KEY_ID, typ: "JWT" })
          .setIssuer(input.config.jarvisOAuthIssuer ?? "")
          .setSubject(jarvisUser)
          .setAudience(input.config.jarvisOAuthAudience?.trim() ?? "")
          .setIssuedAt(now)
          .setExpirationTime(now + JARVIS_OAUTH_ACCESS_TOKEN_TTL_SECONDS)
          .sign(key);
      },
      catch: (cause) => new JarvisOAuthError({ operation: "sign-token", cause }),
    });
  });
}

export function getJarvisOAuthJwks(input: {
  readonly config: JarvisOAuthConfig;
  readonly secrets: SecretStore;
}): Effect.Effect<{ readonly keys: ReadonlyArray<JWK> }, JarvisOAuthEffectError> {
  if (!isJarvisOAuthConfigured(input.config)) {
    return Effect.succeed({ keys: [] });
  }
  return loadSigningJwk(input.secrets).pipe(
    Effect.map((privateJwk) => ({
      keys: [toPublicJwk(privateJwk)],
    })),
  );
}

export const jarvisOAuthJwksRouteLayer = HttpRouter.add(
  "GET",
  "/api/jarvis/oauth/jwks",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    return yield* getJarvisOAuthJwks({ config, secrets }).pipe(
      Effect.matchEffect({
        onFailure: (cause) =>
          Effect.logWarning("Failed to load Jarvis OAuth JWKS", { cause }).pipe(
            Effect.as(
              HttpServerResponse.jsonUnsafe(
                { error: "jarvis_oauth_jwks_unavailable" },
                {
                  status: 503,
                  headers: {
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                  },
                },
              ),
            ),
          ),
        onSuccess: (jwks) =>
          Effect.succeed(
            HttpServerResponse.jsonUnsafe(jwks, {
              headers: {
                "Cache-Control": "public, max-age=300",
                "X-Content-Type-Options": "nosniff",
              },
            }),
          ),
      }),
    );
  }),
);

function loadSigningJwk(secrets: SecretStore): Effect.Effect<JWK, JarvisOAuthEffectError> {
  return secrets.get(JARVIS_OAUTH_SIGNING_KEY_SECRET).pipe(
    Effect.flatMap((existing) => {
      if (Option.isSome(existing)) {
        return decodeSigningJwk(existing.value);
      }
      return generateAndStoreSigningJwk(secrets);
    }),
  );
}

function generateAndStoreSigningJwk(
  secrets: SecretStore,
): Effect.Effect<JWK, JarvisOAuthEffectError> {
  return Effect.tryPromise({
    try: async () => {
      const { privateKey } = await generateKeyPair("RS256", { extractable: true });
      const privateJwk = await exportJWK(privateKey);
      return {
        ...privateJwk,
        kid: JARVIS_OAUTH_KEY_ID,
        alg: "RS256",
        use: "sig",
      } satisfies JWK;
    },
    catch: (cause) => new JarvisOAuthError({ operation: "generate-signing-key", cause }),
  }).pipe(
    Effect.flatMap((jwk) => {
      const encoded = textEncoder.encode(JSON.stringify(jwk));
      return secrets.create(JARVIS_OAUTH_SIGNING_KEY_SECRET, encoded).pipe(
        Effect.as(jwk),
        Effect.catchIf(ServerSecretStore.isSecretStoreError, (error) =>
          ServerSecretStore.isSecretAlreadyExistsError(error)
            ? readExistingSigningJwkAfterConcurrentCreate(secrets)
            : Effect.fail(error),
        ),
      );
    }),
  );
}

function readExistingSigningJwkAfterConcurrentCreate(
  secrets: SecretStore,
): Effect.Effect<JWK, JarvisOAuthEffectError> {
  return secrets.get(JARVIS_OAUTH_SIGNING_KEY_SECRET).pipe(
    Effect.flatMap((existing) =>
      Option.isSome(existing)
        ? decodeSigningJwk(existing.value)
        : Effect.fail(
            new JarvisOAuthError({
              operation: "read-concurrent-signing-key",
              cause: "Signing key was created concurrently but could not be read.",
            }),
          ),
    ),
  );
}

function decodeSigningJwk(value: Uint8Array): Effect.Effect<JWK, JarvisOAuthError> {
  return Effect.try({
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    try: () => JSON.parse(textDecoder.decode(value)) as JWK,
    catch: (cause) => new JarvisOAuthError({ operation: "decode-signing-key", cause }),
  });
}

function toPublicJwk(jwk: JWK): JWK {
  const {
    d: _d,
    p: _p,
    q: _q,
    dp: _dp,
    dq: _dq,
    qi: _qi,
    oth: _oth,
    key_ops: _keyOps,
    ...publicJwk
  } = jwk as JWK & Record<string, unknown>;
  return publicJwk as JWK;
}

function normalizeScopes(value: string | undefined): string {
  return (value ?? "jarvis:read jarvis:operate")
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0)
    .join(" ");
}
