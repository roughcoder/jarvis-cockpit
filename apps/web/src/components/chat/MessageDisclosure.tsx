import { ChevronDownIcon } from "lucide-react";

import ChatMarkdown from "../ChatMarkdown";

export function MessageDisclosure({
  label,
  text,
  cwd,
}: {
  readonly label: string;
  readonly text: string;
  readonly cwd: string | undefined;
}) {
  return (
    <details className="group/disclosure mt-2 border-t border-foreground/10 pt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
        <ChevronDownIcon className="size-3 transition-transform group-open/disclosure:rotate-180" />
        {label}
      </summary>
      <div className="mt-2 max-h-72 overflow-y-auto border-s border-border/50 ps-3 text-left">
        <ChatMarkdown text={text} cwd={cwd} />
      </div>
    </details>
  );
}
