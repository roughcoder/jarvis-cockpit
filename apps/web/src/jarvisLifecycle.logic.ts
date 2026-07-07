export interface JarvisReclamationSummaryInput {
  readonly records: number;
  readonly events: number;
  readonly worktrees: number;
  readonly bytes: number;
}

export type JarvisLifecycleTargetKind = "session" | "run";
export type JarvisLifecycleActionKind = "archive" | "delete";

export interface JarvisLifecycleActionCopy {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
}

export function formatJarvisReclamationToast(input: {
  readonly targetKind: JarvisLifecycleTargetKind;
  readonly deleted: boolean;
  readonly reclamation: JarvisReclamationSummaryInput;
}): string {
  const verb = input.deleted ? "Deleted" : "Already deleted";
  const reclaimedBytes = formatReclaimedBytes(input.reclamation.bytes);
  return `${verb}: ${formatDeletedRecordCount(
    input.reclamation.records,
    input.targetKind,
  )}, ${formatCount(input.reclamation.events, "event")}, ${formatCount(
    input.reclamation.worktrees,
    "worktree",
  )}, ${reclaimedBytes} reclaimed`;
}

export function jarvisLifecycleActionCopy(input: {
  readonly action: JarvisLifecycleActionKind;
  readonly targetKind: JarvisLifecycleTargetKind;
  readonly title: string;
}): JarvisLifecycleActionCopy {
  const targetLabel = input.targetKind === "session" ? "work session" : "run";
  if (input.action === "archive") {
    return {
      label: "Archive",
      title: `Archive ${targetLabel} "${input.title}"?`,
      description:
        "Archive hides this item from active work lists. Records, events, worker session state, and worktrees are kept and can be restored by Jarvis.",
      confirmLabel: "Archive",
    };
  }

  return {
    label: "Delete",
    title: `Delete ${targetLabel} "${input.title}"?`,
    description:
      "Delete permanently removes Jarvis records and events, deletes worker session state, and prunes Jarvis-owned worktrees where ownership can be proven.",
    confirmLabel: "Delete",
  };
}

function formatDeletedRecordCount(count: number, targetKind: JarvisLifecycleTargetKind): string {
  if (count === 1) {
    return `1 ${targetKind}`;
  }
  return formatCount(count, "record");
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatReclaimedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 bytes";
  }
  if (bytes < 1024) {
    return formatCount(Math.trunc(bytes), "byte");
  }
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${formatSingleDecimal(value)} ${units[unitIndex]}`;
}

function formatSingleDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
