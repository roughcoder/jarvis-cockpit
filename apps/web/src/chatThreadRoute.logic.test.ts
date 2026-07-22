import { describe, expect, it } from "vite-plus/test";

import { missingChatThreadRouteState } from "./chatThreadRoute.logic";

describe("missingChatThreadRouteState", () => {
  it("waits for bootstrap and keeps available conversations on the route", () => {
    expect(
      missingChatThreadRouteState({
        bootstrapComplete: false,
        routeThreadExists: false,
        jarvisThreadId: false,
        environmentHasAnyThreads: false,
      }),
    ).toBe("pending");
    expect(
      missingChatThreadRouteState({
        bootstrapComplete: true,
        routeThreadExists: true,
        jarvisThreadId: false,
        environmentHasAnyThreads: true,
      }),
    ).toBe("available");
  });

  it("keeps projected Jarvis children terminally unavailable until they are published", () => {
    expect(
      missingChatThreadRouteState({
        bootstrapComplete: true,
        routeThreadExists: false,
        jarvisThreadId: true,
        environmentHasAnyThreads: true,
      }),
    ).toBe("jarvis-unavailable");
  });

  it("redirects stale ordinary links when alternatives exist and otherwise reports not found", () => {
    expect(
      missingChatThreadRouteState({
        bootstrapComplete: true,
        routeThreadExists: false,
        jarvisThreadId: false,
        environmentHasAnyThreads: true,
      }),
    ).toBe("redirect-home");
    expect(
      missingChatThreadRouteState({
        bootstrapComplete: true,
        routeThreadExists: false,
        jarvisThreadId: false,
        environmentHasAnyThreads: false,
      }),
    ).toBe("not-found");
  });
});
