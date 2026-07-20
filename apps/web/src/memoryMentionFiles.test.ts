import { describe, expect, it } from "vite-plus/test";
import type { JarvisProjectFile } from "@t3tools/contracts";

import {
  projectFileMentionLabel,
  projectFileMentionText,
  searchMemoryMentionFiles,
} from "./memoryMentionFiles";

const file = (input: Partial<JarvisProjectFile> & { readonly doc_id: string }) =>
  ({
    retracted: false,
    ingestion: {},
    metadata: {},
    ...input,
    doc_id: input.doc_id as JarvisProjectFile["doc_id"],
  }) as JarvisProjectFile;

describe("memory mention files", () => {
  it("serializes filenames without whitespace as plain @filename mentions", () => {
    const item = file({ doc_id: "doc-spec", filename: "spec.md" });

    expect(projectFileMentionLabel(item)).toBe("spec.md");
    expect(projectFileMentionText(item)).toBe("@spec.md");
  });

  it("serializes filenames with whitespace as @memory doc id mentions", () => {
    const item = file({ doc_id: "doc-roadmap", filename: "Launch Plan.md" });

    expect(projectFileMentionText(item)).toBe("@memory:doc-roadmap");
  });

  it("uses tolerant display fields and filters out retracted files", () => {
    const results = searchMemoryMentionFiles(
      [
        file({ doc_id: "doc-a", name: "api-notes.md" }),
        file({ doc_id: "doc-b", label: "Operations Runbook" }),
        file({ doc_id: "doc-c", filename: "old.md", retracted: true }),
      ],
      "notes",
    );

    expect(results).toEqual([
      {
        docId: "doc-a",
        label: "api-notes.md",
        description: "doc-a",
        mentionText: "@api-notes.md",
      },
    ]);
  });
});
