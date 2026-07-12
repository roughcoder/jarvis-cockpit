import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ChatHeaderTitle({
  title,
  className,
}: {
  readonly title: string;
  readonly className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <h2
            aria-label={title}
            className={cn("min-w-0 flex-1 truncate text-sm font-medium text-foreground", className)}
          />
        }
      >
        {title}
      </TooltipTrigger>
      <TooltipPopup side="top">{title}</TooltipPopup>
    </Tooltip>
  );
}
