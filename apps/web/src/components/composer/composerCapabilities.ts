import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";

import {
  PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES,
  PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
  type ProjectConversationAttachmentCatalogInput,
  projectConversationSupportsImageAttachments,
} from "../projectConversationComposer.logic";

export interface ComposerAttachmentCapability {
  readonly maxCount: number;
  readonly maxDecodedBytes: number;
  readonly mimeTypes: ReadonlyArray<string>;
}

export interface ComposerCapabilities {
  readonly attachments: ComposerAttachmentCapability | null;
  readonly engineControl: boolean;
  readonly approvalControl: boolean;
  readonly interactionControl: boolean;
  readonly mentions: boolean;
  readonly slashCommands: boolean;
  readonly jarvisRouting: boolean;
  readonly enterToSend: boolean;
}

const PROVIDER_IMAGE_ATTACHMENT_CAPABILITY: ComposerAttachmentCapability = {
  maxCount: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  maxDecodedBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  mimeTypes: ["image/*"],
};

const PROJECT_CONVERSATION_IMAGE_ATTACHMENT_CAPABILITY: ComposerAttachmentCapability = {
  maxCount: PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  maxDecodedBytes: PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
  mimeTypes: PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES,
};

export function draftComposerCapabilities(input?: {
  readonly jarvisRouting?: boolean;
}): ComposerCapabilities {
  return {
    attachments: PROVIDER_IMAGE_ATTACHMENT_CAPABILITY,
    engineControl: true,
    approvalControl: true,
    interactionControl: true,
    mentions: true,
    slashCommands: true,
    jarvisRouting: input?.jarvisRouting ?? true,
    enterToSend: true,
  };
}

export function threadComposerCapabilities(): ComposerCapabilities {
  return {
    ...draftComposerCapabilities(),
    engineControl: false,
    jarvisRouting: false,
  };
}

export function projectConversationCapabilities(input: {
  readonly catalog: ProjectConversationAttachmentCatalogInput | null | undefined;
  readonly engine: string | null | undefined;
}): ComposerCapabilities {
  return {
    attachments: projectConversationSupportsImageAttachments(input)
      ? PROJECT_CONVERSATION_IMAGE_ATTACHMENT_CAPABILITY
      : null,
    engineControl: false,
    approvalControl: false,
    interactionControl: false,
    mentions: false,
    slashCommands: false,
    jarvisRouting: false,
    enterToSend: true,
  };
}
