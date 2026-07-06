import { useAtomValue } from "@effect/atom-react";
import type { JarvisRouteCapability, JarvisRouteCapabilityGroup } from "@t3tools/contracts";
import {
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  RouteIcon,
  ShieldAlertIcon,
  SlashIcon,
} from "lucide-react";
import { useCallback, useMemo } from "react";

import { cn } from "../../lib/utils";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { primaryServerConfigAtom, serverEnvironment } from "../../state/server";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { makeDiagnosticsJson, makeJarvisDiagnosticsExport } from "./JarvisCapabilities.logic";

const GROUP_LABELS: Record<JarvisRouteCapabilityGroup, string> = {
  project: "Project routes",
  memory: "Memory routes",
  conversation: "Conversation routes",
  "worker-dispatch": "Worker dispatch routes",
  mcp: "MCP routes",
  activity: "Activity routes",
};

const GROUP_ORDER: ReadonlyArray<JarvisRouteCapabilityGroup> = [
  "project",
  "memory",
  "conversation",
  "worker-dispatch",
  "mcp",
  "activity",
];

function statusLabel(route: JarvisRouteCapability): string {
  switch (route.status) {
    case "available":
      return "Available";
    case "missing":
      return route.status_code === 404 ? "Missing (404)" : "Missing";
    case "auth-error":
      return "Auth error";
    case "not-probed":
      return "Not probed";
  }
}

function statusVariant(route: JarvisRouteCapability): "success" | "warning" | "error" | "outline" {
  switch (route.status) {
    case "available":
      return "success";
    case "missing":
      return "warning";
    case "auth-error":
      return "error";
    case "not-probed":
      return "outline";
  }
}

function statusIcon(route: JarvisRouteCapability) {
  switch (route.status) {
    case "available":
      return <CheckCircle2Icon className="size-3.5 text-success" />;
    case "auth-error":
      return <ShieldAlertIcon className="size-3.5 text-destructive" />;
    case "missing":
    case "not-probed":
      return <SlashIcon className="size-3.5 text-muted-foreground" />;
  }
}

