import type {
  JarvisRetentionClassPlan,
  JarvisRetentionPlan,
  JarvisRetentionPruneResponse,
  JarvisRetentionSettings,
  JarvisRetentionSettingsSourceMap,
} from "@t3tools/contracts";

export type RetentionClassId = "archived" | "chat" | "tree";

export interface RetentionClassPresentation {
  readonly id: RetentionClassId;
  readonly label: string;
  readonly ttlDays: number;
  readonly count: number;
  readonly bytes: number;
  readonly disabled: boolean;
  readonly ttlLabel: string;
  readonly countLabel: string;
  readonly bytesLabel: string;
}

const RETENTION_CLASSES: ReadonlyArray<{
  readonly id: RetentionClassId;
  readonly label: string;
  readonly settingsKey: keyof Pick<
    JarvisRetentionSettings,
    "archived_ttl_days" | "chat_ttl_days" | "tree_ttl_days"
  >;
}> = [
  { id: "archived", label: "Archived", settingsKey: "archived_ttl_days" },
  { id: "chat", label: "Chats", settingsKey: "chat_ttl_days" },
  { id: "tree", label: "Review trees", settingsKey: "tree_ttl_days" },
];

const byteFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat(undefined);

export function formatRetentionBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${byteFormatter.format(value)} ${units[unitIndex]}`;
}

export function formatRetentionInterval(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "off";
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400;
    return `${integerFormatter.format(days)} day${days === 1 ? "" : "s"}`;
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600;
    return `${integerFormatter.format(hours)} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${integerFormatter.format(minutes)} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${integerFormatter.format(seconds)} seconds`;
}

export function formatRetentionTotal(plan: JarvisRetentionPlan): string {
  const count = integerFormatter.format(plan.total_count);
  const noun = plan.total_count === 1 ? "conversation" : "conversations";
  return `Cleaning now would remove ${count} ${noun} · ${formatRetentionBytes(
    plan.total_bytes,
  )}, keeping ${integerFormatter.format(plan.kept)}`;
}

function classCount(value: number, singular: string, plural: string): string {
  return `${integerFormatter.format(value)} ${value === 1 ? singular : plural}`;
}

export function formatRetentionPruneResult(result: JarvisRetentionPruneResponse): string {
  return `Deleted ${classCount(result.deleted.archived, "archived", "archived")}, ${classCount(
    result.deleted.chat,
    "chat",
    "chats",
  )}, ${classCount(result.deleted.tree, "review tree", "review trees")}; reclaimed ${formatRetentionBytes(
    result.bytes_reclaimed,
  )}.`;
}

export function retentionSourceLabel(
  source: JarvisRetentionSettingsSourceMap,
  key: keyof JarvisRetentionSettings,
): "default" | "custom" {
  return source[key] === "override" ? "custom" : "default";
}

export function orderedRetentionClasses(input: {
  readonly plan: JarvisRetentionPlan | null | undefined;
  readonly settings: JarvisRetentionSettings | null | undefined;
}): RetentionClassPresentation[] {
  const byName = new Map<string, JarvisRetentionClassPlan>();
  for (const row of input.plan?.classes ?? []) {
    byName.set(row.name, row);
  }

  return RETENTION_CLASSES.map(({ id, label, settingsKey }) => {
    const row = byName.get(id);
    const ttlDays = row?.ttl_days ?? input.settings?.[settingsKey] ?? 0;
    const disabled = row?.disabled ?? ttlDays === 0;
    const count = disabled ? 0 : (row?.count ?? 0);
    const bytes = disabled ? 0 : (row?.bytes ?? 0);
    return {
      id,
      label,
      ttlDays,
      count,
      bytes,
      disabled,
      ttlLabel: disabled ? "Disabled" : `${integerFormatter.format(ttlDays)}d TTL`,
      countLabel: `${integerFormatter.format(count)} would clean`,
      bytesLabel: formatRetentionBytes(bytes),
    };
  });
}
