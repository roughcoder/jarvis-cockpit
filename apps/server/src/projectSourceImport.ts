// @effect-diagnostics nodeBuiltinImport:off - This security boundary pins DNS results into raw TLS requests per hop.
import * as NodeCrypto from "node:crypto";
import * as NodeDnsPromises from "node:dns/promises";
import * as NodeHttps from "node:https";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as DateTime from "effect/DateTime";

export const PROJECT_SOURCE_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const PROJECT_SOURCE_IMPORT_MAX_REDIRECTS = 5;
const PROJECT_SOURCE_IMPORT_TIMEOUT_MS = 30_000;
const PROJECT_SOURCE_IMPORT_MAX_URL_LENGTH = 2_048;

export type ProjectSourceProvider = "github" | "notion" | "x" | "web";

export interface ProjectSourceImportResult {
  readonly filename: string;
  readonly contentBase64: string;
  readonly mimeType: string;
  readonly title: string;
  readonly provider: ProjectSourceProvider;
  readonly requestedUrl: string;
  readonly canonicalUrl: string;
  readonly finalUrl: string;
  readonly fetchedAt: string;
  readonly contentSha256: string;
  readonly sourceIdentity: string;
  readonly docId: string;
}

interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

interface ProjectSourceResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Uint8Array;
}

export interface ProjectSourceImportDependencies {
  readonly resolve: (hostname: string) => Promise<ReadonlyArray<ResolvedAddress>>;
  readonly request: (
    url: URL,
    address: ResolvedAddress,
    maxBytes: number,
    signal?: AbortSignal,
  ) => Promise<ProjectSourceResponse>;
  readonly now?: () => string;
}

const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.github.raw+json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/xhtml+xml",
  "text/html",
  "text/markdown",
  "text/plain",
]);

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isPublicProjectSourceAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/gu, "");
  const family = NodeNet.isIP(unbracketed);
  if (family === 4) {
    const value = ipv4Number(unbracketed);
    if (value === null) return false;
    const blocked: ReadonlyArray<readonly [number, number]> = [
      [0x00000000, 8],
      [0x0a000000, 8],
      [0x64400000, 10],
      [0x7f000000, 8],
      [0xa9fe0000, 16],
      [0xac100000, 12],
      [0xc0000000, 24],
      [0xc0000200, 24],
      [0xc0a80000, 16],
      [0xc6120000, 15],
      [0xc6336400, 24],
      [0xcb007100, 24],
      [0xe0000000, 4],
      [0xf0000000, 4],
    ];
    return !blocked.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  }
  if (family === 6) {
    const normalized = unbracketed.toLowerCase().split("%")[0] ?? "";
    const mappedIpv4 = /^(?:0*:){5}ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
    if (mappedIpv4) return isPublicProjectSourceAddress(mappedIpv4);
    const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
    return !normalized.startsWith("2001:db8:") && !normalized.startsWith("3fff:");
  }
  return false;
}

function parseProjectSourceUrl(value: string): URL {
  const trimmed = value.trim();
  if (trimmed.length > PROJECT_SOURCE_IMPORT_MAX_URL_LENGTH) {
    throw new Error("Project source URLs must be 2,048 characters or fewer.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a complete HTTPS URL.");
  }
  if (url.protocol !== "https:") throw new Error("Project sources must use HTTPS.");
  if (url.username || url.password) {
    throw new Error("Project source URLs cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Project source URLs must use the standard HTTPS port.");
  }
  return url;
}

export function canonicalProjectSourceUrl(value: string): string {
  const url = parseProjectSourceUrl(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (url.port === "443") url.port = "";
  return url.toString();
}

export function projectSourceProvider(value: URL | string): ProjectSourceProvider {
  const url = typeof value === "string" ? parseProjectSourceUrl(value) : value;
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    new Set([
      "api.github.com",
      "gist.github.com",
      "gist.githubusercontent.com",
      "github.com",
      "raw.githubusercontent.com",
      "www.github.com",
    ]).has(hostname)
  ) {
    return "github";
  }
  if (
    hostname === "notion.so" ||
    hostname === "www.notion.so" ||
    hostname.endsWith(".notion.site")
  ) {
    return "notion";
  }
  if (
    hostname === "x.com" ||
    hostname === "www.x.com" ||
    hostname === "twitter.com" ||
    hostname === "www.twitter.com"
  ) {
    return "x";
  }
  return "web";
}

