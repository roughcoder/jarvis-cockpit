import { useMemo } from "react";
import {
  CheckCircle2Icon,
  DatabaseIcon,
  KeyRoundIcon,
  MessagesSquareIcon,
  PlugIcon,
  SquareMousePointerIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const MEMORY_TOOLS = ["memory_search", "record_finding", "record_decision", "remember"];
const PROJECT_TOOLS = ["project_list", "project_get", "open_thread", "send_turn"];
const T3_CODEX_TOOLS = ["preview_status", "preview_navigate", "preview_snapshot", "preview_click"];
const DEFERRED_TOOLS = [
  "project_create",
  "project_update",
  "project_set_repos",
  "project_archive",
  "upload_file",
];

function ToolBadges({
  tools,
  variant = "outline",
}: {
  tools: readonly string[];
  variant?: "outline" | "secondary";
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pb-3 pt-3">
      {tools.map((tool) => (
        <Badge key={tool} variant={variant} size="sm">
          {tool}
        </Badge>
      ))}
    </div>
  );
}

export function JarvisMcpPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
  const snapshotQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisSnapshot({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const projectsQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisProjects({
          environmentId: primaryEnvironment.environmentId,
          input: { includeArchived: false },
        })
      : null,
  );
  const snapshot = snapshotQuery.data?.snapshot ?? null;
  const projects = projectsQuery.data?.projects ?? [];
  const onlineWorkers = useMemo(
    () => snapshot?.workers.filter((worker) => worker.status === "online").length ?? 0,
    [snapshot?.workers],
  );
  const refresh = () => {
    snapshotQuery.refresh();
    projectsQuery.refresh();
  };

  return (
    <SettingsPageContainer className="max-w-4xl">
      <SettingsSection
        title="Jarvis MCP"
        icon={<PlugIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={refresh}>
            <RefreshCwIcon
              className={cn(
                "size-3",
                (snapshotQuery.isPending || projectsQuery.isPending) && "animate-spin",
              )}
            />
            Refresh
          </Button>
        }
      >
        <div className="grid grid-cols-3 border-b border-border/60 text-center">
          <div className="px-3 py-3">
            <div className="text-lg font-semibold text-foreground">
              {snapshotQuery.data?.ok ? "Online" : "Unknown"}
            </div>
            <div className="text-[11px] text-muted-foreground">Brain</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{onlineWorkers}</div>
            <div className="text-[11px] text-muted-foreground">Online Workers</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{projects.length}</div>
            <div className="text-[11px] text-muted-foreground">Visible Projects</div>
          </div>
        </div>

        {(snapshotQuery.isPending || projectsQuery.isPending) && !snapshotQuery.data ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading Jarvis MCP status
          </div>
        ) : null}

        {snapshotQuery.data?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <TriangleAlertIcon />
              <AlertTitle>Jarvis brain snapshot failed</AlertTitle>
              <AlertDescription>
                {snapshotQuery.data.error?.message ?? "Jarvis did not return a cockpit snapshot."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <SettingsRow
          title="Codex MCP"
          description="Cockpit issues provider-scoped credentials for the native `t3-code` MCP server when a Codex session starts."
          status="Injected into Codex as `mcp_servers.t3-code` with a short-lived bearer token."
          control={<SquareMousePointerIcon className="size-4 text-success" />}
        >
          <ToolBadges tools={T3_CODEX_TOOLS} />
        </SettingsRow>

        <SettingsRow
          title="Jarvis MCP server"
          description="Jarvis project and memory tools are exposed by the installed `jarvis mcp-serve` runtime."
          status="Jarvis MCP tokens and server lifecycle are runtime-owned; Cockpit does not expose a token endpoint yet."
          control={<Badge variant="outline">Runtime managed</Badge>}
        >
          <div className="grid gap-2 pb-3 pt-3 md:grid-cols-2">
            <div className="rounded-md border bg-background/60 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <KeyRoundIcon className="size-3" />
                Principal tokens
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Per-principal MCP tokens live in Jarvis private runtime state.
              </p>
            </div>
            <div className="rounded-md border bg-background/60 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <ShieldCheckIcon className="size-3" />
                Capability gate
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                MCP calls run under the requester's Jarvis capabilities.
              </p>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Project tools"
          description="Tools available for project lookup and project-scoped Codex conversations."
          control={<CheckCircle2Icon className="size-4 text-success" />}
        >
          <ToolBadges tools={PROJECT_TOOLS} />
        </SettingsRow>

        <SettingsRow
          title="Memory tools"
          description="Tools available for searching project memory and recording durable project context."
          control={<DatabaseIcon className="size-4 text-success" />}
        >
          <ToolBadges tools={MEMORY_TOOLS} />
        </SettingsRow>

        <SettingsRow
          title="Codex conversations"
          description="Cockpit project conversations use Jarvis project and memory context through the brain session path."
          status="External MCP send_turn remains intentionally scoped to project and memory tools."
          control={<MessagesSquareIcon className="size-4 text-muted-foreground" />}
        />

        <SettingsRow
          title="MCP write exposure"
          description="Cockpit project writes are live through the Jarvis API. External MCP write tools and file uploads remain owned by the Jarvis runtime surface."
          control={<Badge variant="warning">Runtime owned</Badge>}
        >
          <ToolBadges tools={DEFERRED_TOOLS} variant="secondary" />
        </SettingsRow>

        <SettingsRow
          title="Cockpit API gap"
          description="The current Cockpit API does not expose `/v1/capabilities` or MCP token/status endpoints."
          status="This page reports what Cockpit can infer from the live snapshot and project reads."
          control={<ServerIcon className="size-4 text-muted-foreground" />}
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
