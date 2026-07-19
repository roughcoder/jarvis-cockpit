import { beforeEach, vi } from "vite-plus/test";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import * as Layer from "effect/Layer";

import { savePreferencesPatch } from "../../lib/storage";
import { setLiveActivityUpdatesEnabled } from "./liveActivityPreferences";
import { refreshAgentAwarenessRegistration } from "./remoteRegistration";

vi.mock("../../lib/storage", () => ({
  savePreferencesPatch: vi.fn(() => Promise.resolve()),
}));

vi.mock("./remoteRegistration", () => ({
  refreshAgentAwarenessRegistration: vi.fn(() => Effect.void),
}));

const testLayer = Layer.succeed(ManagedRelay.ManagedRelayClient, null as never);

describe("liveActivityPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.effect("pushes disabled Live Activity preferences to relay registrations", () =>
    Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({ enabled: false });

      expect(savePreferencesPatch).toHaveBeenCalledWith({ liveActivitiesEnabled: false });
      expect(refreshAgentAwarenessRegistration).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("pushes enabled Live Activity preferences to relay registrations", () =>
    Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({ enabled: true });

      expect(savePreferencesPatch).toHaveBeenCalledWith({ liveActivitiesEnabled: true });
      expect(refreshAgentAwarenessRegistration).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(testLayer)),
  );
});
