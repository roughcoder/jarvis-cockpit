import { memo } from "react";
import { ChevronDownIcon, ServerIcon } from "lucide-react";

import {
  type ProjectConversationWorkspaceEngine,
  type ProjectConversationWorkspaceStaging,
  setProjectConversationWorkspaceEngine,
} from "../projectConversationWorkspace.logic";
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
import { cn } from "~/lib/utils";

interface EngineOption {
  readonly value: ProjectConversationWorkspaceEngine;
  readonly label: string;
  readonly description: string;
}

/** Mirrors the default in `createProjectConversationWorkspaceStaging`. */
const DEFAULT_ENGINE_OPTION: EngineOption = {
  value: "codex",
  label: "Codex",
  description: "OpenAI Codex app-server.",
};

const ENGINE_OPTIONS: ReadonlyArray<EngineOption> = [
  DEFAULT_ENGINE_OPTION,
  { value: "claude", label: "Claude", description: "Claude Code agent." },
];

/**
 * Engine picker for jarvis surfaces, occupying the same footer slot as the
 * native `ProviderModelPicker` and sharing its trigger styling so both routes
 * read identically. Jarvis exposes no effort/reasoning axis, so the picker is a
 * single Engine group rather than the native model + effort submenu.
 */
export const ComposerWorkspaceEnginePicker = memo(function ComposerWorkspaceEnginePicker(props: {
  readonly compact: boolean;
  readonly staging: ProjectConversationWorkspaceStaging;
  readonly disabled?: boolean;
  readonly onStagingChange: (staging: ProjectConversationWorkspaceStaging) => void;
}) {
  const selected =
    ENGINE_OPTIONS.find((option) => option.value === props.staging.engine) ?? DEFAULT_ENGINE_OPTION;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            data-chat-composer-workspace-engine-picker="true"
            className={cn(
              "min-w-0 justify-between whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80",
              props.compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
            )}
            aria-label={`Engine: ${selected.label}`}
            disabled={props.disabled}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ServerIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 overflow-hidden truncate">{selected.label}</span>
        </span>
        <span aria-hidden="true" className="flex items-center">
          <ChevronDownIcon aria-hidden="true" className="!ms-0 !-me-1 size-3 shrink-0 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="end" side="top" className="min-w-56">
        <MenuGroup>
          <MenuGroupLabel>Engine</MenuGroupLabel>
          <MenuRadioGroup
            value={props.staging.engine}
            onValueChange={(value) =>
              props.onStagingChange(setProjectConversationWorkspaceEngine(props.staging, value))
            }
          >
            {ENGINE_OPTIONS.map((option) => (
              <MenuRadioItem key={option.value} value={option.value} className="py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-medium text-foreground">{option.label}</span>
                  <span className="text-muted-foreground text-xs leading-4">
                    {option.description}
                  </span>
                </div>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});
