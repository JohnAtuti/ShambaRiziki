import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "./src/i18n";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AppStateProvider } from "./src/state/AppStateContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { runSmokeTest } from "./src/db";

const ThemedShell: React.FC = () => {
  const { effective } = useTheme();

  useEffect(() => {
    if (__DEV__) {
      runSmokeTest().catch((error) => {
        console.error("[db] ❌ smoke test FAILED", error);
      });
    }
  }, []);

  return (
    <>
      <StatusBar style={effective === "dark" ? "light" : "dark"} />
      <AppStateProvider>
        <RootNavigator />
      </AppStateProvider>
    </>
  );
};

export default function App(): React.ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
