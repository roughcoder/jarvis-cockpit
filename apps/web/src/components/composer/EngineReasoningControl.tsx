import type { JarvisCatalogEngine } from "@t3tools/contracts";
import { BotIcon, CheckCircle2Icon, CircleIcon } from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";

export function resolveComposerJarvisEngineSelection(input: {
  readonly engines: ReadonlyArray<Pick<JarvisCatalogEngine, "engine">>;
  readonly previousEngine: string | null | undefined;
}): string | null {
  const previousEngine = input.previousEngine?.trim().toLowerCase();
  if (previousEngine) {
    const match = input.engines.find(
      (engine) => engine.engine.trim().toLowerCase() === previousEngine,
    );
    if (match) {
      return match.engine;
    }
  }
  return input.engines[0]?.engine ?? null;
}

function engineLabel(engine: Pick<JarvisCatalogEngine, "engine" | "display_name">): string {
  return engine.display_name.trim() || engine.engine;
}

export const EngineReasoningControl = memo(function EngineReasoningControl(props: {
  compact: boolean;
  engines: ReadonlyArray<JarvisCatalogEngine>;
  selectedEngine: string | null;
  pending: boolean;
  onEngineChange: (engine: string) => void;
}) {
  const selected = props.engines.find((engine) => engine.engine === props.selectedEngine) ?? null;
  const label =
    selected !== null
      ? engineLabel(selected)
      : props.pending
        ? "Engines..."
        : props.engines.length === 0
          ? "No engines"
          : "Engine";

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0 max-w-48 shrink justify-start whitespace-nowrap px-2 text-muted-foreground/75 hover:text-foreground/85 sm:px-3"
            aria-label="Select Jarvis engine"
            disabled={props.engines.length === 0}
          />
        }
      >
        <BotIcon className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{props.compact ? label : `Engine: ${label}`}</span>
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="min-w-72">
        <MenuGroup>
          <MenuGroupLabel>Jarvis engine</MenuGroupLabel>
          <MenuRadioGroup
            value={props.selectedEngine ?? ""}
            onValueChange={(value) => {
              if (value && value !== props.selectedEngine) {
                props.onEngineChange(value);
              }
            }}
          >
            {props.engines.map((engine) => (
              <MenuRadioItem key={engine.engine} value={engine.engine}>
                {engine.supports.streaming ? (
                  <CheckCircle2Icon className="size-4 text-success-foreground" />
                ) : (
                  <CircleIcon className="size-4 text-muted-foreground/60" />
                )}
                <span className="min-w-0 flex-1 truncate">{engineLabel(engine)}</span>
                {engine.description ? (
                  <span className="max-w-36 truncate text-[11px] text-muted-foreground">
                    {engine.description}
                  </span>
                ) : null}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});
