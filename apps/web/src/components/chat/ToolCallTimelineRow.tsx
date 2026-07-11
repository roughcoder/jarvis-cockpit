import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  MessageCircleIcon,
  MinusIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";

export type ToolCallTimelineIconName =
  | "bot"
  | "check"
  | "circle-alert"
  | "eye"
  | "globe"
  | "hammer"
  | "message-circle"
  | "square-pen"
  | "terminal"
  | "wrench"
  | "x"
  | "zap";

export type ToolCallTimelineStatus = "completed" | "empty" | "failed" | "pending" | null;

interface ToolCallTimelineRowProps {
  readonly heading: string;
  readonly preview: string | null;
  readonly expandedBody: ReactNode;
  readonly iconName: ToolCallTimelineIconName;
  readonly iconClassName?: string;
  readonly headingClassName?: string;
  readonly status: ToolCallTimelineStatus;
  readonly ariaLabel?: string;
  readonly defaultExpanded?: boolean;
}

const stopRowToggle = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function ToolCallTimelineRow({
  heading,
  preview,
  expandedBody,
  iconName,
  iconClassName = "text-muted-foreground/65",
  headingClassName = "font-medium text-foreground/82",
  status,
  ariaLabel,
  defaultExpanded = false,
}: ToolCallTimelineRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canExpand = expandedBody !== null && expandedBody !== undefined;
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const rowToggleProps = canExpand
    ? {
        role: "button" as const,
        tabIndex: 0 as const,
        "aria-label": ariaLabel ?? displayText,
        onClick: () => setExpanded((value) => !value),
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        },
      }
    : {};

  return (
    <div
      className={cn(
        "flex flex-col rounded-md px-0.5 py-0.5 transition-colors",
        canExpand &&
          "cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
      )}
      {...rowToggleProps}
    >
      <div className="flex select-none items-center gap-1.5 transition-[opacity,translate] duration-200">
        <span className={cn("flex size-5 shrink-0 items-center justify-center", iconClassName)}>
          <ToolCallTimelineIcon
            name={iconName}
            className="block size-3.5 shrink-0 stroke-[1.8] opacity-80"
          />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="flex min-w-0 w-full items-baseline gap-1.5 text-[12px] leading-5">
              <span className={cn("min-w-0 shrink truncate", headingClassName)}>{heading}</span>
              {preview ? (
                <span className="min-w-0 flex-1 truncate text-muted-foreground/55">{preview}</span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-px text-muted-foreground/55">
            <span className="flex size-4 shrink-0 items-center justify-center">
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
            <ToolCallTimelineStatusIcon status={status} />
          </div>
        </div>
      </div>
      {expanded && canExpand ? (
        <div
          className="mt-1 ms-7 cursor-default border-s border-border/45 ps-3 pt-0.5"
          onClick={stopRowToggle}
          onPointerDown={stopRowToggle}
        >
          {expandedBody}
        </div>
      ) : null}
    </div>
  );
}

function ToolCallTimelineStatusIcon({ status }: { readonly status: ToolCallTimelineStatus }) {
  switch (status) {
    case "failed":
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="flex size-4 items-center justify-center"
                aria-label="Tool call failed"
              />
            }
          >
            <XIcon className="block size-3 shrink-0 text-destructive" aria-hidden />
          </TooltipTrigger>
          <TooltipPopup>Failed</TooltipPopup>
        </Tooltip>
      );
    case "completed":
      return (
        <Tooltip>
          <TooltipTrigger render={<span className="flex size-4 items-center justify-center" />}>
            <span className="inline-flex size-4 items-center justify-center">
              <CheckIcon
                className="block size-3 shrink-0 stroke-current"
                stroke="currentColor"
                aria-hidden
              />
            </span>
          </TooltipTrigger>
          <TooltipPopup>Completed</TooltipPopup>
        </Tooltip>
      );
    case "empty":
    case "pending":
      return (
        <Tooltip>
          <TooltipTrigger render={<span className="flex size-4 items-center justify-center" />}>
            <MinusIcon className="block size-3 shrink-0 opacity-70" aria-hidden />
          </TooltipTrigger>
          <TooltipPopup>{status === "pending" ? "Pending" : "Empty"}</TooltipPopup>
        </Tooltip>
      );
    case null:
      return <span className="flex size-4 shrink-0 items-center justify-center" />;
  }
}

function ToolCallTimelineIcon({
  name,
  className,
}: {
  readonly name: ToolCallTimelineIconName;
  readonly className: string;
}) {
  switch (name) {
    case "bot":
      return <BotIcon className={className} aria-hidden />;
    case "check":
      return <CheckIcon className={className} aria-hidden />;
    case "circle-alert":
      return <CircleAlertIcon className={className} aria-hidden />;
    case "eye":
      return <EyeIcon className={className} aria-hidden />;
    case "globe":
      return <GlobeIcon className={className} aria-hidden />;
    case "hammer":
      return <HammerIcon className={className} aria-hidden />;
    case "message-circle":
      return <MessageCircleIcon className={className} aria-hidden />;
    case "square-pen":
      return <SquarePenIcon className={className} aria-hidden />;
    case "terminal":
      return <TerminalIcon className={className} aria-hidden />;
    case "wrench":
      return <WrenchIcon className={className} aria-hidden />;
    case "x":
      return <XIcon className={className} aria-hidden />;
    case "zap":
      return <ZapIcon className={className} aria-hidden />;
  }
}
