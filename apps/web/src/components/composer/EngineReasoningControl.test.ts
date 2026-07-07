import { describe, expect, it } from "vite-plus/test";

import { resolveComposerJarvisEngineSelection } from "./EngineReasoningControl";

describe("resolveComposerJarvisEngineSelection", () => {
  const engines = [{ engine: "codex" }, { engine: "claude" }, { engine: "gpt" }];

  it("defaults to the first available engine", () => {
    expect(
      resolveComposerJarvisEngineSelection({
        engines,
        previousEngine: null,
      }),
    ).toBe("codex");
  });

  it("preserves a previous engine selection while it is still available", () => {
    expect(
      resolveComposerJarvisEngineSelection({
        engines,
        previousEngine: "CLAUDE",
      }),
    ).toBe("claude");
  });

  it("falls back when the previous engine disappears", () => {
    expect(
      resolveComposerJarvisEngineSelection({
        engines,
        previousEngine: "missing",
      }),
    ).toBe("codex");
  });

  it("returns null when the catalog is empty", () => {
    expect(
      resolveComposerJarvisEngineSelection({
        engines: [],
        previousEngine: "codex",
      }),
    ).toBeNull();
  });
});
