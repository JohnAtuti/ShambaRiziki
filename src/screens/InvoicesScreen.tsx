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
  customerRepo,
  saleRepo,
  type Customer,
  type Sale,
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

export const InvoicesScreen: React.FC<RootStackScreenProps<"Invoices">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [sales, setSales] = useState<Sale[]>([]);
  const [customersById, setCustomersById] = useState<Map<string, Customer>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [rows, customers] = await Promise.all([
        saleRepo.listByFarm(ctx, activeFarm.id),
        customerRepo.listByFarm(ctx, activeFarm.id),
      ]);
      const map = new Map<string, Customer>();
      for (const c of customers) map.set(c.id, c);
      setSales(rows);
      setCustomersById(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openSale = useCallback(
    (saleId: string): void => {
      navigation.navigate("SaleDetail", { saleId });
    },
    [navigation],
  );

  const addSale = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("SaleForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Sale }) => {
      const customer = item.customerId
        ? customersById.get(item.customerId)
        : null;
      const title =
        item.reference ?? customer?.name ?? formatDate(item.saleDate);
      const meta = [customer?.name, formatDate(item.saleDate)]
        .filter((v): v is string => Boolean(v))
        .join(" · ");
      const sc = statusColor(item.status, colors);

      return (
        <Pressable
          onPress={() => openSale(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${formatMoney(item.total, item.currency)}`}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
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
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: sc + "22", borderColor: sc },
              ]}
            >
              <Text style={[styles.statusText, { color: sc }]}>
                {t(statusKey(item.status))}
              </Text>
            </View>
          </View>
          <Text style={[styles.rowAmount, { color: colors.text }]}>
            {formatMoney(item.total, item.currency)}
          </Text>
        </Pressable>
      );
    },
    [colors, customersById, openSale, t],
  );

  const keyExtractor = useCallback((item: Sale) => item.id, []);

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
            onPress={() => void load()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  if (sales.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🧾</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_sales")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_sales_hint")}
          </Text>
          <BigButton
            label={t("add_first_sale")}
            onPress={addSale}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={sales}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        onPress={addSale}
        accessibilityRole="button"
        accessibilityLabel={t("add_sale")}
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
  rowBody: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.bodyBold },
  rowMeta: { ...typography.caption },
  rowAmount: { ...typography.bodyBold },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 2,
  },
  statusText: { fontSize: 11, fontWeight: "700" },

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
