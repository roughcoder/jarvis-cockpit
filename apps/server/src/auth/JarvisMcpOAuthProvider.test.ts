import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import { makeJarvisMcpOAuthProviderConfig } from "./JarvisMcpOAuthProvider.ts";

describe("Jarvis MCP OAuth provider configuration", () => {
  it("configures Better Auth OAuth provider audiences for the Jarvis MCP resource", () => {
    const config = makeJarvisMcpOAuthProviderConfig({
      betterAuthUrl: new URL("http://127.0.0.1:3773"),
      jarvisOAuthIssuer: undefined,
      jarvisMcpResourceUrl: "http://127.0.0.1:8795/",
      jarvisOAuthAudience: undefined,
    });

    NodeAssert.equal(config.configured, true);
    NodeAssert.equal(config.issuer, "http://127.0.0.1:3773");
    NodeAssert.equal(config.resource, "http://127.0.0.1:8795");
    NodeAssert.equal(config.jwksUrl, "http://127.0.0.1:3773/jwks");
    NodeAssert.deepStrictEqual(config.options?.validAudiences, ["http://127.0.0.1:8795"]);
    NodeAssert.deepStrictEqual(config.options?.scopes, ["offline_access"]);
    NodeAssert.equal(config.options?.allowDynamicClientRegistration, true);
    NodeAssert.equal(config.options?.allowUnauthenticatedClientRegistration, true);
  });

  it("keeps OAuth provider configuration missing when the Jarvis resource is absent", () => {
    const config = makeJarvisMcpOAuthProviderConfig({
      betterAuthUrl: new URL("http://127.0.0.1:3773"),
      jarvisOAuthIssuer: undefined,
      jarvisMcpResourceUrl: undefined,
      jarvisOAuthAudience: undefined,
    });

    NodeAssert.equal(config.configured, false);
    NodeAssert.deepStrictEqual(config.missing, ["resource"]);
    NodeAssert.equal(config.options, undefined);
  });

  it("uses URL-shaped legacy OAuth audience as a resource fallback", () => {
    const config = makeJarvisMcpOAuthProviderConfig({
      betterAuthUrl: new URL("http://127.0.0.1:3773"),
      jarvisOAuthIssuer: undefined,
      jarvisMcpResourceUrl: undefined,
      jarvisOAuthAudience: "http://127.0.0.1:8795",
    });

    NodeAssert.equal(config.configured, true);
    NodeAssert.equal(config.resource, "http://127.0.0.1:8795");
  });
});
