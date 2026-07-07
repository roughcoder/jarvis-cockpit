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

export interface ProjectConversationComposerImageInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface ProjectConversationComposerPersistedImageInput {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
}

export type ProjectConversationTurnAttachmentsResult =
  | { readonly ok: true; readonly attachments: JarvisTurnAttachment[] }
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

export function buildProjectConversationTurnAttachments(input: {
  readonly images: ReadonlyArray<ProjectConversationComposerImageInput>;
  readonly persistedImages: ReadonlyArray<ProjectConversationComposerPersistedImageInput>;
  readonly limits?: ProjectConversationAttachmentLimits;
}): ProjectConversationTurnAttachmentsResult {
  const limits = input.limits ?? DEFAULT_PROJECT_CONVERSATION_ATTACHMENT_LIMITS;
  const countValidation = validateProjectTurnAttachmentCount(0, input.images.length, limits);
  if (!countValidation.ok) {
    return countValidation;
  }

  const persistedById = new Map(
    input.persistedImages.map((attachment) => [attachment.id, attachment]),
  );
  const attachments: JarvisTurnAttachment[] = [];
  for (const image of input.images) {
    const persisted = persistedById.get(image.id);
    if (!persisted) {
      return {
        ok: false,
        message: `${image.name || "Image"} could not be prepared for sending.`,
      };
    }

    const decodedBytes = decodedBytesFromProjectTurnAttachmentDataUrl(persisted.dataUrl);
    if (decodedBytes === null) {
      return {
        ok: false,
        message: `${persisted.name || image.name || "Image"} could not be encoded as a data URL.`,
      };
    }

    const mimeType = persisted.mimeType || image.mimeType;
    const imageValidation = validateProjectTurnImageAttachment(
      {
        name: persisted.name || image.name,
        mimeType,
        decodedBytes,
      },
      limits,
    );
    if (!imageValidation.ok) {
      return imageValidation;
    }
    if (!isProjectTurnImageMimeType(mimeType)) {
      return {
        ok: false,
        message: "Attach PNG, JPEG, WEBP, or GIF images.",
      };
    }

    const commaIndex = persisted.dataUrl.indexOf(",");
    const base64Data = commaIndex === -1 ? "" : persisted.dataUrl.slice(commaIndex + 1);
    attachments.push(
      buildProjectTurnImageAttachment({
        name: persisted.name || image.name || "image",
        mimeType,
        base64Data,
      }),
    );
  }

  return { ok: true, attachments };
}

export function projectConversationSupportsImageAttachments(input: {
  readonly catalog: ProjectConversationAttachmentCatalogInput | null | undefined;
  readonly engine: string | null | undefined;
}): boolean {
  const engine = input.engine?.trim().toLowerCase();
  if (!engine) {
    return false;
  }
  // Project-thread conversations run on the brain (engine "jarvis"), which accepts image
  // attachments via the gateway vision model. The brain engine is not a worker-engine catalog
  // row, so it would never match below — treat it as supported for this lane.
  if (engine === "jarvis" || engine === "brain") {
    return true;
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
