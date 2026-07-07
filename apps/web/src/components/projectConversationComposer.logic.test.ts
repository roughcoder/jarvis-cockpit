import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectConversationTurnAttachments,
  buildProjectTurnImageAttachmentDataUrl,
  decodedBytesFromProjectTurnAttachmentDataUrl,
  PROJECT_TURN_ATTACHMENT_MAX_COUNT,
  PROJECT_TURN_ATTACHMENT_MAX_DECODED_BYTES,
  projectConversationSupportsImageAttachments,
  validateProjectTurnAttachmentCount,
  validateProjectTurnImageAttachment,
} from "./projectConversationComposer.logic";

describe("project conversation image attachments", () => {
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
