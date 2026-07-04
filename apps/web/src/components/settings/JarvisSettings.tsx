import { useAtomValue } from "@effect/atom-react";
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  RefreshCwIcon,
  ServerCogIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_JARVIS_API_BASE_URL,
  type JarvisBrainCheckResult,
  type JarvisBrainConnection,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { serverEnvironment, primaryServerConfigAtom } from "../../state/server";
import { usePrimaryEnvironment } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function formatCommandFailure(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The Jarvis brain request failed.";
}

function sourceLabel(source: JarvisBrainConnection["apiBaseUrlSource"]): string {
  switch (source) {
    case "environment":
      return "Environment";
    case "settings":
      return "Settings";
    case "default":
      return "Default";
  }
}

function tokenLabel(connection: JarvisBrainConnection | null): string {
  if (!connection?.apiTokenConfigured) {
    return "No token";
  }
  return connection.apiTokenSource === "environment" ? "Token from env" : "Stored token";
}

export function JarvisSettingsPanel() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const primaryEnvironment = usePrimaryEnvironment();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const connection = serverConfig?.jarvisBrain ?? null;
  const checkJarvisBrain = useAtomCommand(serverEnvironment.checkJarvisBrain, {
    label: "Jarvis brain check",
    reportFailure: false,
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.jarvis.apiBaseUrl);
  const [apiToken, setApiToken] = useState("");
  const [checkResult, setCheckResult] = useState<JarvisBrainCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    setApiBaseUrl(settings.jarvis.apiBaseUrl);
  }, [settings.jarvis.apiBaseUrl]);

  const envControlsUrl = connection?.apiBaseUrlSource === "environment";
  const envControlsToken = connection?.apiTokenSource === "environment";
  const canCheck = primaryEnvironment !== null && apiBaseUrl.trim().length > 0;
  const effectiveUrl = connection?.apiBaseUrl ?? settings.jarvis.apiBaseUrl;
  const statusVariant = connection?.fixtureMode ? "warning" : connection?.enabled ? "success" : "error";
  const statusLabel = connection?.fixtureMode
    ? "Fixture mode"
    : connection?.enabled
      ? "Live"
      : "Disabled";

  const checkStatus = useMemo(() => {
    if (checkResult === null && checkError === null) return null;
    if (checkError !== null) {
      return {
        variant: "error" as const,
        icon: <XCircleIcon />,
        title: "Check failed",
        description: checkError,
      };
    }
    if (checkResult?.ok) {
      return {
        variant: "success" as const,
        icon: <CheckCircle2Icon />,
        title: "Brain reachable",
        description: `${checkResult.message} ${checkResult.status ? `HTTP ${checkResult.status}.` : ""}`,
      };
    }
    return {
      variant: "error" as const,
      icon: <XCircleIcon />,
      title: "Brain unavailable",
      description: checkResult?.message ?? "Jarvis brain did not return a healthy response.",
    };
  }, [checkError, checkResult]);

  const save = useCallback(() => {
    updateSettings({
      jarvis: {
        ...settings.jarvis,
        apiBaseUrl: apiBaseUrl.trim() || DEFAULT_JARVIS_API_BASE_URL,
        ...(apiToken.trim().length > 0 ? { apiToken: apiToken.trim() } : {}),
      },
    });
    setApiToken("");
  }, [apiBaseUrl, apiToken, settings.jarvis, updateSettings]);

  const clearToken = useCallback(() => {
    updateSettings({
      jarvis: {
        ...settings.jarvis,
        apiToken: "",
        apiTokenRedacted: false,
      },
    });
    setApiToken("");
  }, [settings.jarvis, updateSettings]);

  const check = useCallback(async () => {
    if (!primaryEnvironment || !canCheck) return;
    setIsChecking(true);
    setCheckError(null);
    const result = await checkJarvisBrain({
      environmentId: primaryEnvironment.environmentId,
      input: {
        apiBaseUrl: apiBaseUrl.trim() || DEFAULT_JARVIS_API_BASE_URL,
        ...(apiToken.trim().length > 0 ? { apiToken: apiToken.trim() } : {}),
      },
    });
    setIsChecking(false);
    if (result._tag === "Success") {
      setCheckResult(result.value);
      return;
    }
    if (isAtomCommandInterrupted(result)) {
      return;
    }
    setCheckResult(null);
    setCheckError(formatCommandFailure(squashAtomCommandFailure(result)));
  }, [apiBaseUrl, apiToken, canCheck, checkJarvisBrain, primaryEnvironment]);

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Jarvis Brain"
        icon={<ServerCogIcon className="size-3.5" />}
        headerAction={<Badge variant={statusVariant}>{statusLabel}</Badge>}
      >
        <SettingsRow
          title="Effective brain"
          description="Cockpit reads and writes go through the Jarvis brain; fixture mode is explicit only."
          status={
            <span className="break-all">
              {sourceLabel(connection?.apiBaseUrlSource ?? "default")}: {effectiveUrl}
            </span>
          }
          control={<Badge variant="outline">{tokenLabel(connection)}</Badge>}
        />

        <SettingsRow
          title="Brain URL"
          description={
            envControlsUrl
              ? "JARVIS_API_BASE_URL is set, so environment configuration controls the active URL."
              : "Defaults to the local Jarvis API; set the fleet brain URL here when testing live workers."
          }
          control={
            <Input
              className="w-full sm:w-96"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder={DEFAULT_JARVIS_API_BASE_URL}
              spellCheck={false}
              aria-label="Jarvis brain URL"
            />
          }
        />

        <SettingsRow
          title="Bearer token"
          description={
            envControlsToken
              ? "JARVIS_API_TOKEN is set, so the environment token is used for checks and cockpit calls."
              : "Leave blank to keep the stored token. Enter a new value to replace it."
          }
          control={
            <Input
              className="w-full sm:w-96"
              type="password"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
              placeholder={settings.jarvis.apiTokenRedacted ? "Stored token configured" : "Optional"}
              aria-label="Jarvis brain bearer token"
            />
          }
        />

        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <KeyRoundIcon className="size-3.5" />
            <span>
              The browser never receives the stored token; checks run through the T3 server.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={clearToken} disabled={envControlsToken}>
              Clear token
            </Button>
            <Button size="sm" variant="outline" onClick={save}>
              Save
            </Button>
            <Button size="sm" onClick={() => void check()} disabled={!canCheck || isChecking}>
              {isChecking ? <Spinner className="size-3.5" /> : <RefreshCwIcon className="size-3.5" />}
              Check brain
            </Button>
          </div>
        </div>
      </SettingsSection>

      {checkStatus ? (
        <Alert variant={checkStatus.variant}>
          {checkStatus.icon}
          <AlertTitle>{checkStatus.title}</AlertTitle>
          <AlertDescription>{checkStatus.description}</AlertDescription>
        </Alert>
      ) : null}

      {connection?.fixtureMode ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Fixture mode is enabled</AlertTitle>
          <AlertDescription>
            Unset JARVIS_FIXTURE_MODE to test live fleet data. Normal cockpit development should use
            the fleet brain endpoint, not demo data.
          </AlertDescription>
        </Alert>
      ) : null}
    </SettingsPageContainer>
  );
}
