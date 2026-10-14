import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { SelectField } from "../components/SelectField";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  customerRepo,
  financeAccountRepo,
  financeTransactionRepo,
  saleRepo,
  type Customer,
  type FinanceAccount,
  type Sale,
  type SaleItem,
  type SaleStatus,
} from "../db";
import { formatMoney } from "../utils/money";
import type { RootStackScreenProps } from "../navigation/types";

const statusKey = (status: SaleStatus): string => {
  switch (status) {
    case "draft":
      return "sale_status_draft";
    case "sent":
      return "sale_status_sent";
    case "paid":
      return "sale_status_paid";
    case "cancelled":
    default:
      return "sale_status_cancelled";
  }
};

const statusColor = (
  status: SaleStatus,
  colors: ReturnType<typeof useTheme>["colors"],
): string => {
  switch (status) {
    case "paid":
      return colors.success;
    case "cancelled":
      return colors.textMuted;
    case "sent":
      return colors.primary;
    case "draft":
    default:
      return colors.accent;
  }
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

export const SaleDetailScreen: React.FC<RootStackScreenProps<"SaleDetail">> = ({
  route,
  navigation,
}) => {
  const { saleId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    try {
      const loaded = await saleRepo.getById(ctx, saleId);
      if (!loaded) {
        setSale(null);
        setLoading(false);
        return;
      }
      const [lines, cust, accts] = await Promise.all([
        saleRepo.listItems(ctx, saleId),
        loaded.customerId
          ? customerRepo.getById(ctx, loaded.customerId)
          : Promise.resolve(null),
        financeAccountRepo.listActiveByFarm(ctx, activeFarm.id),
      ]);
      setSale(loaded);
      setItems(lines);
      setCustomer(cust);
      setAccounts(accts);
      setPaymentAccountId((prev) => {
        if (prev && accts.some((a) => a.id === prev)) return prev;
        return accts[0]?.id ?? "";
      });
    } catch (err) {
      if (__DEV__) console.warn("[SaleDetail] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, saleId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (sale?.reference) {
      navigation.setOptions({ title: sale.reference });
    }
  }, [sale, navigation]);

  const onEdit = useCallback((): void => {
    navigation.navigate("SaleForm", { saleId });
  }, [navigation, saleId]);

  const performMarkPaid = useCallback(async (): Promise<void> => {
    if (!ctx || !sale || !activeFarm) return;
    if (!paymentAccountId) return;

    setMarking(true);
    try {
      // 1. Update the sale itself.
      await saleRepo.update(ctx, sale.id, {
        status: "paid",
        amountPaid: sale.total,
      });

      // 2. Create the linked finance income row. Reference carries the
      //    invoice id so a farmer can find it from the finance list.
      await financeTransactionRepo.create(ctx, {
        farmId: activeFarm.id,
        accountId: paymentAccountId,
        transactionType: "income",
        transactionDate: new Date().toISOString(),
        amount: sale.total,
        currency: sale.currency,
        description: sale.reference
          ? `${t("sale_singular")} ${sale.reference}`
          : t("sale_singular"),
        payee: customer?.name ?? null,
        reference: sale.reference ?? null,
        targetType: "sale",
        targetId: sale.id,
        targetLabel: sale.reference ?? null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      await load();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      Alert.alert(t("update_sale_error"));
      if (__DEV__) console.warn("[SaleDetail] mark paid failed", err);
    } finally {
      setMarking(false);
    }
  }, [ctx, sale, activeFarm, paymentAccountId, customer, load, t]);

  const onMarkPaid = useCallback((): void => {
    if (!sale) return;
    if (accounts.length === 0) {
      Alert.alert(
        t("sale_mark_paid_no_account_title"),
        t("sale_mark_paid_no_account_message"),
        [
          { text: t("no"), style: "cancel" },
          {
            text: t("sale_mark_paid_open_accounts"),
            onPress: () => navigation.navigate("FinanceAccounts"),
          },
        ],
        { cancelable: true },
      );
      return;
    }
    Alert.alert(
      t("sale_mark_paid_confirm_title"),
      t("sale_mark_paid_confirm_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          onPress: () => {
            void performMarkPaid();
          },
        },
      ],
      { cancelable: true },
    );
  }, [sale, accounts, navigation, t, performMarkPaid]);

  const amountDue = useMemo(() => {
    if (!sale) return 0;
    return Math.max(0, sale.total - sale.amountPaid);
  }, [sale]);

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.name,
        icon: a.accountType === "bank" ? "🏦" : "💵",
      })),
    [accounts],
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

  if (!sale) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("sale_not_found")}
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

  const sc = statusColor(sale.status, colors);
  const isPaid = sale.status === "paid";

  return (
    <Screen
      scroll={false}
      footer={
        <BigButton label={t("edit")} onPress={onEdit} variant="primary" />
      }
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {sale.reference ?? t("sale_singular")}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: sc + "22", borderColor: sc },
            ]}
          >
            <Text style={[styles.statusText, { color: sc }]}>
              {t(statusKey(sale.status))}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <InfoRow
            label={t("sale_customer")}
            value={customer?.name ?? t("not_set")}
          />
          <InfoRow label={t("sale_date")} value={formatDate(sale.saleDate)} />
          {sale.dueDate ? (
            <InfoRow
              label={t("sale_due_date")}
              value={formatDate(sale.dueDate)}
            />
          ) : null}
        </View>

        <Text style={[styles.sectionHeading, { color: colors.text }]}>
          {t("sale_items")}
        </Text>
        {items.map((line) => (
          <View
            key={line.id}
            style={[
              styles.lineRow,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.lineBody}>
              <Text style={[styles.lineDesc, { color: colors.text }]}>
                {line.description}
              </Text>
              <Text style={[styles.lineMeta, { color: colors.textMuted }]}>
                {line.quantity}
                {line.unit ? ` ${line.unit}` : ""} ×{" "}
                {formatMoney(line.unitPrice, sale.currency)}
              </Text>
            </View>
            <Text style={[styles.lineTotal, { color: colors.text }]}>
              {formatMoney(line.lineTotal, sale.currency)}
            </Text>
          </View>
        ))}

        <View
          style={[
            styles.totalsCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              {t("sale_total")}
            </Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {formatMoney(sale.total, sale.currency)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              {t("sale_amount_paid")}
            </Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {formatMoney(sale.amountPaid, sale.currency)}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalNetLabel, { color: colors.text }]}>
              {t("sale_amount_due")}
            </Text>
            <Text
              style={[
                styles.totalNetValue,
                {
                  color: amountDue > 0 ? colors.danger : colors.success,
                },
              ]}
            >
              {formatMoney(amountDue, sale.currency)}
            </Text>
          </View>
        </View>

        {sale.notes ? (
          <Text style={[styles.notes, { color: colors.textMuted }]}>
            {sale.notes}
          </Text>
        ) : null}

        {!isPaid ? (
          <>
            <Text
              style={[
                styles.sectionHeading,
                { color: colors.text, marginTop: spacing.lg },
              ]}
            >
              {t("sale_mark_paid")}
            </Text>
            {accounts.length > 0 ? (
              <SelectField<string>
                label={t("sale_payment_account")}
                hint={t("sale_payment_account_hint")}
                value={paymentAccountId}
                onChange={setPaymentAccountId}
                options={accountOptions}
              />
            ) : null}
            <BigButton
              label={
                marking ? t("settings_backup_working") : t("sale_mark_paid")
              }
              onPress={onMarkPaid}
              disabled={marking}
              variant="primary"
              style={styles.markPaidBtn}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.h1, flex: 1 },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: "800" },

  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  infoRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  infoLabel: { ...typography.caption },
  infoValue: { ...typography.body },

  sectionHeading: { ...typography.h3, marginBottom: spacing.md },

  lineRow: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  lineBody: { flex: 1, gap: 2 },
  lineDesc: { ...typography.bodyBold },
  lineMeta: { ...typography.caption },
  lineTotal: { ...typography.bodyBold },

  totalsCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  totalLabel: { ...typography.body },
  totalValue: { ...typography.bodyBold },
  totalNetLabel: { ...typography.bodyBold },
  totalNetValue: { ...typography.h3 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },

  notes: {
    ...typography.caption,
    marginTop: spacing.lg,
  },

  markPaidBtn: {
    marginTop: spacing.md,
    alignSelf: "stretch",
  },
});
