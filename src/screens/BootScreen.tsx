import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "../components/Screen";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

type Props = {
  status: "loading" | "error";
  error?: Error | null;
  onRetry?: () => void;
};

export const BootScreen: React.FC<Props> = ({ status, error, onRetry }) => {
  const { colors } = useTheme();

  if (status === "loading") {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>
            ShambaRiziki
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={[styles.title, { color: colors.text }]}>
          App failed to start
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Programu haikuanza. Tafadhali jaribu tena.
        </Text>
        {__DEV__ && error ? (
          <Text style={[styles.debug, { color: colors.danger }]}>
            {error.message}
          </Text>
        ) : null}
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            style={({ pressed }) => [
              styles.retry,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>
              Try again / Jaribu tena
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  icon: { fontSize: 56 },
  title: { ...typography.h1, textAlign: "center" },
  sub: { ...typography.body, textAlign: "center" },
  debug: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.md,
  },
  retry: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { ...typography.bodyBold },
});
