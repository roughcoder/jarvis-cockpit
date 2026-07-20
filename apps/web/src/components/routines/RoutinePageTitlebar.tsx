import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";

export function RoutinePageTitlebar({ title }: { readonly title: string }) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-center border-b border-border px-4 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-7",
        isElectron ? "drag-region h-[52px] wco:h-[env(titlebar-area-height)]" : "min-h-12",
        COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
    >
      <span className="text-sm font-medium text-foreground">{title}</span>
    </header>
  );
}
