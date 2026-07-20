import type { JarvisProjectFile } from "@t3tools/contracts";

export interface MemoryMentionFile {
  readonly docId: string;
  readonly label: string;
  readonly description: string;
  readonly mentionText: string;
}

const MEMORY_MENTION_LIMIT = 24;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function projectFileMentionLabel(file: JarvisProjectFile): string {
  return (
    clean(file.filename) ??
    clean(file.title) ??
    clean(file.name) ??
    clean(file.label) ??
    String(file.doc_id)
  );
}

export function projectFileMentionText(file: JarvisProjectFile): string {
  const label = projectFileMentionLabel(file);
  return /\s/u.test(label) ? `@memory:${String(file.doc_id)}` : `@${label}`;
}

export function projectFileMentionDescription(file: JarvisProjectFile): string {
  return clean(file.original_path) ?? clean(file.title) ?? String(file.doc_id);
}

export function searchMemoryMentionFiles(
  files: ReadonlyArray<JarvisProjectFile>,
  query: string,
  options: { readonly filter?: boolean } = {},
): MemoryMentionFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  const shouldFilter = options.filter ?? true;
  const results: MemoryMentionFile[] = [];

  for (const file of files) {
    if (file.retracted === true) {
      continue;
    }
    const label = projectFileMentionLabel(file);
    const description = projectFileMentionDescription(file);
    const searchText = [
      label,
      description,
      file.doc_id,
      file.filename,
      file.name,
      file.label,
      file.title,
      file.original_path,
    ]
      .flatMap((value) => (typeof value === "string" ? [value] : []))
      .join("\n")
      .toLowerCase();

    if (shouldFilter && normalizedQuery.length > 0 && !searchText.includes(normalizedQuery)) {
      continue;
    }

    results.push({
      docId: String(file.doc_id),
      label,
      description,
      mentionText: projectFileMentionText(file),
    });

    if (results.length >= MEMORY_MENTION_LIMIT) {
      break;
    }
  }

  return results;
}
