import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";
import { inventoryItemRepo, type InventoryItem } from "../db";
import {
  iconForItemCategory,
  keyForItemCategory,
} from "../utils/inventoryLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Row = {
  item: InventoryItem;
  stock: number;
  isLow: boolean;
};

export const ItemsListScreen: React.FC<RootStackScreenProps<"Items">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [itemRows, stockLevels] = await Promise.all([
        inventoryItemRepo.listActiveByFarm(ctx, activeFarm.id),
        inventoryItemRepo.getStockLevels(ctx, activeFarm.id),
      ]);
      const map = new Map<string, number>();
      for (const s of stockLevels) map.set(s.itemId, s.quantity);
      setItems(itemRows);
      setStockMap(map);
    } catch (err) {
      if (__DEV__) console.warn("[ItemsList] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo<Row[]>(
    () =>
      items.map((item) => {
        const stock = stockMap.get(item.id) ?? 0;
        const isLow = item.reorderLevel != null && stock <= item.reorderLevel;
        return { item, stock, isLow };
      }),
    [items, stockMap],
  );

  const open = useCallback(
    (itemId: string): void => {
      navigation.navigate("ItemDetail", { itemId });
    },
    [navigation],
  );

  const add = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("ItemForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => {
      const { item, stock, isLow } = row;
      const categoryLabel = t(keyForItemCategory(item.category));
      const stockText = `${stock} ${item.unit}`;

      return (
        <Pressable
          onPress={() => open(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${stockText}, ${categoryLabel}`}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: isLow ? colors.accent : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text style={styles.rowIconText}>
              {iconForItemCategory(item.category)}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text
              style={[styles.rowTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text
              style={[styles.rowMeta, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {categoryLabel}
              {item.sku ? ` · ${item.sku}` : ""}
            </Text>
          </View>
          <View style={styles.stockCol}>
            <Text
              style={[
                styles.stockValue,
                { color: isLow ? colors.danger : colors.text },
              ]}
            >
              {stockText}
            </Text>
            {isLow ? (
              <Text style={[styles.stockBadge, { color: colors.danger }]}>
                {t("item_low_stock")}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, open, t],
  );

  const keyExtractor = useCallback((row: Row) => row.item.id, []);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            …
          </Text>
        </View>
      </Screen>
    );
  }

  if (rows.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>📦</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_items")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_items_hint")}
          </Text>
          <BigButton
            label={t("add_first_item")}
            onPress={add}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        onPress={add}
        accessibilityRole="button"
        accessibilityLabel={t("add_item")}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + spacing.lg,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}
      >
        <Text style={[styles.fabIcon, { color: colors.onPrimary }]}>＋</Text>
      </Pressable>
    </Screen>
  );
};

const styles = StyleSheet.create({
  listContainer: { padding: 0 },
  listContent: { padding: spacing.md, gap: spacing.md },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  emptySub: { ...typography.body, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },
  row: {
    minHeight: TOUCH_TARGET + 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconText: { fontSize: 28 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyBold },
  rowMeta: { ...typography.caption },
  stockCol: { alignItems: "flex-end", gap: 2 },
  stockValue: { ...typography.bodyBold },
  stockBadge: { ...typography.caption, fontWeight: "800" },
  chevron: { fontSize: 32, paddingHorizontal: spacing.sm },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  fabIcon: { fontSize: 34, lineHeight: 36, fontWeight: "700" },
});
