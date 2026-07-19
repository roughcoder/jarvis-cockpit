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
      picker: "provider-model",
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      contextStrip: "jarvis-routing",
      enterToSend: true,
    });
  });

  it("allows draft Jarvis routing to be disabled by caller context", () => {
    expect(draftComposerCapabilities({ jarvisRouting: false }).contextStrip).toBe(null);
  });

  it("builds running-thread composer capabilities with fixed routing and engine", () => {
    expect(threadComposerCapabilities()).toEqual({
      attachments: {
        maxCount: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
        maxDecodedBytes: PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        mimeTypes: ["image/*"],
      },
      picker: null,
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      contextStrip: null,
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
      picker: "workspace-engine",
      approvalControl: false,
      interactionControl: false,
      mentions: false,
      slashCommands: true,
      contextStrip: "brain-workspace",
      enterToSend: true,
    });
    expect(projectConversationCapabilities({ catalog, engine: "claude" }).attachments).toBe(null);
  });

  it("enables file mentions on project conversations only once a workspace exists", () => {
    const input = { catalog: null, engine: "codex" };

    expect(projectConversationCapabilities(input).mentions).toBe(false);
    expect(projectConversationCapabilities({ ...input, hasWorkspace: false }).mentions).toBe(false);
    expect(projectConversationCapabilities({ ...input, hasWorkspace: true }).mentions).toBe(true);
  });

  it("routes each surface to its own context strip and picker", () => {
    expect(draftComposerCapabilities().contextStrip).toBe("jarvis-routing");
    expect(draftComposerCapabilities().picker).toBe("provider-model");

    const project = projectConversationCapabilities({ catalog: null, engine: "codex" });
    expect(project.contextStrip).toBe("brain-workspace");
    expect(project.picker).toBe("workspace-engine");
  });
});
