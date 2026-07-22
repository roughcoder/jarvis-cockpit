export type MissingChatThreadRouteState =
  | "pending"
  | "available"
  | "jarvis-unavailable"
  | "redirect-home"
  | "not-found";

export function missingChatThreadRouteState(input: {
  readonly bootstrapComplete: boolean;
  readonly routeThreadExists: boolean;
  readonly jarvisThreadId: boolean;
  readonly environmentHasAnyThreads: boolean;
}): MissingChatThreadRouteState {
  if (!input.bootstrapComplete) return "pending";
  if (input.routeThreadExists) return "available";
  if (input.jarvisThreadId) return "jarvis-unavailable";
  return input.environmentHasAnyThreads ? "redirect-home" : "not-found";
}
