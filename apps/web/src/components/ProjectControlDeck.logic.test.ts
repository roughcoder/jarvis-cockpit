import { describe, expect, it } from "vite-plus/test";

import {
  PROJECT_SOURCE_MAX_BYTES,
  buildProjectSourceFileUploadInput,
} from "./ProjectControlDeck.logic";

describe("project source intake", () => {
  it("builds binary Word uploads from a data URL", () => {
    expect(
      buildProjectSourceFileUploadInput({
        name: "Project brief.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 42,
        dataUrl: "data:application/octet-stream;base64,ZmFrZS13b3Jk",
      }),
    ).toEqual({
      ok: true,
      input: {
        filename: "Project brief.docx",
        content_base64: "ZmFrZS13b3Jk",
        title: "Project brief",
        artifact_type: "document",
        mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  });

  it("rejects unsupported and oversized files before upload", () => {
    expect(
      buildProjectSourceFileUploadInput({
        name: "archive.zip",
        type: "application/zip",
        size: 12,
        dataUrl: "data:application/zip;base64,ZmFrZQ==",
      }),
    ).toEqual({ ok: false, message: "Upload Word, Markdown, PDF, or plain-text documents." });
    expect(
      buildProjectSourceFileUploadInput({
        name: "brief.pdf",
        type: "application/pdf",
        size: PROJECT_SOURCE_MAX_BYTES + 1,
        dataUrl: "data:application/pdf;base64,ZmFrZQ==",
      }),
    ).toEqual({ ok: false, message: "brief.pdf is larger than 20 MB." });
  });
});