function providerFetchUrl(canonicalUrl: string, provider: ProjectSourceProvider): URL {
  const url = new URL(canonicalUrl);
  if (provider === "x") {
    return new URL(
      `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(canonicalUrl)}`,
    );
  }
  if (provider !== "github" || !new Set(["github.com", "www.github.com"]).has(url.hostname)) {
    return url;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length >= 5 && parts[2] === "blob") {
    return new URL(
      `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts[3]}/${parts.slice(4).join("/")}`,
    );
  }
  if (parts.length === 2) {
    return new URL(`https://api.github.com/repos/${parts[0]}/${parts[1]}/readme`);
  }
  if (parts.length >= 4 && parts[2] === "issues") {
    return new URL(`https://api.github.com/repos/${parts[0]}/${parts[1]}/issues/${parts[3]}`);
  }
  if (parts.length >= 4 && parts[2] === "pull") {
    return new URL(`https://api.github.com/repos/${parts[0]}/${parts[1]}/pulls/${parts[3]}`);
  }
  return url;
}

async function resolvePublicAddresses(
  hostname: string,
  dependencies: ProjectSourceImportDependencies,
): Promise<ReadonlyArray<ResolvedAddress>> {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "");
  if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) {
    throw new Error("Project sources must be publicly reachable.");
  }
  const addresses = await dependencies.resolve(normalizedHostname);
  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicProjectSourceAddress(entry.address))
  ) {
    throw new Error("Project sources must resolve only to public network addresses.");
  }
  return addresses;
}

function normalizedHeader(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}

