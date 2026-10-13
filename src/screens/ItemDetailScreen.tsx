import React, { useCallback, useEffect, useState } from "react";
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
import {
  inventoryItemRepo,
  inventoryTransactionRepo,
  type InventoryItem,
  type InventoryTransaction,
} from "../db";
import {
  iconForItemCategory,
  iconForTransactionType,
  keyForItemCategory,
  keyForTransactionType,
} from "../utils/inventoryLabels";
import type { RootStackScreenProps } from "../navigation/types";

const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
};

const QuickAction: React.FC<{
  emoji: string;
  label: string;
  onPress: () => void;
}> = ({ emoji, label, onPress }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
};

export const ItemDetailScreen: React.FC<RootStackScreenProps<"ItemDetail">> = ({
  route,
  navigation,
}) => {
  const { itemId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx } = useAppState();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [stock, setStock] = useState(0);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const [loadedItem, loadedStock, txRows] = await Promise.all([
        inventoryItemRepo.getById(ctx, itemId),
        inventoryItemRepo.getStockForItem(ctx, itemId),
        inventoryTransactionRepo.listByItem(ctx, itemId),
      ]);
      setItem(loadedItem);
      setStock(loadedStock);
      setTransactions(txRows);
    } catch (err) {
      if (__DEV__) console.warn("[ItemDetail] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, itemId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (item) navigation.setOptions({ title: item.name });
  }, [item, navigation]);

  const onEdit = useCallback((): void => {
    navigation.navigate("ItemForm", { itemId });
  }, [navigation, itemId]);

  const goPurchase = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("TransactionForm", { itemId });
  }, [navigation, itemId]);

  const goIssue = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("TransactionForm", { itemId });
  }, [navigation, itemId]);

  const goAdjust = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("TransactionForm", { itemId });
  }, [navigation, itemId]);

  const openTx = useCallback(
    (transactionId: string): void => {
      navigation.navigate("TransactionForm", { itemId, transactionId });
    },
    [navigation, itemId],
  );

  const renderTx = useCallback(
    ({ item: tx }: { item: InventoryTransaction }) => {
      const date = tx.transactionDate.slice(0, 10);
      const typeLabel = t(keyForTransactionType(tx.transactionType));
      const sign =
        tx.transactionType === "issue" ||
        tx.transactionType === "adjustment_out"
          ? "-"
          : "+";
      const qtyText = `${sign}${tx.quantity} ${tx.quantityUnit ?? item?.unit ?? ""}`;

      return (
        <Pressable
          onPress={() => openTx(tx.id)}
          accessibilityRole="button"
          accessibilityLabel={`${typeLabel}, ${qtyText}, ${date}`}
          style={({ pressed }) => [
            styles.txRow,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.txIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={styles.txIconText}>
              {iconForTransactionType(tx.transactionType)}
            </Text>
          </View>
          <View style={styles.txBody}>
            <Text style={[styles.txTitle, { color: colors.text }]}>
              {typeLabel}
            </Text>
            <Text style={[styles.txMeta, { color: colors.textMuted }]}>
              {date}
              {tx.targetLabel ? ` · ${tx.targetLabel}` : ""}
            </Text>
          </View>
          <Text style={[styles.txQty, { color: colors.text }]}>{qtyText}</Text>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openTx, t, item?.unit],
  );

  const keyExtractor = useCallback((tx: InventoryTransaction) => tx.id, []);

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

  if (!item) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("item_not_found")}
          </Text>
          <BigButton
            label={t("back")}
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  const isLow = item.reorderLevel != null && stock <= item.reorderLevel;
  const stockColor = isLow ? colors.danger : colors.primary;

  return (
    <Screen
      scroll={false}
      footer={
        <BigButton label={t("edit")} onPress={onEdit} variant="primary" />
      }
    >
      <FlatList
        data={transactions}
        renderItem={renderTx}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <View>
            <View style={styles.headerBlock}>
              <View style={styles.titleRow}>
                <Text style={styles.titleEmoji}>
                  {iconForItemCategory(item.category)}
                </Text>
                <View style={styles.titleText}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {t(keyForItemCategory(item.category))}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.stockCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isLow ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={[styles.stockLabel, { color: colors.textMuted }]}>
                  {t("item_current_stock")}
                </Text>
                <Text style={[styles.stockValue, { color: stockColor }]}>
                  {stock} {item.unit}
                </Text>
                {isLow ? (
                  <Text style={[styles.stockWarn, { color: colors.danger }]}>
                    {t("item_below_reorder")}
                  </Text>
                ) : null}
              </View>
            </View>

            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              {t("item_quick_actions")}
            </Text>

            <View style={styles.quickRow}>
              <QuickAction
                emoji="🛒"
                label={t("item_record_purchase")}
                onPress={goPurchase}
              />
              <QuickAction
                emoji="📤"
                label={t("item_record_issue")}
                onPress={goIssue}
              />
            </View>
            <View style={styles.quickRow}>
              <QuickAction
                emoji="📋"
                label={t("item_record_adjustment")}
                onPress={goAdjust}
              />
            </View>

            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <InfoRow label={t("item_unit")} value={item.unit} />
              <InfoRow
                label={t("item_reorder_level")}
                value={
                  item.reorderLevel != null
                    ? `${item.reorderLevel} ${item.unit}`
                    : t("not_set")
                }
              />
              <InfoRow
                label={t("item_default_cost")}
                value={
                  item.defaultCost != null
                    ? `${item.defaultCost} ${item.defaultCostCurrency ?? ""}`
                    : t("not_set")
                }
              />
              {item.preferredSupplier ? (
                <InfoRow
                  label={t("item_preferred_supplier")}
                  value={item.preferredSupplier}
                />
              ) : null}
              {item.description ? (
                <InfoRow
                  label={t("item_description")}
                  value={item.description}
                />
              ) : null}
            </View>

            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              {t("item_transactions")}
            </Text>

            {transactions.length === 0 ? (
              <View style={styles.emptyTx}>
                <Text style={styles.emptyIcon}>📝</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {t("item_no_transactions_hint")}
                </Text>
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />
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
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },
  listContent: { padding: spacing.md, gap: spacing.md },

  headerBlock: { marginBottom: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  titleEmoji: { fontSize: 56 },
  titleText: { flex: 1, gap: 2 },
  title: { ...typography.h1 },
  subtitle: { ...typography.body },

  stockCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    gap: spacing.xs,
  },
  stockLabel: { ...typography.caption },
  stockValue: { ...typography.display },
  stockWarn: { ...typography.label, fontWeight: "800" },

  sectionHeading: { ...typography.h3, marginBottom: spacing.md },
  quickRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  quickAction: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 96,
    justifyContent: "center",
  },
  quickEmoji: { fontSize: 32 },
  quickLabel: { ...typography.caption, textAlign: "center" },

  infoCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  infoRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  infoLabel: { ...typography.caption },
  infoValue: { ...typography.body },

  emptyTx: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 56 },
  emptySub: { ...typography.body, textAlign: "center" },

  txRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  txIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  txIconText: { fontSize: 24 },
  txBody: { flex: 1, gap: 2 },
  txTitle: { ...typography.bodyBold },
  txMeta: { ...typography.caption },
  txQty: { ...typography.bodyBold },
  chevron: { fontSize: 32, paddingHorizontal: spacing.xs },
});

// Local constant to silence an "unused" complaint if the linter gets picky
// about STOCK-like helpers we no longer use here.
void TOUCH_TARGET;
