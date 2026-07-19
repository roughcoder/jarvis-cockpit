import { memo } from "react";
import { ChevronDownIcon, CpuIcon, ServerIcon } from "lucide-react";

import {
  type ProjectConversationWorkspaceEngineOption,
  type ProjectConversationWorkspaceStaging,
  resolveWorkspaceEngineModel,
  resolveWorkspaceEngineOption,
  setProjectConversationWorkspaceEngine,
  setProjectConversationWorkspaceModel,
} from "../projectConversationWorkspace.logic";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * Engine picker for jarvis surfaces, occupying the same footer slot as the
 * native `ProviderModelPicker` and sharing its trigger styling so both routes
 * read identically.
 */
export const ComposerWorkspaceEnginePicker = memo(function ComposerWorkspaceEnginePicker(props: {
  readonly compact: boolean;
  readonly staging: ProjectConversationWorkspaceStaging;
  readonly engineOptions: ReadonlyArray<ProjectConversationWorkspaceEngineOption>;
  readonly disabled?: boolean;
  readonly onStagingChange: (staging: ProjectConversationWorkspaceStaging) => void;
}) {
  const selectedEngine = resolveWorkspaceEngineOption(props.engineOptions, props.staging.engine);
  const selectedModel = resolveWorkspaceEngineModel({
    engineOptions: props.engineOptions,
    engine: props.staging.engine,
    model: props.staging.model,
  });
  const triggerLabel = selectedModel
    ? `${selectedEngine.label} · ${selectedModel.label}`
    : selectedEngine.label;

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
            aria-label={`Engine and model: ${triggerLabel}`}
            disabled={props.disabled}
          />
        }
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <ServerIcon aria-hidden="true" className="size-4 shrink-0" />
          <Tooltip>
            <TooltipTrigger render={<span className="min-w-0 flex-1 overflow-hidden truncate" />}>
              {triggerLabel}
            </TooltipTrigger>
            <TooltipPopup side="top">{triggerLabel}</TooltipPopup>
          </Tooltip>
        </span>
        <span aria-hidden="true" className="flex items-center">
          <ChevronDownIcon aria-hidden="true" className="!ms-0 !-me-1 size-3 shrink-0 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="end" side="top" className="min-w-60">
        <MenuGroup>
          <MenuGroupLabel>Engine</MenuGroupLabel>
          <MenuRadioGroup
            value={props.staging.engine}
            onValueChange={(value) =>
              props.onStagingChange(setProjectConversationWorkspaceEngine(props.staging, value))
            }
          >
            {props.engineOptions.map((option) => (
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
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>Model</MenuGroupLabel>
          <MenuSub>
            <MenuSubTrigger className="py-2">
              <CpuIcon aria-hidden="true" className="size-4" />
              <div className="grid min-w-0 gap-0.5">
                <span className="font-medium text-foreground">{selectedEngine.label}</span>
                <span className="truncate text-muted-foreground text-xs leading-4">
                  {selectedModel?.label ?? "No model catalog reported"}
                </span>
              </div>
            </MenuSubTrigger>
            <MenuSubPopup className="min-w-64">
              <MenuGroup>
                <MenuGroupLabel>{selectedEngine.label} models</MenuGroupLabel>
                <MenuRadioGroup
                  value={selectedModel?.id ?? ""}
                  onValueChange={(value) =>
                    props.onStagingChange(
                      setProjectConversationWorkspaceModel(props.staging, value),
                    )
                  }
                >
                  {selectedEngine.models.length > 0 ? (
                    selectedEngine.models.map((model) => (
                      <MenuRadioItem key={model.id} value={model.id} className="py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                            {model.label}
                          </span>
                          {model.id === selectedEngine.defaultModel ? (
                            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-[10px] uppercase leading-none">
                              Default
                            </span>
                          ) : null}
                        </div>
                      </MenuRadioItem>
                    ))
                  ) : (
                    <MenuRadioItem value="" disabled className="py-2">
                      <span className="text-muted-foreground">No models reported</span>
                    </MenuRadioItem>
                  )}
                </MenuRadioGroup>
              </MenuGroup>
            </MenuSubPopup>
          </MenuSub>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});