function responseFilename(url: URL, headers: Readonly<Record<string, string | undefined>>): string {
  const disposition = normalizedHeader(headers, "content-disposition")?.slice(0, 1_024);
  const dispositionName = disposition
    ? /filename\*?=(?:UTF-8''|["']?)([^"';]+)/iu.exec(disposition)?.[1]
    : undefined;
  const decodedDispositionName = dispositionName
    ? (() => {
        try {
          return decodeURIComponent(dispositionName);
        } catch {
          return dispositionName;
        }
      })()
    : undefined;
  const candidate = NodePath.basename(decodedDispositionName || url.pathname) || url.hostname;
  return candidate.replace(/[^A-Za-z0-9._ -]+/gu, "-").slice(0, 120) || "project-source";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("markdown")) return ".md";
  if (mimeType.includes("html")) return ".html";
  if (mimeType.includes("json")) return ".json";
  if (mimeType.includes("pdf")) return ".pdf";
  if (mimeType.includes("wordprocessingml")) return ".docx";
  if (mimeType.includes("msword")) return ".doc";
  if (mimeType.startsWith("text/")) return ".txt";
  return ".bin";
}

function ensureFilenameExtension(filename: string, mimeType: string): string {
  return NodePath.extname(filename) ? filename : `${filename}${extensionForMimeType(mimeType)}`;
}

function defaultResolve(hostname: string): Promise<ReadonlyArray<ResolvedAddress>> {
  if (NodeNet.isIP(hostname) === 4) return Promise.resolve([{ address: hostname, family: 4 }]);
  if (NodeNet.isIP(hostname) === 6) return Promise.resolve([{ address: hostname, family: 6 }]);
  return NodeDnsPromises.lookup(hostname, { all: true, verbatim: true }).then((addresses) =>
    addresses.flatMap((entry) =>
      entry.family === 4 || entry.family === 6
        ? [{ address: entry.address, family: entry.family } as ResolvedAddress]
        : [],
    ),
  );
}

function defaultRequest(
  url: URL,
  address: ResolvedAddress,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<ProjectSourceResponse> {
  return new Promise((resolve, reject) => {
    const accept =
      url.hostname === "api.github.com"
        ? "application/vnd.github.raw+json,application/json;q=0.9"
        : "text/markdown,text/plain,text/html,application/json,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const options: NodeHttps.RequestOptions = {
      protocol: "https:",
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      signal,
      headers: {
        Accept: accept,
        "Accept-Encoding": "identity",
        "User-Agent": "Jarvis-Cockpit-Project-Importer/1.0",
      },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    };
    const request = NodeHttps.request(options, (response) => {
      const status = response.statusCode ?? 0;
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(response.headers)) {
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }
      if ([301, 302, 303, 307, 308].includes(status) || status < 200 || status >= 300) {
        response.resume();
        resolve({ status, headers, body: new Uint8Array() });
        return;
      }
      const encoding = (headers["content-encoding"] ?? "identity").toLowerCase();
      if (encoding !== "identity") {
        response.destroy(new Error("Compressed project sources are not accepted."));
        return;
      }
      const mimeType = (headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        response.destroy(
          new Error(`Unsupported project source type: ${mimeType || "missing content type"}.`),
        );
        return;
      }
      const contentLength = Number(headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        response.destroy(new Error("The remote document is larger than 20 MB."));
        return;
      }
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          response.destroy(new Error("The remote document is larger than 20 MB."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.setTimeout(10_000, () => {
      request.destroy(new Error("The remote document did not respond in time."));
    });
    request.on("error", reject);
    request.end();
  });
}

const DEFAULT_DEPENDENCIES: ProjectSourceImportDependencies = {
  resolve: defaultResolve,
  request: defaultRequest,
};

function sha256(value: Uint8Array | string): string {
  return NodeCrypto.createHash("sha256").update(value).digest("hex");
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return named[lower] ?? match;
  });
}

function htmlTitle(html: string): string | null {
  const socialTitle =
    /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["'][^>]*>/iu.exec(
      html,
    )?.[1] ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/iu.exec(
      html,
    )?.[1];
  const title = socialTitle ?? /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1];
  return title
    ? decodeHtmlEntities(title.replace(/<[^>]+>/gu, " "))
        .replace(/\s+/gu, " ")
        .trim()
    : null;
}

function htmlToReadableText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--([\s\S]*?)-->/gu, " ")
      .replace(/<(script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/giu, " ")
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/h[1-6]|\/tr)>/giu, "\n")
      .replace(/<li[^>]*>/giu, "- ")
      .replace(/<[^>]+>/gu, " "),
  )
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function jsonSourceToMarkdown(
  body: Uint8Array,
  provider: ProjectSourceProvider,
): { title?: string; body: string } {
  const raw = Buffer.from(body).toString("utf8");
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (provider === "x") {
      const html = typeof value.html === "string" ? value.html : "";
      const title = typeof value.author_name === "string" ? `Post by ${value.author_name}` : null;
      return { ...(title ? { title } : {}), body: htmlToReadableText(html) };
    }
    if (provider === "github") {
      const title = typeof value.title === "string" ? value.title : undefined;
      const content = typeof value.body === "string" ? value.body : raw;
      const author =
        typeof value.user === "object" && value.user !== null && "login" in value.user
          ? String(value.user.login)
          : null;
      return {
        ...(title ? { title } : {}),
        body: [author ? `Author: ${author}` : "", content].filter(Boolean).join("\n\n"),
      };
    }
  } catch {
    // Preserve valid text even when a provider responds with non-JSON content.
  }
  return { body: raw };
}

function provenanceHeader(input: {
  readonly title: string;
  readonly provider: ProjectSourceProvider;
  readonly canonicalUrl: string;
  readonly fetchedAt: string;
}): string {
  return [
    `# ${input.title}`,
    "",
    `Source: ${input.canonicalUrl}`,
    `Provider: ${input.provider}`,
    `Fetched: ${input.fetchedAt}`,
    "",
    "---",
    "",
  ].join("\n");
}

function normalizeFetchedContent(input: {
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly provider: ProjectSourceProvider;
  readonly canonicalUrl: string;
  readonly fetchedAt: string;
  readonly requestedTitle?: string;
  readonly fallbackTitle: string;
}): {
  readonly body: Uint8Array;
  readonly mimeType: string;
  readonly title: string;
  readonly extension: string;
} {
  if (input.mimeType === "application/pdf" || input.mimeType.includes("word")) {
    return {
      body: input.body,
      mimeType: input.mimeType,
      title: input.requestedTitle?.trim() || input.fallbackTitle,
      extension: extensionForMimeType(input.mimeType),
    };
  }
  const raw = Buffer.from(input.body).toString("utf8");
  const json = input.mimeType.includes("json")
    ? jsonSourceToMarkdown(input.body, input.provider)
    : null;
  const inferredTitle = input.mimeType.includes("html") ? htmlTitle(raw) : null;
  const title = input.requestedTitle?.trim() || json?.title || inferredTitle || input.fallbackTitle;
  const content = json?.body ?? (input.mimeType.includes("html") ? htmlToReadableText(raw) : raw);
  const markdown = `${provenanceHeader({
    title,
    provider: input.provider,
    canonicalUrl: input.canonicalUrl,
    fetchedAt: input.fetchedAt,
  })}${content.trim()}\n`;
  return {
    body: Buffer.from(markdown, "utf8"),
    mimeType: "text/markdown",
    title,
    extension: ".md",
  };
}

