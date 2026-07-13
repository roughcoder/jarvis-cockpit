import { describe, expect, it } from "vite-plus/test";

import {
  canonicalProjectSourceUrl,
  importProjectSourceFromUrl,
  isPublicProjectSourceAddress,
  projectSourceProvider,
  type ProjectSourceImportDependencies,
} from "./projectSourceImport.js";

describe("isPublicProjectSourceAddress", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicProjectSourceAddress(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicProjectSourceAddress(address)).toBe(true);
    },
  );
});

function dependencies(
  responses: ReadonlyArray<{
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  }>,
  addresses: ReadonlyArray<{ readonly address: string; readonly family: 4 | 6 }> = [
    { address: "1.1.1.1", family: 4 },
  ],
) {
  const requested: string[] = [];
  let responseIndex = 0;
  const value: ProjectSourceImportDependencies = {
    resolve: async () => addresses,
    request: async (url) => {
      requested.push(url.toString());
      const response = responses[responseIndex++]!;
      return {
        status: response.status,
        headers: response.headers ?? {},
        body: Buffer.from(response.body ?? ""),
      };
    },
    now: () => "2026-07-13T12:00:00.000Z",
  };
  return { value, requested };
}

describe("importProjectSourceFromUrl", () => {
  it("uses source-aware GitHub fetching and normalizes text for Honcho", async () => {
    const fixture = dependencies([
      {
        status: 200,
        headers: { "content-type": "text/markdown; charset=utf-8" },
        body: "# Project brief",
      },
    ]);

    const result = await importProjectSourceFromUrl(
      { url: "https://github.com/example/project/blob/main/README.md", title: "README" },
      fixture.value,
    );
    expect(fixture.requested).toEqual([
      "https://raw.githubusercontent.com/example/project/main/README.md",
    ]);
    expect(result).toMatchObject({
      filename: "README.md",
      mimeType: "text/markdown",
      title: "README",
      provider: "github",
      requestedUrl: "https://github.com/example/project/blob/main/README.md",
      canonicalUrl: "https://github.com/example/project/blob/main/README.md",
      finalUrl: "https://raw.githubusercontent.com/example/project/main/README.md",
      fetchedAt: "2026-07-13T12:00:00.000Z",
    });
    expect(Buffer.from(result.contentBase64, "base64").toString("utf8")).toContain(
      "Source: https://github.com/example/project/blob/main/README.md",
    );
    expect(Buffer.from(result.contentBase64, "base64").toString("utf8")).toContain(
      "# Project brief",
    );
    expect(result.docId).toMatch(/^src-[a-f0-9]{16}-[a-f0-9]{12}$/u);
  });

  it("revalidates every redirect target", async () => {
    const fixture = dependencies([
      {
        status: 302,
        headers: { location: "https://raw.githubusercontent.com/example/project/main/README.md" },
      },
      { status: 200, headers: { "content-type": "text/plain" }, body: "hello" },
    ]);

    await importProjectSourceFromUrl({ url: "https://github.com/example/project" }, fixture.value);
    expect(fixture.requested).toEqual([
      "https://api.github.com/repos/example/project/readme",
      "https://raw.githubusercontent.com/example/project/main/README.md",
    ]);
  });

  it("rejects credentials, non-HTTPS URLs, and private DNS answers", async () => {
    const publicFixture = dependencies([]);
    await expect(
      importProjectSourceFromUrl({ url: "http://example.com/readme" }, publicFixture.value),
    ).rejects.toThrow("must use HTTPS");
    await expect(
      importProjectSourceFromUrl({ url: "https://example.com:8443/readme" }, publicFixture.value),
    ).rejects.toThrow("standard HTTPS port");
    await expect(
      importProjectSourceFromUrl(
        { url: "https://user:secret@example.com/readme" },
        publicFixture.value,
      ),
    ).rejects.toThrow("cannot contain credentials");

    const privateFixture = dependencies([], [{ address: "127.0.0.1", family: 4 }]);
    await expect(
      importProjectSourceFromUrl({ url: "https://example.com/readme" }, privateFixture.value),
    ).rejects.toThrow("public network addresses");
  });

  it("rejects empty and failed responses", async () => {
    await expect(
      importProjectSourceFromUrl(
        { url: "https://example.com/missing" },
        dependencies([{ status: 404 }]).value,
      ),
    ).rejects.toThrow("HTTP 404");
    await expect(
      importProjectSourceFromUrl(
        { url: "https://example.com/empty" },
        dependencies([{ status: 200 }]).value,
      ),
    ).rejects.toThrow("empty document");
  });

  it("uses X oEmbed and records the original post as the source", async () => {
    const fixture = dependencies([
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          author_name: "Ada",
          html: "<blockquote><p>Ship it.</p></blockquote>",
        }),
      },
    ]);
    const result = await importProjectSourceFromUrl(
      { url: "https://x.com/ada/status/123" },
      fixture.value,
    );
    expect(fixture.requested[0]).toContain("https://publish.twitter.com/oembed?");
    expect(result).toMatchObject({ provider: "x", title: "Post by Ada" });
    expect(Buffer.from(result.contentBase64, "base64").toString("utf8")).toContain("Ship it.");
  });

  it("rejects unsupported or missing content types", async () => {
    await expect(
      importProjectSourceFromUrl(
        { url: "https://example.com/image" },
        dependencies([{ status: 200, headers: { "content-type": "image/png" }, body: "png" }])
          .value,
      ),
    ).rejects.toThrow("Unsupported project source type");
  });
});

describe("project source identity", () => {
  it("normalizes fragments and default ports without changing query order", () => {
    expect(canonicalProjectSourceUrl("https://EXAMPLE.com:443/path?b=2&a=1#section")).toBe(
      "https://example.com/path?b=2&a=1",
    );
  });

  it("classifies providers by exact host instead of substring", () => {
    expect(projectSourceProvider("https://github.com/openai/codex")).toBe("github");
    expect(projectSourceProvider("https://github.com.evil.example/openai/codex")).toBe("web");
    expect(projectSourceProvider("https://workspace.notion.site/Brief-123")).toBe("notion");
    expect(projectSourceProvider("https://x.com/ada/status/123")).toBe("x");
  });
});
