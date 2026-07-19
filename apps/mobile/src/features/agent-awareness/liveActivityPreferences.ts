import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ManagedRelay } from "@t3tools/client-runtime/relay";

import { savePreferencesPatch } from "../../lib/storage";
import { refreshAgentAwarenessRegistration } from "./remoteRegistration";

export class LiveActivityPreferenceSaveError extends Schema.TaggedErrorClass<LiveActivityPreferenceSaveError>()(
  "LiveActivityPreferenceSaveError",
  {
    enabled: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to save the Live Activity updates setting (enabled: ${this.enabled}).`;
  }
}

export function setLiveActivityUpdatesEnabled(input: {
  readonly enabled: boolean;
}): Effect.Effect<void, unknown, ManagedRelay.ManagedRelayClient> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () => savePreferencesPatch({ liveActivitiesEnabled: input.enabled }),
      catch: (cause) => new LiveActivityPreferenceSaveError({ enabled: input.enabled, cause }),
    });

    yield* refreshAgentAwarenessRegistration();
  });
}
