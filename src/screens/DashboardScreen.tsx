import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { formatMoney } from "../utils/money";
import {
  financeAccountRepo,
  financeTransactionRepo,
  reportsRepo,
  windowForPeriod,
  type AccountBalance,
  type FinanceAccount,
  type MonthlySeriesPoint,
  type PeriodKey,
  type PeriodSummary,
  type TargetProfit,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

const PERIODS: readonly { value: PeriodKey; key: string }[] = [
  { value: "this_month", key: "dashboard_period_this_month" },
  { value: "this_season", key: "dashboard_period_this_season" },
  { value: "this_year", key: "dashboard_period_this_year" },
  { value: "all_time", key: "dashboard_period_all_time" },
];

const MONTH_KEYS: readonly string[] = [
  "month_jan",
  "month_feb",
  "month_mar",
  "month_apr",
  "month_may",
  "month_jun",
  "month_jul",
  "month_aug",
  "month_sep",
  "month_oct",
  "month_nov",
  "month_dec",
];

const MAX_TREND_POINTS = 12;
const BAR_HEIGHT = 64;
const BAR_WIDTH = 14;
const BAR_GAP = 4;

type BalanceWithAccount = AccountBalance & { account: FinanceAccount };

export const DashboardScreen: React.FC<RootStackScreenProps<"Dashboard">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySeriesPoint[]>([]);
  const [forecast, setForecast] = useState<MonthlySeriesPoint[]>([]);
  const [plotProfits, setPlotProfits] = useState<TargetProfit[]>([]);
  const [balances, setBalances] = useState<BalanceWithAccount[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadAll = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const window = windowForPeriod(period);
      const [sum, months, forecastRows, profits, bals, accounts, count] =
        await Promise.all([
          reportsRepo.getPeriodSummary(ctx, activeFarm.id, window),
          reportsRepo.getMonthlySeries(ctx, activeFarm.id, window),
          reportsRepo.getForecast(ctx, activeFarm.id, 12),
          reportsRepo.getProfitByTarget(ctx, activeFarm.id, "plot", window),
          financeAccountRepo.getBalances(ctx, activeFarm.id),
          financeAccountRepo.listActiveByFarm(ctx, activeFarm.id),
          financeTransactionRepo.countByFarm(ctx, activeFarm.id),
        ]);
      const accountById = new Map<string, FinanceAccount>();
      for (const a of accounts) accountById.set(a.id, a);
      const enriched: BalanceWithAccount[] = [];
      for (const b of bals) {
        const account = accountById.get(b.accountId);
        if (account) enriched.push({ ...b, account });
      }
      setSummary(sum);
      setMonthly(months);
      setForecast(forecastRows);
      setPlotProfits(profits);
      setBalances(enriched);
      setTxCount(count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, period]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  const selectPeriod = useCallback((next: PeriodKey): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPeriod(next);
  }, []);

  const monthLabel = useCallback(
    (key: string): string => {
      const parts = key.split("-");
      if (parts.length !== 2) return key;
      const monthIdx = parseInt(parts[1], 10) - 1;
      const labelKey = MONTH_KEYS[monthIdx] ?? "month_jan";
      return `${t(labelKey)} ${parts[0].slice(2)}`;
    },
    [t],
  );

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
            onPress={() => void loadAll()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  if (txCount === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>📊</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("dashboard_no_activity")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("dashboard_no_activity_hint")}
          </Text>
          <BigButton
            label={t("dashboard_record_first")}
            onPress={() => navigation.navigate("FinanceTransactionForm", {})}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  const currency = activeFarm?.currency ?? "KES";
  const net = summary?.net ?? 0;
  const netColor = net < 0 ? colors.danger : colors.success;

  // Trend chart data — last MAX_TREND_POINTS months, with bar heights
  // normalized against the largest single value in the window.
  const trendPoints = monthly.slice(-MAX_TREND_POINTS);
  const maxVal =
    trendPoints.length === 0
      ? 1
      : trendPoints.reduce((m, p) => Math.max(m, p.income, p.expense), 1);

  return (
    <Screen>
      {/* Period selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PERIODS.map((p) => {
          const selected = period === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => selectPeriod(p.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(p.key)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: selected ? colors.onPrimary : colors.text,
                  },
                ]}
              >
                {t(p.key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Summary card */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
            {t("finance_summary_income")}
          </Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {formatMoney(summary?.income ?? 0, currency)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
            {t("finance_summary_expense")}
          </Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>
            {formatMoney(summary?.expense ?? 0, currency)}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryNetLabel, { color: colors.text }]}>
            {t("finance_summary_net")}
          </Text>
          <Text style={[styles.summaryNetValue, { color: netColor }]}>
            {formatMoney(net, currency)}
          </Text>
        </View>
      </View>

      {/* Accounts strip */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
        {t("finance_accounts")}
      </Text>
      {balances.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: colors.textMuted }]}>
          {t("finance_no_accounts_hint")}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountStrip}
        >
          {balances.map((b) => {
            const balColor = b.balance < 0 ? colors.danger : colors.text;
            return (
              <Pressable
                key={b.accountId}
                onPress={() => navigation.navigate("FinanceAccounts")}
                accessibilityRole="button"
                accessibilityLabel={`${b.account.name}, ${formatMoney(b.balance, b.account.currency)}`}
                style={({ pressed }) => [
                  styles.accountCard,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.accountName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {b.account.name}
                </Text>
                <Text
                  style={[styles.accountBalance, { color: balColor }]}
                  numberOfLines={1}
                >
                  {formatMoney(b.balance, b.account.currency)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Monthly trend */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
        {t("dashboard_monthly_trend")}
      </Text>
      {trendPoints.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: colors.textMuted }]}>
          {t("dashboard_no_monthly_data")}
        </Text>
      ) : (
        <View
          style={[
            styles.chartCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chartRow}
          >
            {trendPoints.map((p) => {
              const incomeH = Math.max(
                2,
                Math.round((p.income / maxVal) * BAR_HEIGHT),
              );
              const expenseH = Math.max(
                2,
                Math.round((p.expense / maxVal) * BAR_HEIGHT),
              );
              return (
                <View key={p.month} style={styles.chartColumn}>
                  <View style={styles.barStack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: incomeH,
                          width: BAR_WIDTH,
                          backgroundColor: colors.success,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.bar,
                        {
                          height: expenseH,
                          width: BAR_WIDTH,
                          backgroundColor: colors.danger,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.chartLabel, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {monthLabel(p.month)}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          <View style={[styles.legendRow, { borderTopColor: colors.border }]}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: colors.success },
                ]}
              />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                {t("finance_summary_income")}
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: colors.danger },
                ]}
              />
              <Text style={[styles.legendText, { color: colors.textMuted }]}>
                {t("finance_summary_expense")}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Profit by plot */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
        {t("dashboard_top_plots")}
      </Text>
      {plotProfits.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: colors.textMuted }]}>
          {t("dashboard_no_plots_data")}
        </Text>
      ) : (
        <View style={styles.plotList}>
          {plotProfits.slice(0, 5).map((p) => {
            const profitColor = p.net < 0 ? colors.danger : colors.success;
            return (
              <View
                key={p.targetId}
                style={[
                  styles.plotRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.plotBody}>
                  <Text
                    style={[styles.plotName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {p.targetLabel}
                  </Text>
                  <Text
                    style={[styles.plotMeta, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    ↓ {formatMoney(p.income, currency)} · ↑{" "}
                    {formatMoney(p.expense, currency)}
                  </Text>
                </View>
                <Text
                  style={[styles.plotNet, { color: profitColor }]}
                  numberOfLines={1}
                >
                  {formatMoney(p.net, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Scheduled / future-dated transactions */}
      <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
        {t("dashboard_scheduled")}
      </Text>
      {forecast.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: colors.textMuted }]}>
          {t("dashboard_no_scheduled")}
        </Text>
      ) : (
        <View style={styles.plotList}>
          {forecast.map((p) => {
            const netRow = p.income - p.expense;
            const rowColor = netRow < 0 ? colors.danger : colors.success;
            return (
              <View
                key={p.month}
                style={[
                  styles.plotRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.plotBody}>
                  <Text
                    style={[styles.plotName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {monthLabel(p.month)}
                  </Text>
                  <Text
                    style={[styles.plotMeta, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    ↓ {formatMoney(p.income, currency)} · ↑{" "}
                    {formatMoney(p.expense, currency)}
                  </Text>
                </View>
                <Text
                  style={[styles.plotNet, { color: rowColor }]}
                  numberOfLines={1}
                >
                  {formatMoney(netRow, currency)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
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
  emptySub: { ...typography.body, textAlign: "center" },
  emptyCta: { marginTop: spacing.lg, alignSelf: "stretch" },
  retry: { marginTop: spacing.lg, alignSelf: "stretch" },

  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  chipText: { ...typography.label, fontWeight: "700" },

  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: { ...typography.body },
  summaryValue: { ...typography.h2 },
  summaryNetLabel: { ...typography.bodyBold },
  summaryNetValue: { ...typography.h1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },

  sectionHeader: {
    ...typography.label,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  sectionEmpty: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },

  accountStrip: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  accountCard: {
    minWidth: 150,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.xs,
  },
  accountName: { ...typography.caption },
  accountBalance: { ...typography.bodyBold },

  chartCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.lg,
  },
  chartRow: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: "flex-end",
  },
  chartColumn: {
    alignItems: "center",
    gap: spacing.xs,
  },
  barStack: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: BAR_GAP,
    height: BAR_HEIGHT,
  },
  bar: {
    borderRadius: 2,
  },
  chartLabel: {
    ...typography.caption,
    fontSize: 10,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: { ...typography.caption },

  plotList: { gap: spacing.sm, marginBottom: spacing.lg },
  plotRow: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  plotBody: { flex: 1, gap: 2 },
  plotName: { ...typography.bodyBold },
  plotMeta: { ...typography.caption },
  plotNet: { ...typography.bodyBold },
});
