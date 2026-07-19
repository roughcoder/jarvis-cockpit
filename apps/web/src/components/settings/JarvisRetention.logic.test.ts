import { describe, expect, it } from "vite-plus/test";

import {
  formatRetentionInterval,
  formatRetentionPruneResult,
  formatRetentionTotal,
  orderedRetentionClasses,
  retentionSourceLabel,
} from "./JarvisRetention.logic";

describe("JarvisRetention logic", () => {
  it("orders retention classes and falls back to settings for missing rows", () => {
    expect(
      orderedRetentionClasses({
        settings: {
          enabled: true,
          interval_s: 21_600,
          archived_ttl_days: 14,
          chat_ttl_days: 7,
          tree_ttl_days: 0,
        },
        plan: {
          classes: [
            { name: "tree", ttl_days: 0, count: 9, bytes: 999, disabled: true },
            { name: "archived", ttl_days: 14, count: 3, bytes: 24_576_000, disabled: false },
          ],
          total_count: 3,
          total_bytes: 24_576_000,
          kept: 42,
        },
      }).map((row) => ({
        id: row.id,
        ttlLabel: row.ttlLabel,
        count: row.count,
        bytesLabel: row.bytesLabel,
      })),
    ).toEqual([
      { id: "archived", ttlLabel: "14d TTL", count: 3, bytesLabel: "23.4 MB" },
      { id: "chat", ttlLabel: "7d TTL", count: 0, bytesLabel: "0 B" },
      { id: "tree", ttlLabel: "Disabled", count: 0, bytesLabel: "0 B" },
    ]);
  });

  it("formats summary, interval, result, and provenance labels", () => {
    expect(
      formatRetentionTotal({
        classes: [],
        total_count: 6,
        total_bytes: 40_009_728,
        kept: 42,
      }),
    ).toBe("Cleaning now would remove 6 conversations · 38.2 MB, keeping 42");
    expect(formatRetentionInterval(21_600)).toBe("6 hours");
    expect(
      formatRetentionPruneResult({
        ok: true,
        deleted: { archived: 3, chat: 2, tree: 1 },
        child_runs: 1,
        bytes_reclaimed: 40_009_728,
        kept: 42,
      }),
    ).toBe("Deleted 3 archived, 2 chats, 1 review tree; reclaimed 38.2 MB.");
    expect(retentionSourceLabel({ chat_ttl_days: "override" }, "chat_ttl_days")).toBe("custom");
    expect(retentionSourceLabel({ chat_ttl_days: "env" }, "chat_ttl_days")).toBe("default");
  });
});
