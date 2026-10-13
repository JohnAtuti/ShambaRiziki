import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  inventoryItemRepo,
  inventoryTransactionRepo,
  warehouseRepo,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Counts = {
  warehouses: number;
  items: number;
  lowStock: number;
  expiring: number;
};

export const InventoryScreen: React.FC<RootStackScreenProps<"Inventory">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [counts, setCounts] = useState<Counts>({
    warehouses: 0,
    items: 0,
    lowStock: 0,
    expiring: 0,
  });

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    try {
      const [warehouseCount, itemCount, items, expiring] = await Promise.all([
        warehouseRepo.countByFarm(ctx, activeFarm.id),
        inventoryItemRepo.countByFarm(ctx, activeFarm.id),
        inventoryItemRepo.listActiveByFarm(ctx, activeFarm.id),
        inventoryTransactionRepo.listExpiring(ctx, activeFarm.id, 30),
      ]);

      const stockLevels = await inventoryItemRepo.getStockLevels(
        ctx,
        activeFarm.id,
      );
      const stockMap = new Map<string, number>();
      for (const s of stockLevels) stockMap.set(s.itemId, s.quantity);

      let lowStock = 0;
      for (const it of items) {
        if (it.reorderLevel == null) continue;
        const stock = stockMap.get(it.id) ?? 0;
        if (stock <= it.reorderLevel) lowStock += 1;
      }

      setCounts({
        warehouses: warehouseCount,
        items: itemCount,
        lowStock,
        expiring: expiring.length,
      });
    } catch (err) {
      if (__DEV__) console.warn("[Inventory] load failed", err);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("inventory_title")}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {t("inventory_subtitle")}
        </Text>
      </View>

      <View style={styles.statGrid}>
        <StatBox emoji="📦" value={String(counts.items)} label={t("items")} />
        <StatBox
          emoji="🏬"
          value={String(counts.warehouses)}
          label={t("warehouses")}
        />
        <StatBox
          emoji="⚠️"
          value={String(counts.lowStock)}
          label={t("low_stock_items")}
          highlight={counts.lowStock > 0}
        />
        <StatBox
          emoji="⏳"
          value={String(counts.expiring)}
          label={t("expiring_batches")}
          highlight={counts.expiring > 0}
        />
      </View>

      <BigButton
        layout="column"
        variant="secondary"
        label={t("items")}
        onPress={() => navigation.navigate("Items")}
        style={styles.tile}
        icon={
          <View style={[styles.iconBubble, { backgroundColor: "#FB8C0022" }]}>
            <Text style={styles.iconEmoji}>📦</Text>
          </View>
        }
      />

      <BigButton
        layout="column"
        variant="secondary"
        label={t("warehouses")}
        onPress={() => navigation.navigate("Warehouses")}
        style={styles.tile}
        icon={
          <View style={[styles.iconBubble, { backgroundColor: "#5D403722" }]}>
            <Text style={styles.iconEmoji}>🏬</Text>
          </View>
        }
      />
    </Screen>
  );
};

const StatBox: React.FC<{
  emoji: string;
  value: string;
  label: string;
  highlight?: boolean;
}> = ({ emoji, value, label, highlight }) => {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.statBox,
        {
          backgroundColor: colors.surface,
          borderColor: highlight ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text
        style={[styles.statLabel, { color: colors.textMuted }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  title: { ...typography.h1 },
  sub: { ...typography.body },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statBox: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 120,
    justifyContent: "center",
  },
  statEmoji: { fontSize: 28 },
  statValue: { ...typography.h2 },
  statLabel: { ...typography.caption, textAlign: "center" },
  tile: { minHeight: 140, marginBottom: spacing.md },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 34 },
});
