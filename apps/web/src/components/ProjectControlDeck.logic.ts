import type { JarvisProjectFileUploadInput } from "@t3tools/contracts";

export const PROJECT_SOURCE_MAX_BYTES = 20 * 1024 * 1024;

const PROJECT_SOURCE_MIME_TYPES = new Map([
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
]);

export interface ProjectSourceFileDraft {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly dataUrl: string;
}

export type ProjectSourceBuildResult =
  | { readonly ok: true; readonly input: JarvisProjectFileUploadInput }
  | { readonly ok: false; readonly message: string };

function fileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex + 1).toLowerCase();
}

function fileArtifactType(extension: string): string {
  if (extension === "doc" || extension === "docx") return "document";
  if (extension === "pdf") return "pdf";
  if (extension === "md" || extension === "markdown") return "markdown";
  return "note";
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function buildProjectSourceFileUploadInput(
  draft: ProjectSourceFileDraft,
): ProjectSourceBuildResult {
  const extension = fileExtension(draft.name);
  const fallbackMimeType = PROJECT_SOURCE_MIME_TYPES.get(extension);
  if (fallbackMimeType === undefined) {
    return {
      ok: false,
      message: "Upload Word, Markdown, PDF, or plain-text documents.",
    };
  }
  if (draft.size > PROJECT_SOURCE_MAX_BYTES) {
    return {
      ok: false,
      message: `${draft.name} is larger than ${formatBytes(PROJECT_SOURCE_MAX_BYTES)}.`,
    };
  }
  const commaIndex = draft.dataUrl.indexOf(",");
  const contentBase64 = commaIndex === -1 ? "" : draft.dataUrl.slice(commaIndex + 1);
  if (contentBase64.trim().length === 0) {
    return { ok: false, message: `${draft.name} could not be read.` };
  }
  const title = draft.name.replace(/\.[^.]+$/u, "").trim() || draft.name;
  return {
    ok: true,
    input: {
      filename: draft.name,
      content_base64: contentBase64,
      title,
      artifact_type: fileArtifactType(extension),
      mime_type: draft.type.trim() || fallbackMimeType,
    },
  };
}
