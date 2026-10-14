import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import type { RootStackScreenProps } from "../navigation/types";

type SalesRoute = "Customers" | "Invoices";

type HubTile = {
  key: string;
  emoji: string;
  color: string;
  route: SalesRoute;
};

const TILES: readonly HubTile[] = [
  {
    key: "sales_customers_title",
    emoji: "👥",
    color: "#1E88E5",
    route: "Customers",
  },
  {
    key: "sales_invoices_title",
    emoji: "🧾",
    color: "#00897B",
    route: "Invoices",
  },
];

export const SalesScreen: React.FC<RootStackScreenProps<"Sales">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const openTile = useCallback(
    (tile: HubTile): void => {
      if (tile.route === "Customers") navigation.navigate("Customers");
      else navigation.navigate("Invoices");
    },
    [navigation],
  );

  return (
    <Screen>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {t("sales_subtitle")}
      </Text>

      <View style={styles.list}>
        {TILES.map((tile) => (
          <BigButton
            key={tile.key}
            layout="column"
            variant="secondary"
            label={t(tile.key)}
            onPress={() => openTile(tile)}
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
        ))}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  subtitle: {
    ...typography.caption,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  list: {
    flexDirection: "column",
    gap: spacing.md,
  },
  tile: { minHeight: 140 },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 34 },
});
