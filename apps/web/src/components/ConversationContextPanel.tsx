import type {
  ConversationContextContribution,
  ConversationContextContributionKind,
  ConversationContextItemStatus,
} from "@t3tools/client-runtime/conversation";
import type { LucideIcon } from "lucide-react";
import {
  BotIcon,
  BrainIcon,
  CheckIcon,
  CircleAlertIcon,
  FileTextIcon,
  GitBranchIcon,
  KeyRoundIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  NetworkIcon,
  PackageSearchIcon,
  ServerIcon,
} from "lucide-react";

import { cn } from "../lib/utils";
import { Spinner } from "./ui/spinner";

const CONTRIBUTION_ICONS: Record<ConversationContextContributionKind, LucideIcon> = {
  goal: ListChecksIcon,
  orchestration: NetworkIcon,
  workspace: ServerIcon,
  resources: PackageSearchIcon,
  authority: KeyRoundIcon,
  project: GitBranchIcon,
  memory: BrainIcon,
  evidence: FileTextIcon,
};

export function ConversationContextPanel({
  contributions,
  collapsed = false,
}: {
  readonly contributions: ReadonlyArray<ConversationContextContribution>;
  readonly collapsed?: boolean;
}) {
  if (collapsed) return null;
  return (
    <div
      aria-label="Conversation context"
      className="min-h-0 flex-1 overflow-y-auto bg-muted/15 px-4 py-4"
    >
      <div className="space-y-5">
        {contributions.map((contribution) => (
          <ConversationContextSection key={contribution.id} contribution={contribution} />
        ))}
      </div>
    </div>
  );
}

function ConversationContextSection({
  contribution,
}: {
  readonly contribution: ConversationContextContribution;
}) {
  const Icon = CONTRIBUTION_ICONS[contribution.kind];
  return (
    <section className="space-y-2" aria-label={contribution.title}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        <Icon className="size-3.5" />
        {contribution.title}
      </div>
      {contribution.summary ? (
        <div className="text-sm font-medium text-foreground">{contribution.summary}</div>
      ) : null}
      {contribution.progress ? (
        <ConversationContextProgress progress={contribution.progress} />
      ) : null}
      {contribution.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading {contribution.title.toLowerCase()}
        </div>
      ) : contribution.items.length > 0 ? (
        <div className="divide-y divide-border/55 border-y border-border/55">
          {contribution.items.map((item) => (
            <div key={item.id} className="flex min-w-0 items-start gap-2 py-2">
              <ConversationContextStatus status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <div className="truncate text-xs font-medium text-foreground" title={item.label}>
                    {item.label}
                  </div>
                  {item.value ? (
                    <div
                      className="max-w-[60%] truncate text-[11px] text-muted-foreground"
                      title={item.value}
                    >
                      {item.value}
                    </div>
                  ) : null}
                </div>
                {item.detail ? (
                  <div className="line-clamp-3 text-[11px] text-muted-foreground">
                    {item.detail}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : contribution.emptyMessage ? (
        <div className="text-xs text-muted-foreground">{contribution.emptyMessage}</div>
      ) : null}
    </section>
  );
}

function ConversationContextProgress({
  progress,
}: {
  readonly progress: NonNullable<ConversationContextContribution["progress"]>;
}) {
  const ratio = progress.total === 0 ? 0 : progress.completed / progress.total;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] tabular-nums text-muted-foreground">
        {progress.completed}/{progress.total}
        {progress.failed > 0 ? ` · ${progress.failed} failed` : ""}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full origin-left rounded-full transition-transform duration-300",
            progress.failed > 0 ? "bg-destructive" : "bg-success",
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}

function ConversationContextStatus({
  status,
}: {
  readonly status: ConversationContextItemStatus | undefined;
}) {
  if (!status || status === "neutral") return null;
  if (status === "completed") {
    return (
      <CheckIcon
        className="mt-0.5 size-3.5 shrink-0 text-success-foreground"
        aria-label="Completed"
      />
    );
  }
  if (status === "failed") {
    return (
      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Failed" />
    );
  }
  if (status === "running") {
    return (
      <LoaderCircleIcon
        className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground"
        aria-label="In progress"
      />
    );
  }
  return (
    <BotIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Waiting" />
  );
}
