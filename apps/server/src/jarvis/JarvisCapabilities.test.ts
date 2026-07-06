import { assert, describe, it } from "@effect/vitest";

import { classifyJarvisCapabilityProbe } from "./JarvisCapabilities.ts";

describe("classifyJarvisCapabilityProbe", () => {
  it("resolves available, missing, auth, and not-probed statuses", () => {
    assert.deepStrictEqual(classifyJarvisCapabilityProbe(200), {
      status: "available",
      detail: "Safe read returned successfully.",
    });
    assert.deepStrictEqual(classifyJarvisCapabilityProbe(404), {
      status: "missing",
      detail: "Jarvis returned HTTP 404 for this route.",
    });
    assert.deepStrictEqual(classifyJarvisCapabilityProbe(401), {
      status: "auth-error",
      detail: "Jarvis returned HTTP 401.",
    });
    assert.deepStrictEqual(classifyJarvisCapabilityProbe(500), {
      status: "not-probed",
      detail: "Safe read returned HTTP 500; capability was not inferred.",
    });
  });
});
