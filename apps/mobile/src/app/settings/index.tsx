import * as Notifications from "expo-notifications";
import { Link, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Effect from "effect/Effect";
import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  isAtomCommandInterrupted,
  reportAtomCommandResult,
  settlePromise,
  settleAsyncResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AppText as Text } from "../../components/AppText";
import { requestAgentNotificationPermission } from "../../features/agent-awareness/notificationPermissions";
import { refreshAgentAwarenessRegistration } from "../../features/agent-awareness/remoteRegistration";
import { runtime } from "../../lib/runtime";
import { useThemeColor } from "../../lib/useThemeColor";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";

type NotificationStatus = "checking" | "enabled" | "disabled" | "unsupported";

export default function SettingsRouteScreen() {
  const insets = useSafeAreaInsets();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environmentCount = Object.keys(savedConnectionsById).length;
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("checking");

  const refreshNotifications = useCallback(async () => {
    if (process.env.EXPO_OS !== "ios") {
      setNotificationStatus("unsupported");
      return;
    }
    const result = await settlePromise(() => Notifications.getPermissionsAsync());
    if (result._tag === "Failure") {
      reportAtomCommandResult(result, { label: "notification permission refresh" });
      setNotificationStatus("disabled");
      return;
    }
    setNotificationStatus(result.value.granted ? "enabled" : "disabled");
  }, []);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const requestNotifications = useCallback(async () => {
    const result = await settleAsyncResult(() =>
      runtime.runPromiseExit(
        requestAgentNotificationPermission.pipe(
          Effect.tap((permission) =>
            permission.type === "granted" ? refreshAgentAwarenessRegistration() : Effect.void,
          ),
        ),
      ),
    );
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        Alert.alert(
          "Notifications unavailable",
          error instanceof Error ? error.message : "Could not request notification permission.",
        );
      }
      return;
    }
    if (result.value.type === "granted") {
      setNotificationStatus("enabled");
      Alert.alert(
        "Notifications enabled",
        "Live Activity notifications are enabled for this device.",
      );
      return;
    }
    if (result.value.type === "unsupported") {
      setNotificationStatus("unsupported");
      Alert.alert(
        "Notifications unavailable",
        "Live Activity notifications are only available on iOS.",
      );
      return;
    }
    setNotificationStatus("disabled");
    if (result.value.canAskAgain) {
      Alert.alert("Notifications disabled", "Notifications were not enabled.");
      return;
    }
    Alert.alert(
      "Notifications disabled",
      "Notifications were denied for this app. Open Settings to enable them.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ],
    );
  }, []);

  const handleDeviceNotificationsChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void requestNotifications();
        return;
      }

      Alert.alert(
        "Disable notifications",
        "Notification permission is controlled by iOS. Open Settings to disable notifications for T3 Code.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ],
      );
    },
    [requestNotifications],
  );

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 24,
          paddingBottom: Math.max(insets.bottom, 18) + 18,
          paddingHorizontal: 20,
          paddingTop: 16,
        }}
      >
        <SettingsSection title="Configuration">
          <SettingsRow
            icon="desktopcomputer"
            label="Environments"
            value={`${environmentCount}`}
            href="/settings/environments"
          />
          <SettingsSwitchRow
            icon="bell.badge"
            label="Device Notifications"
            disabled={notificationStatus === "checking" || notificationStatus === "unsupported"}
            value={notificationStatus === "enabled"}
            onValueChange={handleDeviceNotificationsChange}
          />
        </SettingsSection>

        <ArchivedThreadsSettingsSection />

        <AppSettingsSection />
      </ScrollView>
    </View>
  );
}

type SymbolName = ComponentProps<typeof SymbolView>["name"];

function SettingsSection(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-2 text-sm font-t3-medium text-foreground-muted">{props.title}</Text>
      <View
        className="overflow-hidden rounded-[28px] bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {props.children}
      </View>
    </View>
  );
}

function AppSettingsSection() {
  const icon = useThemeColor("--color-icon");

  return (
    <SettingsSection title="App">
      <View className="flex-row items-center gap-4 p-4">
        <SymbolView
          name="info.circle"
          size={22}
          tintColor={icon}
          type="monochrome"
          weight="regular"
        />
        <Text className="flex-1 text-lg text-foreground">Version</Text>
        <Text className="text-lg text-foreground-muted">Alpha</Text>
      </View>
    </SettingsSection>
  );
}

function ArchivedThreadsSettingsSection() {
  return (
    <SettingsSection title="Threads">
      <SettingsRow icon="archivebox" label="Archived Threads" href="/settings/archive" />
    </SettingsSection>
  );
}

function SettingsRow(props: {
  readonly disabled?: boolean;
  readonly icon: SymbolName;
  readonly label: string;
  readonly value?: string;
  readonly href?: "/settings/archive" | "/settings/environments";
  readonly onPress?: () => void;
}) {
  const icon = useThemeColor("--color-icon");
  const chevron = useThemeColor("--color-chevron");
  const content = (
    <View
      className="flex-row items-center gap-4 p-4"
      style={{ opacity: props.disabled ? 0.45 : 1 }}
    >
      <SymbolView name={props.icon} size={22} tintColor={icon} type="monochrome" weight="regular" />
      <Text className="shrink-0 text-lg text-foreground" numberOfLines={1}>
        {props.label}
      </Text>
      <View className="min-w-0 flex-1 items-end">
        {props.value ? (
          <Text
            className="max-w-[180px] text-right text-base text-foreground-muted"
            ellipsizeMode="middle"
            numberOfLines={1}
          >
            {props.value}
          </Text>
        ) : null}
      </View>
      <SymbolView
        name="chevron.right"
        size={16}
        tintColor={chevron}
        type="monochrome"
        weight="semibold"
      />
    </View>
  );

  if (props.href) {
    return (
      <Link href={props.href} asChild>
        <Pressable accessibilityLabel={props.label} accessibilityRole="button">
          {content}
        </Pressable>
      </Link>
    );
  }

  return (
    <Pressable accessibilityRole="button" disabled={props.disabled} onPress={props.onPress}>
      {content}
    </Pressable>
  );
}

function SettingsSwitchRow(props: {
  readonly disabled?: boolean;
  readonly icon: SymbolName;
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
}) {
  const icon = useThemeColor("--color-icon");
  const activeTrack = String(useThemeColor("--color-switch-active"));
  const track = String(useThemeColor("--color-secondary-border"));

  return (
    <View
      className="flex-row items-center gap-4 p-4"
      style={{ opacity: props.disabled ? 0.45 : 1 }}
    >
      <SymbolView name={props.icon} size={22} tintColor={icon} type="monochrome" weight="regular" />
      <Text className="flex-1 text-lg text-foreground">{props.label}</Text>
      <Switch
        disabled={props.disabled}
        ios_backgroundColor={track}
        onValueChange={props.onValueChange}
        trackColor={{ false: track, true: activeTrack }}
        value={props.value}
      />
    </View>
  );
}
