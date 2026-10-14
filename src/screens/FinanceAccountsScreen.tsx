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
  financeAccountRepo,
  type AccountBalance,
  type FinanceAccount,
  type FinanceAccountType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type AccountWithBalance = FinanceAccount & { currentBalance: number };

const iconForType = (type: FinanceAccountType): string => {
  switch (type) {
    case "cash":
      return "💵";
    case "bank":
      return "🏦";
    case "mobile_money":
      return "📱";
    case "savings":
      return "🐷";
    case "credit":
      return "💳";
    case "other":
    default:
      return "💼";
  }
};

const keyForType = (type: FinanceAccountType): string => {
  switch (type) {
    case "cash":
      return "finance_account_type_cash";
    case "bank":
      return "finance_account_type_bank";
    case "mobile_money":
      return "finance_account_type_mobile_money";
    case "savings":
      return "finance_account_type_savings";
    case "credit":
      return "finance_account_type_credit";
    case "other":
    default:
      return "finance_account_type_other";
  }
};

const formatMoney = (amount: number, currency: string): string => {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${formatted}`;
};

export const FinanceAccountsScreen: React.FC<
  RootStackScreenProps<"FinanceAccounts">
> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadAccounts = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [list, balances] = await Promise.all([
        financeAccountRepo.listByFarm(ctx, activeFarm.id),
        financeAccountRepo.getBalances(ctx, activeFarm.id),
      ]);
      const balanceById = new Map<string, AccountBalance>();
      for (const b of balances) balanceById.set(b.accountId, b);

      setAccounts(
        list.map((a) => ({
          ...a,
          currentBalance: balanceById.get(a.id)?.balance ?? a.openingBalance,
        })),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
    }, [loadAccounts]),
  );

  const openAccount = useCallback(
    (accountId: string): void => {
      navigation.navigate("FinanceAccountForm", { accountId });
    },
    [navigation],
  );

  const addAccount = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("FinanceAccountForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: AccountWithBalance }) => {
      const typeLabel = t(keyForType(item.accountType));
      const balanceLabel = formatMoney(item.currentBalance, item.currency);
      const isNegative = item.currentBalance < 0;

      return (
        <Pressable
          onPress={() => openAccount(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${typeLabel}, ${balanceLabel}`}
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
            <Text style={styles.rowIconText}>
              {iconForType(item.accountType)}
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
              {typeLabel}
              {item.institutionName ? ` · ${item.institutionName}` : ""}
              {!item.isActive ? ` · ${t("finance_account_inactive")}` : ""}
            </Text>
            <Text
              style={[
                styles.rowBalance,
                { color: isNegative ? colors.danger : colors.text },
              ]}
              numberOfLines={1}
            >
              {balanceLabel}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openAccount, t],
  );

  const keyExtractor = useCallback((item: FinanceAccount) => item.id, []);

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
            onPress={() => void loadAccounts()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  if (accounts.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🏦</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("finance_no_accounts")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("finance_no_accounts_hint")}
          </Text>
          <BigButton
            label={t("finance_add_first_account")}
            onPress={addAccount}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={accounts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={addAccount}
        accessibilityRole="button"
        accessibilityLabel={t("finance_add_account")}
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
  rowBalance: { ...typography.bodyBold, marginTop: 2 },
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
