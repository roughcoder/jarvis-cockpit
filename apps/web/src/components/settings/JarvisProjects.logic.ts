export function formatCommandFailure(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string") {
    const message = error.trim();
    if (/^(Jarvis request|HTTP \d{3}|missing authority:)/u.test(message)) {
      return message;
    }
  }
  return "The Jarvis brain request failed.";
}

export function formatProjectWriteFailure(error: unknown): string {
  const message = formatCommandFailure(error);
  if (/HTTP 403/u.test(message)) {
    return `Jarvis denied the project write${formatStatusDetail(message)}`;
  }
  if (/projects\.(create|update|archive|delete).*HTTP 405/u.test(message)) {
    return "This Jarvis brain does not expose project-management writes for this API version. Cockpit reached Jarvis, but the project route returned HTTP 405.";
  }
  if (message === "The Jarvis brain request failed.") {
    return "Cockpit could not complete the project write against this Jarvis brain. Check the brain connection, auth mode, and project permissions.";
  }
  return message;
}

export function formatProjectConversationFailure(error: unknown): string {
  const message = formatCommandFailure(error);
  if (/projects\.threads\.archive.*HTTP 404/u.test(message)) {
    return "This Jarvis brain does not expose project conversation archive yet. Cockpit reached Jarvis, but the conversation archive route returned HTTP 404.";
  }
  if (/HTTP 403/u.test(message)) {
    return `Jarvis denied the conversation action${formatStatusDetail(message)}`;
  }
  return message;
}

function formatStatusDetail(message: string): string {
  const detail = message.match(/HTTP 403:\s*(?<detail>.+)$/u)?.groups?.detail?.trim();
  return detail ? `: ${detail}` : ". Check the Jarvis project permissions for this operator.";
}
