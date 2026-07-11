// Lightweight fixture kept intentionally small for live two-model review dogfooding.
export interface InlineReviewComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export function normalizeInlineReviewLine(line: number): number {
  if (!Number.isFinite(line)) return 0;
  return Math.max(0, Math.floor(line));
}

export function dedupeInlineReviewComments(
  comments: ReadonlyArray<InlineReviewComment>,
): ReadonlyArray<InlineReviewComment> {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = `${comment.path}:${comment.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
