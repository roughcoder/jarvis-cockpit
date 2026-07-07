import { describe, expect, it } from "vite-plus/test";

import { formatJarvisReclamationToast, jarvisLifecycleActionCopy } from "./jarvisLifecycle.logic";

describe("jarvis lifecycle logic", () => {
  it("formats a delete reclamation summary for toast copy", () => {
    expect(
      formatJarvisReclamationToast({
        targetKind: "session",
        deleted: true,
        reclamation: {
          records: 1,
          events: 42,
          worktrees: 2,
          bytes: 5.3 * 1024 * 1024,
        },
      }),
    ).toBe("Deleted: 1 session, 42 events, 2 worktrees, 5.3 MiB reclaimed");
  });

  it("handles idempotent repeated deletes without claiming a new deletion", () => {
    expect(
      formatJarvisReclamationToast({
        targetKind: "run",
        deleted: false,
        reclamation: {
          records: 0,
          events: 0,
          worktrees: 0,
          bytes: 0,
        },
      }),
    ).toBe("Already deleted: 0 records, 0 events, 0 worktrees, 0 bytes reclaimed");
  });

  it("keeps archive hide copy distinct from delete reclaim copy", () => {
    const archive = jarvisLifecycleActionCopy({
      action: "archive",
      targetKind: "session",
      title: "Fix worker cleanup",
    });
    const deletion = jarvisLifecycleActionCopy({
      action: "delete",
      targetKind: "session",
      title: "Fix worker cleanup",
    });

    expect(archive.label).toBe("Archive");
    expect(archive.description).toContain("hides");
    expect(archive.description).toContain("kept");
    expect(deletion.label).toBe("Delete");
    expect(deletion.description).toContain("permanently removes");
    expect(deletion.description).toContain("prunes");
  });
});
