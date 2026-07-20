import { memo, type ReactNode } from "react";
import { ChevronDownIcon, CpuIcon, GaugeIcon, ServerIcon, ZapIcon } from "lucide-react";

import {
  type ProjectConversationWorkspaceEnginePreference,
  type ProjectConversationWorkspaceEngineOption,
  type ProjectConversationWorkspaceStaging,
  resolveWorkspaceEngineEffort,
  resolveWorkspaceEngineModel,
  resolveWorkspaceEngineOption,
  resolveWorkspaceEngineSpeed,
  setProjectConversationWorkspaceEffort,
  setProjectConversationWorkspaceEngine,
  setProjectConversationWorkspaceModel,
  setProjectConversationWorkspaceSpeed,
} from "../projectConversationWorkspace.logic";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
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
  const selectedEffort = resolveWorkspaceEngineEffort({
    engineOptions: props.engineOptions,
    engine: props.staging.engine,
    effort: props.staging.effort,
  });
  const selectedSpeed = resolveWorkspaceEngineSpeed({
    engineOptions: props.engineOptions,
    engine: props.staging.engine,
    speed: props.staging.speed,
  });
  const showEffortRow = selectedEngine.efforts.length > 0;
  const showModelRow = selectedEngine.models.length > 0;
  const showSpeedRow = selectedEngine.speeds.length > 0;
  const triggerLabel = selectedModel
    ? `${selectedEngine.label} · ${selectedModel.label}${selectedEffort ? ` ${selectedEffort.label}` : ""}`
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
            <TooltipTrigger
              render={<span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden" />}
            >
              <span className="min-w-0 truncate">
                {selectedModel
                  ? `${selectedEngine.label} · ${selectedModel.label}${selectedEffort ? " " : ""}`
                  : selectedEngine.label}
              </span>
              {selectedEffort ? (
                <span className="shrink-0 text-muted-foreground/60">{selectedEffort.label}</span>
              ) : null}
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
          <EngineOptionSubmenu
            groupLabel="Engines"
            icon={<ServerIcon aria-hidden="true" className="size-4" />}
            label="Engine"
            value={selectedEngine.label}
            options={props.engineOptions.map((option) => ({
              id: option.value,
              label: option.label,
              description: option.description,
            }))}
            selectedId={selectedEngine.value}
            defaultId={null}
            onValueChange={(value) =>
              props.onStagingChange(
                setProjectConversationWorkspaceEngine(props.staging, value, props.engineOptions),
              )
            }
          />
          {showModelRow ? (
            <EngineOptionSubmenu
              groupLabel={`${selectedEngine.label} models`}
              icon={<CpuIcon aria-hidden="true" className="size-4" />}
              label="Model"
              value={selectedModel?.label ?? "Default"}
              options={selectedEngine.models.map((model) => ({
                id: model.id,
                label: model.label,
              }))}
              selectedId={selectedModel?.id ?? ""}
              defaultId={selectedEngine.defaultModel}
              onValueChange={(value) =>
                props.onStagingChange(setProjectConversationWorkspaceModel(props.staging, value))
              }
            />
          ) : null}
          {showEffortRow ? (
            <EngineOptionSubmenu
              label="Effort"
              groupLabel={`${selectedEngine.label} efforts`}
              icon={<GaugeIcon aria-hidden="true" className="size-4" />}
              value={selectedEffort?.label ?? "Default"}
              options={selectedEngine.efforts}
              selectedId={selectedEffort?.id ?? ""}
              defaultId={selectedEngine.defaultEffort}
              onValueChange={(value) =>
                props.onStagingChange(setProjectConversationWorkspaceEffort(props.staging, value))
              }
            />
          ) : null}
          {showSpeedRow ? (
            <EngineOptionSubmenu
              label="Speed"
              groupLabel={`${selectedEngine.label} speeds`}
              icon={<ZapIcon aria-hidden="true" className="size-4" />}
              value={selectedSpeed?.label ?? "Default"}
              options={selectedEngine.speeds}
              selectedId={selectedSpeed?.id ?? ""}
              defaultId={selectedEngine.defaultSpeed}
              onValueChange={(value) =>
                props.onStagingChange(setProjectConversationWorkspaceSpeed(props.staging, value))
              }
            />
          ) : null}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});

interface EngineSubmenuOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

function PickerSubmenuRow(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-6">
      <span className="font-medium text-foreground">{props.label}</span>
      <span className="min-w-0 truncate text-muted-foreground text-sm">{props.value}</span>
    </div>
  );
}

function EngineOptionSubmenu(props: {
  readonly label: string;
  readonly groupLabel: string;
  readonly value: string;
  readonly icon: ReactNode;
  readonly options: ReadonlyArray<
    EngineSubmenuOption | ProjectConversationWorkspaceEnginePreference
  >;
  readonly selectedId: string;
  readonly defaultId: string | null;
  readonly onValueChange: (value: string) => void;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger className="py-2">
        {props.icon}
        <PickerSubmenuRow label={props.label} value={props.value} />
      </MenuSubTrigger>
      <MenuSubPopup className="min-w-72">
        <MenuGroup>
          <MenuGroupLabel>{props.groupLabel}</MenuGroupLabel>
          <MenuRadioGroup value={props.selectedId} onValueChange={props.onValueChange}>
            {props.options.map((option) => (
              <MenuRadioItem key={option.id} value={option.id} className="py-2">
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {option.label}
                    </span>
                    {option.id === props.defaultId ? (
                      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-[10px] uppercase leading-none">
                        Default
                      </span>
                    ) : null}
                  </div>
                  {option.description ? (
                    <span className="text-muted-foreground text-xs leading-4">
                      {option.description}
                    </span>
                  ) : null}
                </div>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}
