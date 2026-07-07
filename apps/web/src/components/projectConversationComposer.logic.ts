import type { JarvisTurnAttachment, JarvisTurnAttachmentMimeType } from "@t3tools/contracts";

export const PROJECT_TURN_ATTACHMENT_MAX_COUNT = 4;
export const PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES = 5 * 1024 * 1024;

export const PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const satisfies ReadonlyArray<JarvisTurnAttachmentMimeType>;

const IMAGE_MIME_TYPE_SET = new Set<string>(PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES);
const DATA_URL_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]*)$/u;

export interface ProjectConversationAttachmentLimits {
  readonly maxCount: number;
  readonly maxDecodedBytes: number;
}

export interface ProjectConversationAttachmentValidationInput {
  readonly name: string;
  readonly mimeType: string;
  readonly decodedBytes: number;
}

export interface ProjectConversationAttachmentCatalogInput {
  readonly engines?: ReadonlyArray<{
    readonly engine: string;
    readonly supports?: {
      readonly attachments?: boolean;
    };
  }>;
}

export type ProjectConversationAttachmentValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export const DEFAULT_PROJECT_CONVERSATION_ATTACHMENT_LIMITS: ProjectConversationAttachmentLimits = {
  maxCount: PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  maxDecodedBytes: PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
};

export function isProjectTurnImageMimeType(
  mimeType: string,
): mimeType is JarvisTurnAttachmentMimeType {
  return IMAGE_MIME_TYPE_SET.has(mimeType);
}

export function validateProjectTurnAttachmentCount(
  existingCount: number,
  incomingCount: number,
  limits: ProjectConversationAttachmentLimits = DEFAULT_PROJECT_CONVERSATION_ATTACHMENT_LIMITS,
): ProjectConversationAttachmentValidationResult {
  if (existingCount + incomingCount > limits.maxCount) {
    return {
      ok: false,
      message: `Attach up to ${limits.maxCount} images per turn.`,
    };
  }
  return { ok: true };
}

export function validateProjectTurnImageAttachment(
  input: ProjectConversationAttachmentValidationInput,
  limits: ProjectConversationAttachmentLimits = DEFAULT_PROJECT_CONVERSATION_ATTACHMENT_LIMITS,
): ProjectConversationAttachmentValidationResult {
  if (!isProjectTurnImageMimeType(input.mimeType)) {
    return {
      ok: false,
      message: "Attach PNG, JPEG, WEBP, or GIF images.",
    };
  }
  if (input.decodedBytes > limits.maxDecodedBytes) {
    return {
      ok: false,
      message: `${input.name || "Image"} is larger than ${formatAttachmentBytes(
        limits.maxDecodedBytes,
      )}.`,
    };
  }
  return { ok: true };
}

export function buildProjectTurnImageAttachmentDataUrl(
  mimeType: JarvisTurnAttachmentMimeType,
  base64Data: string,
): string {
  return `data:${mimeType};base64,${base64Data}`;
}

export function decodedBytesFromProjectTurnAttachmentDataUrl(dataUrl: string): number | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (match === null) {
    return null;
  }
  const base64Data = match[2]?.replace(/\s/g, "") ?? "";
  if (base64Data.length === 0) {
    return 0;
  }
  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

export function buildProjectTurnImageAttachment(input: {
  readonly name: string;
  readonly mimeType: JarvisTurnAttachmentMimeType;
  readonly base64Data: string;
}): JarvisTurnAttachment {
  return {
    kind: "image",
    mime_type: input.mimeType,
    name: input.name.trim() || "image",
    data_url: buildProjectTurnImageAttachmentDataUrl(input.mimeType, input.base64Data),
  };
}

export function projectConversationSupportsImageAttachments(input: {
  readonly catalog: ProjectConversationAttachmentCatalogInput | null | undefined;
  readonly engine: string | null | undefined;
}): boolean {
  const engine = input.engine?.trim().toLowerCase();
  if (!engine) {
    return false;
  }
  return (
    input.catalog?.engines?.some(
      (candidate) =>
        candidate.engine.trim().toLowerCase() === engine &&
        candidate.supports?.attachments === true,
    ) ?? false
  );
}

export function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${Math.round(kib)} KiB`;
  }
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
}
