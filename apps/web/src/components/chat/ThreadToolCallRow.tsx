import type { JarvisThreadToolCallView } from "../../jarvisThreadToolEvents.logic";
import { summarizeToolPayload } from "../../jarvisThreadToolEvents.logic";
import { cn } from "~/lib/utils";
import { ToolCallTimelineRow } from "./ToolCallTimelineRow";

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
  const inputBody = formatToolPayload(toolCall.input);
  const resultBody = formatToolPayload(toolCall.result);
  const statusLabel = toolCall.status === "completed" ? "Completed" : "Pending";
  const summary = toolCall.inputSummary ?? toolCall.resultSummary;

  return (
    <div className={cn("text-foreground/82", className)}>
      <ToolCallTimelineRow
        heading={toolCall.name}
        preview={summary}
        expandedBody={
          inputBody !== null || resultBody !== null ? (
            <div className="space-y-2">
              {inputBody !== null ? <ToolPayloadBlock label="Input" value={inputBody} /> : null}
              {resultBody !== null ? <ToolPayloadBlock label="Result" value={resultBody} /> : null}
            </div>
          ) : null
        }
        iconName="wrench"
        status={toolCall.status === "completed" ? "completed" : "pending"}
        ariaLabel={`${toolCall.name} tool call ${statusLabel.toLowerCase()}`}
        defaultExpanded={defaultExpanded}
      />
    </div>
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
