import { describe, expect, it } from "vite-plus/test";
import type { ServerConfig } from "@t3tools/contracts";

import { makeDiagnosticsJson, makeJarvisDiagnosticsExport } from "./JarvisCapabilities.logic";

describe("makeJarvisDiagnosticsExport", () => {
  it("redacts tokens, authorization headers, URL credentials, JWTs, and emails", () => {
    const fakeToken = "jarvis_super_secret_token";
    const fakeJwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJuZWlsQGV4YW1wbGUuY29tIn0.fakeSignatureValue";
    const fakeEmail = "neil@example.com";
    const fakeCredentialUrl = "https://alice:secret-password@jarvis.example.test/v1/projects";

    const bundle = makeJarvisDiagnosticsExport({
      generatedAt: "2026-07-06T12:00:00.000Z",
      serverConfig: {
        environment: {
          environmentId: "environment-1",
          serverVersion: "0.0.0-test",
          platform: { os: "darwin", arch: "arm64" },
        },
        jarvisBrain: {
          enabled: true,
          fixtureMode: false,
          apiBaseUrl: fakeCredentialUrl,
          apiBaseUrlSource: "settings",
          apiTokenConfigured: true,
          apiTokenSource: "settings",
          oauthTokenConfigured: true,
          oauthTokenSource: "environment",
        },
      } as ServerConfig,
      snapshotResult: {
        ok: true,
        snapshot: {
          generated_at: "2026-07-06T11:59:00.000Z",
          workers: [
            {
              worker_id: "worker-1",
              status: "online",
              health: "healthy",
              capacity: { max_sessions: 4, active_sessions: 1, queued_sessions: 0 },
              public_metadata: {
                owner_email: fakeEmail,
                authorization: `Bearer ${fakeToken}`,
              },
            },
          ],
        },
      } as never,
      mcpStatusResult: {
        ok: true,
        status: {
          serve: {
            configured: true,
            oauth: {
              configured: true,
              issuer: `https://issuer.example.test/users/${fakeEmail}`,
              resource: fakeCredentialUrl,
            },
            tokens: { active: 1, revoked: 0 },
            codex_wired: true,
            codex_wired_reason: null,
          },
        },
      } as never,
      capabilitiesResult: {
        ok: true,
        checked_at: "2026-07-06T12:00:00.000Z",
        routes: [
          {
            id: "projects.list",
            group: "project",
            label: "List projects",
            method: "GET",
            path: fakeCredentialUrl,
            safe_to_probe: true,
            status: "available",
            status_code: 200,
            detail: `Authorization: Bearer ${fakeToken}; jwt=${fakeJwt}; email=${fakeEmail}`,
            probed_at: "2026-07-06T12:00:00.000Z",
          },
        ],
        error: { message: fakeJwt },
      },
    });

    const json = makeDiagnosticsJson(bundle);

    expect(json).not.toContain(fakeToken);
    expect(json).not.toContain(fakeJwt);
    expect(json).not.toContain(fakeEmail);
    expect(json).not.toContain("alice:secret-password");
    expect(json).not.toContain("secret-password");
    expect(json).toContain("[redacted]");
    expect(json).toContain("[redacted-email]");
  });
});
