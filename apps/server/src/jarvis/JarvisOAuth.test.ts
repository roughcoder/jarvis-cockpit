import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { exportJWK, generateKeyPair, importJWK, jwtVerify, type JWK } from "jose";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { getJarvisOAuthJwks, makeJarvisOAuthAccessToken } from "./JarvisOAuth.ts";

const textEncoder = new TextEncoder();

const oauthConfig = {
  jarvisOAuthIssuer: "http://cockpit.local:3773",
  jarvisOAuthAudience: "jarvis-brain",
  jarvisOAuthScopes: "jarvis:read jarvis:operate",
  jarvisOAuthUserEmail: "neil@example.test",
  jarvisOAuthJarvisUser: "neil",
};

function alreadyExistsSecretError() {
  return new ServerSecretStore.SecretStorePersistError({
    resource: "secret jarvis-oauth-signing-jwk",
    cause: {
      _tag: "PlatformError",
      reason: { _tag: "AlreadyExists" },
    },
  });
}

it.effect("OAuth signing key creation reads the existing key after a concurrent create", () =>
  Effect.gen(function* () {
    const { privateKey, publicKey } = yield* Effect.promise(() =>
      generateKeyPair("RS256", { extractable: true }),
    );
    const privateJwk = {
      ...(yield* Effect.promise(() => exportJWK(privateKey))),
      kid: "jarvis-cockpit-local-rs256",
      alg: "RS256",
      use: "sig",
    } satisfies JWK;
    const publicJwk = {
      ...(yield* Effect.promise(() => exportJWK(publicKey))),
      kid: "jarvis-cockpit-local-rs256",
      alg: "RS256",
      use: "sig",
    } satisfies JWK;
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    const encoded = textEncoder.encode(JSON.stringify(privateJwk));
    let getCalls = 0;
    let createCalls = 0;
    let setCalls = 0;
    const secrets = ServerSecretStore.ServerSecretStore.of({
      get: () =>
        Effect.sync(() => {
          getCalls += 1;
          return getCalls === 1 ? Option.none() : Option.some(encoded);
        }),
      set: () =>
        Effect.sync(() => {
          setCalls += 1;
        }),
      create: () =>
        Effect.sync(() => {
          createCalls += 1;
        }).pipe(Effect.flatMap(() => Effect.fail(alreadyExistsSecretError()))),
      getOrCreateRandom: () => Effect.die("unused"),
      remove: () => Effect.die("unused"),
    });

    const token = yield* makeJarvisOAuthAccessToken({ config: oauthConfig, secrets });
    assert.notStrictEqual(token, undefined);
    const verificationKey = yield* Effect.promise(() => importJWK(publicJwk, "RS256"));
    const verified = yield* Effect.promise(() =>
      jwtVerify(token ?? "", verificationKey, {
        issuer: oauthConfig.jarvisOAuthIssuer,
        audience: oauthConfig.jarvisOAuthAudience,
        clockTolerance: Number.MAX_SAFE_INTEGER,
      }),
    );

    assert.strictEqual(createCalls, 1);
    assert.strictEqual(setCalls, 0);
    assert.strictEqual(verified.payload.sub, oauthConfig.jarvisOAuthJarvisUser);
    assert.strictEqual(verified.payload.jarvis_user, oauthConfig.jarvisOAuthJarvisUser);
    assert.strictEqual(verified.payload.email, oauthConfig.jarvisOAuthUserEmail);
  }),
);

it.effect("OAuth JWKS strips private and signing-only key operations", () =>
  Effect.gen(function* () {
    const { privateKey } = yield* Effect.promise(() =>
      generateKeyPair("RS256", { extractable: true }),
    );
    const privateJwk = {
      ...(yield* Effect.promise(() => exportJWK(privateKey))),
      kid: "jarvis-cockpit-local-rs256",
      alg: "RS256",
      use: "sig",
      key_ops: ["sign"],
    } satisfies JWK;
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    const encoded = textEncoder.encode(JSON.stringify(privateJwk));
    const secrets = ServerSecretStore.ServerSecretStore.of({
      get: () => Effect.succeed(Option.some(encoded)),
      set: () => Effect.die("unused"),
      create: () => Effect.die("unused"),
      getOrCreateRandom: () => Effect.die("unused"),
      remove: () => Effect.die("unused"),
    });

    const jwks = yield* getJarvisOAuthJwks({ config: oauthConfig, secrets });
    const key = jwks.keys[0] as JWK & Record<string, unknown>;

    assert.strictEqual(key.key_ops, undefined);
    assert.strictEqual(key.d, undefined);
    assert.strictEqual(key.p, undefined);
    assert.strictEqual(key.q, undefined);
  }),
);
