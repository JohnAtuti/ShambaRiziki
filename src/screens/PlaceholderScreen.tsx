import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import type { RootStackScreenProps } from "../navigation/types";

export const PlaceholderScreen: React.FC<
  RootStackScreenProps<"Placeholder">
> = ({ route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const title = t(route.params.titleKey);

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Coming in Phase 2 / Inakuja awamu ya 2
        </Text>
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
  },
  title: {
    ...typography.h1,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  sub: {
    ...typography.body,
    textAlign: "center",
  },
});
