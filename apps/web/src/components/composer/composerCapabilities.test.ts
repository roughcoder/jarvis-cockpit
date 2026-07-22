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
    expect(projectConversationCapabilities({ catalog, engine: "missing" }).attachments).toBe(null);
    expect(projectConversationCapabilities({ catalog, engine: null }).attachments).toBe(null);
    expect(projectConversationCapabilities({ catalog: null, engine: "brain" }).attachments).toEqual(
      {
        maxCount: PROJECT_TURN_ATTACHMENT_MAX_COUNT,
        maxDecodedBytes: PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
        mimeTypes: PROJECT_TURN_ATTACHMENT_IMAGE_MIME_TYPES,
      },
    );
  });

  it("enables file mentions on project conversations with a workspace or memory files", () => {
    const input = { catalog: null, engine: "codex" };

    expect(projectConversationCapabilities(input).mentions).toBe(false);
    expect(projectConversationCapabilities({ ...input, hasWorkspace: false }).mentions).toBe(false);
    expect(projectConversationCapabilities({ ...input, hasProjectFiles: true }).mentions).toBe(
      true,
    );
    expect(projectConversationCapabilities({ ...input, hasWorkspace: true }).mentions).toBe(true);
  });

  it("routes each surface to its own context strip and picker", () => {
    expect(draftComposerCapabilities().contextStrip).toBe("jarvis-routing");
    expect(draftComposerCapabilities().picker).toBe("provider-model");

    const project = projectConversationCapabilities({ catalog: null, engine: "codex" });
    expect(project.contextStrip).toBe("brain-workspace");
    expect(project.picker).toBe("workspace-engine");
  });

  it("keeps the existing control combinations distinct across composer surfaces", () => {
    expect(draftComposerCapabilities()).toMatchObject({
      picker: "provider-model",
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      contextStrip: "jarvis-routing",
      enterToSend: true,
    });
    expect(threadComposerCapabilities()).toMatchObject({
      picker: null,
      approvalControl: true,
      interactionControl: true,
      mentions: true,
      slashCommands: true,
      contextStrip: null,
      enterToSend: true,
    });
    expect(projectConversationCapabilities({ catalog: null, engine: "jarvis" })).toMatchObject({
      picker: "workspace-engine",
      approvalControl: false,
      interactionControl: false,
      mentions: false,
      slashCommands: true,
      contextStrip: "brain-workspace",
      enterToSend: true,
    });
  });

  it("combines project attachment and mention gates without coupling them", () => {
    const catalog = {
      engines: [
        { engine: "codex", supports: { attachments: true } },
        { engine: "claude", supports: { attachments: false } },
      ],
    };

    const attachedWithoutMentions = projectConversationCapabilities({
      catalog,
      engine: "codex",
      hasWorkspace: false,
      hasProjectFiles: false,
    });
    expect(attachedWithoutMentions.attachments).not.toBeNull();
    expect(attachedWithoutMentions.mentions).toBe(false);

    const mentionsWithoutAttachments = projectConversationCapabilities({
      catalog,
      engine: "claude",
      hasWorkspace: true,
      hasProjectFiles: false,
    });
    expect(mentionsWithoutAttachments.attachments).toBeNull();
    expect(mentionsWithoutAttachments.mentions).toBe(true);

    const projectFilesBeforeWorkspace = projectConversationCapabilities({
      catalog: null,
      engine: "jarvis",
      hasWorkspace: false,
      hasProjectFiles: true,
    });
    expect(projectFilesBeforeWorkspace.attachments).not.toBeNull();
    expect(projectFilesBeforeWorkspace.mentions).toBe(true);
  });
});