function groupRoutes(routes: ReadonlyArray<JarvisRouteCapability>) {
  const grouped = new Map<JarvisRouteCapabilityGroup, JarvisRouteCapability[]>();
  for (const group of GROUP_ORDER) {
    grouped.set(group, []);
  }
  for (const route of routes) {
    grouped.get(route.group)?.push(route);
  }
  return GROUP_ORDER.map((group) => ({
    group,
    routes: grouped.get(group) ?? [],
  }));
}

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function JarvisCapabilitiesPanel() {
  const primaryEnvironment = usePrimaryEnvironment();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const capabilitiesQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisCapabilities({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const snapshotQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisSnapshot({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const mcpStatusQuery = useEnvironmentQuery(
    primaryEnvironment
      ? serverEnvironment.jarvisMcpStatus({
          environmentId: primaryEnvironment.environmentId,
          input: {},
        })
      : null,
  );
  const groupedRoutes = useMemo(
    () => groupRoutes(capabilitiesQuery.data?.routes ?? []),
    [capabilitiesQuery.data?.routes],
  );
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "Jarvis diagnostics",
    onCopy: () => {
      toastManager.add({
        title: "Diagnostics copied",
        description: "The redacted Jarvis diagnostics bundle is on the clipboard.",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Could not copy diagnostics",
        description: error.message,
      });
    },
  });

  const buildDiagnosticsJson = useCallback(
    () =>
      makeDiagnosticsJson(
        makeJarvisDiagnosticsExport({
          generatedAt: new Date().toISOString(),
          serverConfig,
          snapshotResult: snapshotQuery.data,
          mcpStatusResult: mcpStatusQuery.data,
          capabilitiesResult: capabilitiesQuery.data,
        }),
      ),
    [capabilitiesQuery.data, mcpStatusQuery.data, serverConfig, snapshotQuery.data],
  );

  const refresh = () => {
    capabilitiesQuery.refresh();
    snapshotQuery.refresh();
    mcpStatusQuery.refresh();
  };

  const copyDiagnostics = () => {
    copyToClipboard(buildDiagnosticsJson());
  };

  const downloadDiagnostics = () => {
    downloadJson("jarvis-cockpit-diagnostics.json", buildDiagnosticsJson());
  };

  const isPending =
    capabilitiesQuery.isPending || snapshotQuery.isPending || mcpStatusQuery.isPending;
  const missingCount =
    capabilitiesQuery.data?.routes.filter((route) => route.status === "missing").length ?? 0;
  const authErrorCount =
    capabilitiesQuery.data?.routes.filter((route) => route.status === "auth-error").length ?? 0;
  const availableCount =
    capabilitiesQuery.data?.routes.filter((route) => route.status === "available").length ?? 0;

  return (
    <SettingsPageContainer className="max-w-5xl">
      <SettingsSection
        title="Jarvis API Capabilities"
        icon={<RouteIcon className="size-3.5" />}
        headerAction={
          <Button size="xs" variant="outline" onClick={refresh}>
            <RefreshCwIcon className={cn("size-3", isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        <div className="grid grid-cols-3 border-b border-border/60 text-center">
          <div className="px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{availableCount}</div>
            <div className="text-[11px] text-muted-foreground">Available</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{missingCount}</div>
            <div className="text-[11px] text-muted-foreground">Missing</div>
          </div>
          <div className="border-l border-border/60 px-3 py-3">
            <div className="text-lg font-semibold text-foreground">{authErrorCount}</div>
            <div className="text-[11px] text-muted-foreground">Auth errors</div>
          </div>
        </div>

        {isPending && !capabilitiesQuery.data ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <Spinner className="size-4" />
            Loading Jarvis capability status
          </div>
        ) : null}

        {capabilitiesQuery.data?.ok === false ? (
          <div className="px-4 py-4 sm:px-5">
            <Alert variant="error">
              <ShieldAlertIcon />
              <AlertTitle>Capability scan failed</AlertTitle>
              <AlertDescription>
                {capabilitiesQuery.data.error?.message ?? "Jarvis capabilities are unavailable."}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {groupedRoutes.map(({ group, routes }) => (
          <div key={group} className="border-t border-border/60 first:border-t-0">
            <div className="flex items-center justify-between px-4 py-3 sm:px-5">
              <h3 className="text-[13px] font-semibold text-foreground">{GROUP_LABELS[group]}</h3>
              <Badge variant="secondary" size="sm">
                {routes.length}
              </Badge>
            </div>
            <ScrollArea
              chainVerticalScroll
              scrollFade
              hideScrollbars
              className="w-full max-w-full rounded-none"
            >
              <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[12%]" />
                  <col className="w-[34%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead className="border-y border-border/60 bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Route</th>
                    <th className="px-4 py-2 font-medium">Method</th>
                    <th className="px-4 py-2 font-medium">Path</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {routes.map((route) => (
                    <tr key={route.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">{route.label}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {route.method}
                      </td>
                      <td className="break-all px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {route.path}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={statusVariant(route)} size="sm">
                          {statusIcon(route)}
                          {statusLabel(route)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {route.detail ?? "No detail reported."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title="Redacted Diagnostics" icon={<ShieldAlertIcon className="size-3.5" />}>
        <SettingsRow
          title="Export diagnostics bundle"
          description="The bundle includes Jarvis brain state, Jarvis mcp-serve status, worker summaries, route capability results, and versions."
          status="Secrets, Authorization headers, JWTs, URL credentials, and emails are redacted before export."
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant="outline" onClick={copyDiagnostics}>
                <CopyIcon className="size-3" />
                {isCopied ? "Copied" : "Copy JSON"}
              </Button>
              <Button size="xs" variant="outline" onClick={downloadDiagnostics}>
                <DownloadIcon className="size-3" />
                Download JSON
              </Button>
            </div>
          }
        />
        <SettingsRow
          title="MCP surfaces"
          description="Native `t3-code` MCP is Cockpit-owned provider tooling. Jarvis `mcp-serve` is the Jarvis runtime MCP surface."
          status="They are exported as separate diagnostics concepts and are not treated as the same server."
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
