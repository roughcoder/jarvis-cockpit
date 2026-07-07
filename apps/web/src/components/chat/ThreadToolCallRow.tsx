import { useState } from "react";
import { CheckIcon, ChevronDownIcon, MinusIcon, WrenchIcon } from "lucide-react";

import type { JarvisThreadToolCallView } from "../../jarvisThreadToolEvents.logic";
import { summarizeToolPayload } from "../../jarvisThreadToolEvents.logic";
import { cn } from "~/lib/utils";

interface ThreadToolCallRowProps {
  readonly toolCall: JarvisThreadToolCallView;
  readonly className?: string;
  readonly defaultExpanded?: boolean;
}

export function ThreadToolCallRow({
  toolCall,
  className,
  defaultExpanded = false,
}: ThreadToolCallRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const inputBody = formatToolPayload(toolCall.input);
  const resultBody = formatToolPayload(toolCall.result);
  const canExpand = inputBody !== null || resultBody !== null;
  const statusLabel = toolCall.status === "completed" ? "Completed" : "Pending";
  const summary = toolCall.inputSummary ?? toolCall.resultSummary;

  return (
    <div
      className={cn(
        "flex flex-col rounded-md px-0.5 py-0.5 text-[12px] leading-5 text-foreground/82",
        canExpand &&
          "cursor-pointer hover:bg-accent/20 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/70",
        className,
      )}
    >
      <button
        type="button"
        className="flex min-w-0 select-none items-center gap-1.5 text-left outline-none"
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={`${toolCall.name} tool call ${statusLabel.toLowerCase()}`}
        disabled={!canExpand}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground/65">
          <WrenchIcon className="block size-3.5 shrink-0 stroke-[1.8] opacity-80" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="min-w-0 shrink truncate font-medium">{toolCall.name}</span>
          {summary !== null ? (
            <span className="min-w-0 flex-1 truncate text-muted-foreground/55">{summary}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-px text-muted-foreground/55">
          <span className="flex size-4 items-center justify-center">
            {canExpand ? (
              <ChevronDownIcon
                className={cn(
                  "size-3 shrink-0 opacity-70 transition-transform duration-200",
                  expanded && "rotate-180",
                )}
                aria-hidden
              />
            ) : null}
          </span>
          <ToolCallStatusIcon status={toolCall.status} />
        </span>
      </button>
      {expanded && canExpand ? (
        <div className="mt-1 ms-7 space-y-2 border-s border-border/45 ps-3 pt-0.5">
          {inputBody !== null ? <ToolPayloadBlock label="Input" value={inputBody} /> : null}
          {resultBody !== null ? <ToolPayloadBlock label="Result" value={resultBody} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolCallStatusIcon({ status }: { readonly status: JarvisThreadToolCallView["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex size-4 items-center justify-center" title="Completed">
        <CheckIcon className="block size-3 shrink-0 stroke-current" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex size-4 items-center justify-center" title="Pending">
      <MinusIcon className="block size-3 shrink-0 opacity-70" aria-hidden />
    </span>
  );
}

function ToolPayloadBlock({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <section aria-label={label}>
      <p className="mb-1 font-medium text-[11px] uppercase tracking-normal text-muted-foreground/65">
        {label}
      </p>
      <pre className="max-h-64 cursor-text overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground select-text">
        {value}
      </pre>
    </section>
  );
}

function formatToolPayload(value: unknown): string | null {
  const summary = summarizeToolPayload(value);
  if (summary === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
