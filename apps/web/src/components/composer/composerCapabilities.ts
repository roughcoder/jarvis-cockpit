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

/**
 * Which context strip renders above the input box.
 *
 * - `jarvis-routing`: native draft surface — pick the project/repo/worker a new
 *   session will start on.
 * - `brain-workspace`: project ("brain") conversation — attach repos and pick the
 *   engine, plus live worker/worktree status once a workspace is provisioned.
 *
 * The two are mutually exclusive, so they are one mode rather than two booleans.
 */
export type ComposerContextStripMode = "jarvis-routing" | "brain-workspace" | null;

/**
 * Which control fills the footer's picker slot (bottom-right, before send).
 *
 * - `provider-model`: native provider/model + effort picker.
 * - `workspace-engine`: jarvis engine picker (Codex/Claude), rendered in the same
 *   compact style so both surfaces read identically.
 */
export type ComposerPickerMode = "provider-model" | "workspace-engine" | null;

export interface ComposerCapabilities {
  readonly attachments: ComposerAttachmentCapability | null;
  readonly picker: ComposerPickerMode;
  readonly approvalControl: boolean;
  readonly interactionControl: boolean;
  readonly mentions: boolean;
  readonly slashCommands: boolean;
  readonly contextStrip: ComposerContextStripMode;
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
    picker: "provider-model",
    approvalControl: true,
    interactionControl: true,
    mentions: true,
    slashCommands: true,
    contextStrip: (input?.jarvisRouting ?? true) ? "jarvis-routing" : null,
    enterToSend: true,
  };
}

export function threadComposerCapabilities(): ComposerCapabilities {
  return {
    ...draftComposerCapabilities(),
    picker: null,
    contextStrip: null,
  };
}

export function projectConversationCapabilities(input: {
  readonly catalog: ProjectConversationAttachmentCatalogInput | null | undefined;
  readonly engine: string | null | undefined;
  /**
   * True once the conversation has a provisioned workspace. File mentions only
   * resolve against a checked-out worktree, so a planning-only brain thread has
   * nothing to tag and the trigger stays off until repos are attached.
   */
  readonly hasWorkspace?: boolean;
}): ComposerCapabilities {
  return {
    attachments: projectConversationSupportsImageAttachments(input)
      ? PROJECT_CONVERSATION_IMAGE_ATTACHMENT_CAPABILITY
      : null,
    picker: "workspace-engine",
    approvalControl: false,
    interactionControl: false,
    mentions: input.hasWorkspace === true,
    slashCommands: true,
    contextStrip: "brain-workspace",
    enterToSend: true,
  };
}
