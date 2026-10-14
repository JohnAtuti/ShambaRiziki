import React, { useCallback, useState } from "react";
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
  financeTransactionRepo,
  type FinanceTransaction,
  type FinanceTransactionType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

const iconForType = (type: FinanceTransactionType): string => {
  switch (type) {
    case "income":
      return "↓";
    case "expense":
      return "↑";
    case "transfer":
    default:
      return "⇄";
  }
};

const formatMoney = (amount: number, currency: string): string => {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${formatted}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const FinanceTransactionsScreen: React.FC<
  RootStackScreenProps<"FinanceTransactions">
> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTransactions = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const rows = await financeTransactionRepo.listByFarm(ctx, activeFarm.id);
      setTransactions(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void loadTransactions();
    }, [loadTransactions]),
  );

  const openTransaction = useCallback(
    (transactionId: string): void => {
      navigation.navigate("FinanceTransactionForm", { transactionId });
    },
    [navigation],
  );

  const addTransaction = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("FinanceTransactionForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: FinanceTransaction }) => {
      const amountLabel = formatMoney(item.amount, item.currency);
      const isExpense = item.transactionType === "expense";
      const isTransfer = item.transactionType === "transfer";
      const amountColor = isExpense
        ? colors.danger
        : isTransfer
          ? colors.textMuted
          : colors.text;
      const title = item.description || item.payee || item.reference || "—";
      const meta = [formatDate(item.transactionDate), item.targetLabel ?? null]
        .filter((v): v is string => Boolean(v))
        .join(" · ");

      return (
        <Pressable
          onPress={() => openTransaction(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${amountLabel}`}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text
              style={[
                styles.rowIconText,
                { color: amountColor, fontWeight: "800" },
              ]}
            >
              {iconForType(item.transactionType)}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text
              style={[styles.rowTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {meta ? (
              <Text
                style={[styles.rowMeta, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {meta}
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.rowAmount, { color: amountColor }]}
            numberOfLines={1}
          >
            {isExpense ? "-" : isTransfer ? "" : "+"}
            {amountLabel.replace("-", "")}
          </Text>
        </Pressable>
      );
    },
    [colors, openTransaction],
  );

  const keyExtractor = useCallback((item: FinanceTransaction) => item.id, []);

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

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {error.message}
          </Text>
          <BigButton
            label={t("yes")}
            onPress={() => void loadTransactions()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  if (transactions.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>💸</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("finance_no_transactions")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("finance_no_transactions_hint")}
          </Text>
          <BigButton
            label={t("finance_add_first_transaction")}
            onPress={addTransaction}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={addTransaction}
        accessibilityRole="button"
        accessibilityLabel={t("finance_add_transaction")}
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
  emptyCta: { marginTop: spacing.lg, alignSelf: "stretch" },
  retry: { marginTop: spacing.lg, alignSelf: "stretch" },

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
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconText: { fontSize: 24 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyBold },
  rowMeta: { ...typography.caption },
  rowAmount: { ...typography.bodyBold },

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
