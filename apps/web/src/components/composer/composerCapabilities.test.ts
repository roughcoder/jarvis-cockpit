import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES,
  PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
} from "../projectConversationComposer.logic";
import {
  draftComposerCapabilities,
  projectConversationCapabilities,
  threadComposerCapabilities,
} from "./composerCapabilities";

describe("composer capabilities", () => {
  it("builds draft composer capabilities with the full feature set", () => {
    expect(draftComposerCapabilities()).toEqual({
      attachments: {
        maxCount: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
        maxDecodedBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        mimeTypes: ["image/*"],
      },
      engineControl: true,
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      jarvisRouting: true,
      enterToSend: true,
    });
  });

  it("allows draft Jarvis routing to be disabled by caller context", () => {
    expect(draftComposerCapabilities({ jarvisRouting: false }).jarvisRouting).toBe(false);
  });

  it("builds running-thread composer capabilities with fixed routing and engine", () => {
    expect(threadComposerCapabilities()).toEqual({
      attachments: {
        maxCount: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
        maxDecodedBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        mimeTypes: ["image/*"],
      },
      engineControl: false,
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      jarvisRouting: false,
      enterToSend: true,
    });
  });

  it("builds project-conversation capabilities from the existing attachment gate", () => {
    const catalog = {
      engines: [
        { engine: "codex", supports: { attachments: true } },
        { engine: "claude", supports: { attachments: false } },
      ],
    };

    expect(projectConversationCapabilities({ catalog, engine: "codex" })).toEqual({
      attachments: {
        maxCount: PROJECT_TURN_ATTACHMENT_MAX_COUNT,
        maxDecodedBytes: PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
        mimeTypes: PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES,
      },
      engineControl: false,
      approvalControl: false,
      interactionControl: false,
      mentions: false,
      slashCommands: false,
      jarvisRouting: false,
      enterToSend: true,
    });
    expect(projectConversationCapabilities({ catalog, engine: "claude" }).attachments).toBe(null);
  });
});
