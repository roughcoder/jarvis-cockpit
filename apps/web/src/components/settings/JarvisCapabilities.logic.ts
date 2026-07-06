import type {
  JarvisCapabilitiesResult,
  JarvisCockpitSnapshotResult,
  JarvisMcpStatusResult,
  ServerConfig,
} from "@t3tools/contracts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

const SENSITIVE_KEY_PATTERN =
  /(^|_|\b)(authorization|auth_header|token|jwt|secret|password|credential|api_key|apikey|email)(_|$|\b)/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const API_KEY_PATTERN = /\b(?:sk|pk|jarvis|t3|ghp|github_pat)_[A-Za-z0-9_=-]{8,}\b/g;
const URL_CREDENTIALS_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)([^/?#\s@]+)@/gi;

export function classifyDiagnosticsFailure(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/401|403|auth|unauthori[sz]ed|forbidden/i.test(message)) return "auth";
  if (/404|missing|not found/i.test(message)) return "missing-route";
  if (/network|fetch|ECONNREFUSED|ENOTFOUND|timeout/i.test(message)) return "network";
  return "unknown";
}

export function jarvisBaseUrlHost(apiBaseUrl: string | null | undefined): string | null {
  if (!apiBaseUrl) return null;
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return null;
  }
}

function authMode(connection: ServerConfig["jarvisBrain"] | null): string {
  if (connection?.fixtureMode) return "fixture";
  if (connection?.oauthTokenConfigured) return "oauth";
  if (connection?.apiTokenConfigured) return "recovery-token";
  return "none";
}

function redactString(value: string): string {
  return value
    .replace(URL_CREDENTIALS_PATTERN, "$1[redacted]@")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(API_KEY_PATTERN, "[redacted-token]")
    .replace(EMAIL_PATTERN, "[redacted-email]");
}

export function redactDiagnosticsValue(value: unknown, key = ""): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticsValue(item));
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = SENSITIVE_KEY_PATTERN.test(entryKey)
        ? "[redacted]"
        : redactDiagnosticsValue(entryValue, entryKey);
    }
    return output;
  }
  return String(value);
}

export function makeJarvisDiagnosticsExport(input: {
  readonly generatedAt: string;
  readonly serverConfig: ServerConfig | null;
  readonly snapshotResult: JarvisCockpitSnapshotResult | null;
  readonly mcpStatusResult: JarvisMcpStatusResult | null;
  readonly capabilitiesResult: JarvisCapabilitiesResult | null;
}): JsonValue {
  const connection = input.serverConfig?.jarvisBrain ?? null;
  const snapshot = input.snapshotResult?.snapshot ?? null;
  const snapshotFailure =
    input.snapshotResult?.ok === false
      ? (input.snapshotResult.error?.message ?? "Jarvis snapshot unavailable.")
      : null;
  const bundle = {
    kind: "jarvis-cockpit-diagnostics",
    generated_at: input.generatedAt,
    brain: {
      enabled: connection?.enabled ?? false,
      fixture_mode: connection?.fixtureMode ?? false,
      base_url_host: jarvisBaseUrlHost(connection?.apiBaseUrl),
      base_url_source: connection?.apiBaseUrlSource ?? null,
      auth_mode: authMode(connection),
      oauth_configured: connection?.oauthTokenConfigured ?? false,
      api_token_configured: connection?.apiTokenConfigured ?? false,
      last_snapshot_time: snapshot?.generated_at ?? null,
      last_failure_class: classifyDiagnosticsFailure(snapshotFailure),
    },
    mcp_status: input.mcpStatusResult,
    workers: {
      count: snapshot?.workers.length ?? 0,
      items:
        snapshot?.workers.map((worker) => ({
          worker_id: worker.worker_id,
          status: worker.status,
          health: worker.health,
          capacity: worker.capacity,
        })) ?? [],
    },
    route_capabilities: input.capabilitiesResult,
    versions: {
      cockpit_server: input.serverConfig?.environment.serverVersion ?? null,
      environment_id: input.serverConfig?.environment.environmentId ?? null,
      platform: input.serverConfig?.environment.platform ?? null,
    },
  };
  return redactDiagnosticsValue(bundle);
}

export function makeDiagnosticsJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
