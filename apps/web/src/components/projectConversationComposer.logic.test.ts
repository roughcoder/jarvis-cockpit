import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectConversationTurnAttachments,
  buildProjectTurnImageAttachmentDataUrl,
  decodedBytesFromProjectTurnAttachmentDataUrl,
  isProjectConversationComposerDraftEmpty,
  PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
  projectConversationComposerMatchesSubmission,
  projectConversationSupportsImageAttachments,
  validateProjectTurnAttachmentCount,
  validateProjectTurnImageAttachment,
} from "./projectConversationComposer.logic";

describe("project conversation image attachments", () => {
  it("restores a failed submission only when the replacement draft is still empty", () => {
    expect(
      isProjectConversationComposerDraftEmpty({
        prompt: "",
        imageCount: 0,
        terminalContextCount: 0,
        elementContextCount: 0,
      }),
    ).toBe(true);
    expect(
      isProjectConversationComposerDraftEmpty({
        prompt: "new draft",
        imageCount: 0,
        terminalContextCount: 0,
        elementContextCount: 0,
      }),
    ).toBe(false);
    expect(
      isProjectConversationComposerDraftEmpty({
        prompt: "",
        imageCount: 1,
        terminalContextCount: 0,
        elementContextCount: 0,
      }),
    ).toBe(false);
  });

  it("clears a retried draft only when prompt, images, and contexts still match", () => {
    const matching = {
      draftPrompt: "Retry this",
      draftImageIds: ["image-1"],
      terminalContextCount: 0,
      elementContextCount: 0,
      submissionPrompt: "Retry this",
      submissionImageIds: ["image-1"],
    };
    expect(projectConversationComposerMatchesSubmission(matching)).toBe(true);
    expect(
      projectConversationComposerMatchesSubmission({
        ...matching,
        draftPrompt: "Replacement draft",
      }),
    ).toBe(false);
    expect(
      projectConversationComposerMatchesSubmission({
        ...matching,
        draftImageIds: ["image-2"],
      }),
    ).toBe(false);
    expect(
      projectConversationComposerMatchesSubmission({
        ...matching,
        terminalContextCount: 1,
      }),
    ).toBe(false);
  });

  it("accepts only the deployed image mime allow-list", () => {
    for (const mimeType of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(
        validateProjectTurnImageAttachment({
          name: "screen.png",
          mimeType,
          decodedBytes: 1024,
        }),
      ).toEqual({ ok: true });
    }

    expect(
      validateProjectTurnImageAttachment({
        name: "notes.txt",
        mimeType: "text/plain",
        decodedBytes: 128,
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects more than four images per turn", () => {
    expect(validateProjectTurnAttachmentCount(3, 1)).toEqual({ ok: true });
    expect(validateProjectTurnAttachmentCount(3, 2)).toEqual({
      ok: false,
      message: `Attach up to ${PROJECT_TURN_ATTACHMENT_MAX_COUNT} images per turn.`,
    });
  });

  it("rejects images larger than five decoded MiB", () => {
    expect(
      validateProjectTurnImageAttachment({
        name: "large.png",
        mimeType: "image/png",
        decodedBytes: PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES + 1,
      }),
    ).toMatchObject({ ok: false });
  });

  it("builds data URLs and calculates decoded byte size", () => {
    const dataUrl = buildProjectTurnImageAttachmentDataUrl("image/png", "aGVsbG8=");

    expect(dataUrl).toBe("data:image/png;base64,aGVsbG8=");
    expect(decodedBytesFromProjectTurnAttachmentDataUrl(dataUrl)).toBe(5);
    expect(decodedBytesFromProjectTurnAttachmentDataUrl("https://example.test/image.png")).toBe(
      null,
    );
  });

  it("maps persisted composer image data URLs to Jarvis turn attachments", () => {
    const dataUrl = buildProjectTurnImageAttachmentDataUrl("image/png", "aGVsbG8=");

    expect(
      buildProjectConversationTurnAttachments({
        images: [
          {
            id: "image-1",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 5,
          },
        ],
        persistedImages: [
          {
            id: "image-1",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 5,
            dataUrl,
          },
        ],
      }),
    ).toEqual({
      ok: true,
      attachments: [
        {
          kind: "image",
          mime_type: "image/png",
          name: "screen.png",
          data_url: dataUrl,
        },
      ],
    });
  });

  it("rejects composer images without prepared data URLs", () => {
    expect(
      buildProjectConversationTurnAttachments({
        images: [
          {
            id: "image-1",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 5,
          },
        ],
        persistedImages: [],
      }),
    ).toEqual({
      ok: false,
      message: "screen.png could not be prepared for sending.",
    });
  });

  it("validates composer data URLs before building Jarvis attachments", () => {
    expect(
      buildProjectConversationTurnAttachments({
        images: [
          {
            id: "image-1",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
          },
        ],
        persistedImages: [
          {
            id: "image-1",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
            dataUrl: "data:text/plain;base64,aGVsbG8=",
          },
        ],
      }),
    ).toEqual({
      ok: false,
      message: "Attach PNG, JPEG, WEBP, or GIF images.",
    });
  });

  it("gates attachments on the selected engine catalog support flag", () => {
    const catalog = {
      engines: [
        {
          engine: "codex",
          supports: { attachments: true },
        },
        {
          engine: "claude",
          supports: { attachments: false },
        },
      ],
    };

    expect(projectConversationSupportsImageAttachments({ catalog, engine: "codex" })).toBe(true);
    expect(projectConversationSupportsImageAttachments({ catalog, engine: "claude" })).toBe(false);
    expect(projectConversationSupportsImageAttachments({ catalog, engine: "missing" })).toBe(false);
    expect(projectConversationSupportsImageAttachments({ catalog: null, engine: "codex" })).toBe(
      false,
    );
  });

  it("treats the brain (jarvis) engine as supporting attachments without a catalog row", () => {
    expect(projectConversationSupportsImageAttachments({ catalog: null, engine: "jarvis" })).toBe(
      true,
    );
    expect(projectConversationSupportsImageAttachments({ catalog: null, engine: "brain" })).toBe(
      true,
    );
  });
});
