import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { LanguageToggle } from "../components/LanguageToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import type { RootStackScreenProps } from "../navigation/types";

type Tile = { key: string; emoji: string; color: string };

const TILES: readonly Tile[] = [
  { key: "livestock", emoji: "🐄", color: "#8D6E63" },
  { key: "crops", emoji: "🌱", color: "#43A047" },
  { key: "inventory", emoji: "📦", color: "#FB8C00" },
  { key: "money", emoji: "💰", color: "#FDD835" },
  { key: "tasks", emoji: "✅", color: "#1E88E5" },
  { key: "reports", emoji: "📊", color: "#8E24AA" },
];

export const HomeScreen: React.FC<RootStackScreenProps<"Home">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const openTile = useCallback(
    (titleKey: string): void => {
      navigation.navigate("Placeholder", { titleKey });
    },
    [navigation],
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.appName, { color: colors.primary }]}>
            {t("app_name")}
          </Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            {t("tagline")}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <ThemeToggle />
          <LanguageToggle />
        </View>
      </View>

      <View style={styles.grid}>
        {TILES.map((tile) => (
          <View key={tile.key} style={styles.gridItem}>
            <BigButton
              layout="column"
              variant="secondary"
              label={t(tile.key)}
              onPress={() => openTile(tile.key)}
              style={styles.tile}
              icon={
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: tile.color + "22" },
                  ]}
                >
                  <Text style={styles.iconEmoji}>{tile.emoji}</Text>
                </View>
              }
            />
          </View>
        ))}
      </View>

      <Text style={[styles.footer, { color: colors.textMuted }]}>
        v1.0 · Offline / Bila mtandao
      </Text>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  appName: typography.display,
  tagline: {
    ...typography.label,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  gridItem: {
    width: "48%",
    flexGrow: 1,
    flexBasis: "48%",
  },
  tile: { minHeight: 168 },
  iconBubble: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 40 },
  footer: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
