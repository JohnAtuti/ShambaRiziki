import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import type { RootStackScreenProps } from "../navigation/types";

type FinanceRoute =
  | "FinanceAccounts"
  | "FinanceCategories"
  | "FinanceTransactions";

type HubTile = {
  key: string;
  emoji: string;
  color: string;
  route: FinanceRoute;
};

const TILES: readonly HubTile[] = [
  {
    key: "finance_accounts",
    emoji: "🏦",
    color: "#1E88E5",
    route: "FinanceAccounts",
  },
  {
    key: "finance_categories",
    emoji: "🏷️",
    color: "#43A047",
    route: "FinanceCategories",
  },
  {
    key: "finance_transactions",
    emoji: "💸",
    color: "#FB8C00",
    route: "FinanceTransactions",
  },
];

export const FinanceScreen: React.FC<RootStackScreenProps<"Finance">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const openTile = useCallback(
    (tile: HubTile): void => {
      if (tile.route === "FinanceAccounts") {
        navigation.navigate("FinanceAccounts");
      } else if (tile.route === "FinanceCategories") {
        navigation.navigate("FinanceCategories");
      } else {
        navigation.navigate("FinanceTransactions", {});
      }
    },
    [navigation],
  );

  return (
    <Screen>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {t("finance_subtitle")}
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
