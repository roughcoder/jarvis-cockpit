import Stack from "expo-router/stack";
import { useCallback } from "react";
import { useResolveClassNames } from "uniwind";

import { useSettingsSheetDetent } from "../../features/settings-sheet/SettingsSheetDetent";
import { useThemeColor } from "../../lib/useThemeColor";

export const unstable_settings = {
  anchor: "index",
};

export default function SettingsLayout() {
  const { collapse } = useSettingsSheetDetent();
  const contentStyle = useResolveClassNames("bg-sheet");
  const sheetBg = useThemeColor("--color-sheet");
  const headerTint = useThemeColor("--color-foreground");
  const handleExpandedRouteTransitionEnd = useCallback(
    (event: { data: { closing: boolean } }) => {
      if (event.data.closing) {
        collapse();
      }
    },
    [collapse],
  );

  return (
    <Stack
      screenOptions={{
        contentStyle,
        headerBackButtonDisplayMode: "minimal",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: sheetBg },
        headerTintColor: headerTint,
        headerTitleStyle: { fontFamily: "DMSans_700Bold" },
      }}
    >
      <Stack.Screen name="index" options={{ animation: "none", title: "Settings" }} />
      <Stack.Screen
        name="environments"
        options={{ animation: "slide_from_right", title: "Environments" }}
      />
      <Stack.Screen
        name="environment-new"
        options={{ animation: "slide_from_right", title: "Add Environment" }}
      />
      <Stack.Screen
        name="archive"
        listeners={{ transitionEnd: handleExpandedRouteTransitionEnd }}
        options={{ animation: "slide_from_right", title: "Archived Threads" }}
      />
    </Stack>
  );
}
