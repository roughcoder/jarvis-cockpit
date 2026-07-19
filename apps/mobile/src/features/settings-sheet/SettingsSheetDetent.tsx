import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SettingsSheetDetentValue {
  collapse: () => void;
  expand: () => void;
  isExpanded: boolean;
}

const SettingsSheetDetentContext = createContext<SettingsSheetDetentValue | null>(null);

interface SettingsSheetDetentProviderProps extends PropsWithChildren {
  initiallyExpanded: boolean;
}

export function SettingsSheetDetentProvider({
  children,
  initiallyExpanded,
}: SettingsSheetDetentProviderProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const collapse = useCallback(() => setIsExpanded(false), []);
  const expand = useCallback(() => setIsExpanded(true), []);
  const value = useMemo(() => ({ collapse, expand, isExpanded }), [collapse, expand, isExpanded]);

  return <SettingsSheetDetentContext value={value}>{children}</SettingsSheetDetentContext>;
}

export function useSettingsSheetDetent(): SettingsSheetDetentValue {
  const value = useContext(SettingsSheetDetentContext);
  if (!value) {
    throw new Error("useSettingsSheetDetent must be used inside SettingsSheetDetentProvider");
  }
  return value;
}