async function requestFromAnyAddress(
  url: URL,
  addresses: ReadonlyArray<ResolvedAddress>,
  dependencies: ProjectSourceImportDependencies,
  signal: AbortSignal,
): Promise<ProjectSourceResponse> {
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await dependencies.request(url, address, PROJECT_SOURCE_IMPORT_MAX_BYTES, signal);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The remote source could not be reached.");
}

export async function importProjectSourceFromUrl(
  input: { readonly url: string; readonly title?: string | undefined },
  dependencies: ProjectSourceImportDependencies = DEFAULT_DEPENDENCIES,
  externalSignal?: AbortSignal,
): Promise<ProjectSourceImportResult> {
  const requestedUrl = parseProjectSourceUrl(input.url).toString();
  const canonicalUrl = canonicalProjectSourceUrl(requestedUrl);
  const provider = projectSourceProvider(canonicalUrl);
  let currentUrl = providerFetchUrl(canonicalUrl, provider);
  const timeoutSignal = AbortSignal.timeout(PROJECT_SOURCE_IMPORT_TIMEOUT_MS);
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
  for (
    let redirectCount = 0;
    redirectCount <= PROJECT_SOURCE_IMPORT_MAX_REDIRECTS;
    redirectCount += 1
  ) {
    if (signal.aborted) throw signal.reason;
    const addresses = await resolvePublicAddresses(currentUrl.hostname, dependencies);
    const response = await requestFromAnyAddress(currentUrl, addresses, dependencies, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = normalizedHeader(response.headers, "location");
      if (!location) throw new Error("The remote source returned an invalid redirect.");
      if (redirectCount === PROJECT_SOURCE_IMPORT_MAX_REDIRECTS) {
        throw new Error("The remote source redirected too many times.");
      }
      currentUrl = parseProjectSourceUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`The remote source returned HTTP ${response.status}.`);
    }
    if (response.body.byteLength === 0)
      throw new Error("The remote source returned an empty document.");
    const mimeType = (normalizedHeader(response.headers, "content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported project source type: ${mimeType || "missing content type"}.`);
    }
    const fetchedAt = dependencies.now?.() ?? DateTime.formatIso(DateTime.nowUnsafe());
    const fallbackFilename = responseFilename(new URL(canonicalUrl), response.headers);
    const fallbackTitle =
      NodePath.basename(fallbackFilename, NodePath.extname(fallbackFilename)).trim() ||
      new URL(canonicalUrl).hostname;
    const normalized = normalizeFetchedContent({
      body: response.body,
      mimeType,
      provider,
      canonicalUrl,
      fetchedAt,
      ...(input.title ? { requestedTitle: input.title } : {}),
      fallbackTitle,
    });
    const contentSha256 = sha256(normalized.body);
    const sourceIdentity = sha256(canonicalUrl);
    const docId = `src-${sourceIdentity.slice(0, 16)}-${contentSha256.slice(0, 12)}`;
    const filenameBase = fallbackFilename.replace(/\.[^.]+$/u, "") || provider;
    return {
      filename: ensureFilenameExtension(filenameBase, normalized.mimeType).replace(
        /\.[^.]+$/u,
        normalized.extension,
      ),
      contentBase64: Buffer.from(normalized.body).toString("base64"),
      mimeType: normalized.mimeType,
      title: normalized.title,
      provider,
      requestedUrl,
      canonicalUrl,
      finalUrl: currentUrl.toString(),
      fetchedAt,
      contentSha256,
      sourceIdentity,
      docId,
    };
  }
  throw new Error("The remote source redirected too many times.");
}
