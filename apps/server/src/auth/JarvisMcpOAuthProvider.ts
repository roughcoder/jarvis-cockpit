import type { OAuthOptions } from "@better-auth/oauth-provider";

import type { ServerConfig } from "../config.ts";

export const JarvisMcpOAuthScopes = ["offline_access"] as const;
export const JarvisMcpOAuthAccessTokenTtlSeconds = 15 * 60;
export const JarvisMcpOAuthRefreshTokenTtlSeconds = 30 * 24 * 60 * 60;

export interface JarvisMcpOAuthProviderConfig {
  readonly configured: boolean;
  readonly issuer?: string | undefined;
  readonly resource?: string | undefined;
  readonly jwksUrl?: string | undefined;
  readonly options?: OAuthOptions<typeof JarvisMcpOAuthScopes> | undefined;
  readonly missing: ReadonlyArray<"issuer" | "resource" | "jwks">;
}

export function makeJarvisMcpOAuthProviderConfig(
  config: Pick<
    ServerConfig["Service"],
    "jarvisOAuthIssuer" | "jarvisMcpResourceUrl" | "jarvisOAuthAudience" | "betterAuthUrl"
  >,
): JarvisMcpOAuthProviderConfig {
  const issuer = normalizeUrlString(config.jarvisOAuthIssuer ?? config.betterAuthUrl?.toString());
  const resource = normalizeUrlString(config.jarvisMcpResourceUrl ?? config.jarvisOAuthAudience);
  const jwksUrl = issuer ? `${issuer}/jwks` : undefined;
  const missing = [
    ...(issuer ? [] : (["issuer"] as const)),
    ...(resource ? [] : (["resource"] as const)),
    ...(jwksUrl ? [] : (["jwks"] as const)),
  ];

  if (!issuer || !resource || !jwksUrl) {
    return {
      configured: false,
      ...(issuer ? { issuer } : {}),
      ...(resource ? { resource } : {}),
      ...(jwksUrl ? { jwksUrl } : {}),
      missing,
    };
  }

  return {
    configured: true,
    issuer,
    resource,
    jwksUrl,
    missing,
    options: {
      loginPage: "/auth/sign-in",
      consentPage: "/auth/consent",
      scopes: JarvisMcpOAuthScopes,
      validAudiences: [resource],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      accessTokenExpiresIn: JarvisMcpOAuthAccessTokenTtlSeconds,
      refreshTokenExpiresIn: JarvisMcpOAuthRefreshTokenTtlSeconds,
    },
  };
}

function normalizeUrlString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}
