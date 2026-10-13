import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, type AppColors } from "./colors";

type Mode = "light" | "dark" | "system";

type ThemeContextValue = {
  mode: Mode;
  effective: "light" | "dark";
  colors: AppColors;
  setMode: (m: Mode) => void;
  toggle: () => void;
};

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>("system");
  const [hydrated, setHydrated] = useState(false);

  // Load saved preference once on mount
  useEffect(() => {
    AsyncStorage.getItem("theme").then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setModeState(v);
      }
      setHydrated(true);
    });
  }, []);

  const effective: "light" | "dark" =
    mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const colors = effective === "dark" ? darkColors : lightColors;

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem("theme", m);
  };

  const toggle = () => setMode(effective === "dark" ? "light" : "dark");

  // Avoid a flash of the wrong theme while we hydrate from storage
  if (!hydrated) return null;

  return (
    <ThemeCtx.Provider value={{ mode, effective, colors, setMode, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
};
