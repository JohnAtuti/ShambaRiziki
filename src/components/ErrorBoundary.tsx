import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { typography } from "../theme/typography";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * Top-level safety net. Lives outside ThemeProvider on purpose so it can
 * render even if the theme system itself throws.
 *
 * Colours are hard-coded here (not from the theme) so this screen renders
 * even if the theme pipeline is the thing that broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            Kuna hitilafu. Tafadhali fungua app tena.
          </Text>
          {__DEV__ && this.state.error ? (
            <Text style={styles.debug}>{this.state.error.message}</Text>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#121212",
  },
  title: {
    ...typography.h1,
    color: "#F5F5F5",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: "#C8C8C8",
    textAlign: "center",
  },
  debug: {
    ...typography.caption,
    color: "#EF5350",
    marginTop: 24,
    textAlign: "center",
  },
});
