import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  cropActivityRepo,
  cropCycleRepo,
  cropRepo,
  plotRepo,
  reportsRepo,
  windowForPeriod,
  type Crop,
  type CropActivity,
  type CropCycle,
  type CycleEconomics,
  type Plot,
} from "../db";
import {
  iconForActivityType,
  iconForStatus,
  keyForActivityType,
  keyForStatus,
} from "../utils/cropLabels";
import { formatMoney, formatMoneyDecimal } from "../utils/money";
import type { RootStackScreenProps } from "../navigation/types";

export const CycleDetailScreen: React.FC<
  RootStackScreenProps<"CycleDetail">
> = ({ route, navigation }) => {
  const { cycleId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [cycle, setCycle] = useState<CropCycle | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [plot, setPlot] = useState<Plot | null>(null);
  const [activities, setActivities] = useState<CropActivity[]>([]);
  const [economics, setEconomics] = useState<CycleEconomics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    try {
      const loadedCycle = await cropCycleRepo.getById(ctx, cycleId);
      if (!loadedCycle) {
        setCycle(null);
        setLoading(false);
        return;
      }
      const [loadedCrop, loadedPlot, loadedActivities, econ] =
        await Promise.all([
          cropRepo.getById(ctx, loadedCycle.cropId),
          plotRepo.getById(ctx, loadedCycle.plotId),
          cropActivityRepo.listByCycle(ctx, cycleId),
          reportsRepo.getCycleEconomics(
            ctx,
            activeFarm.id,
            cycleId,
            windowForPeriod("all_time"),
          ),
        ]);
      setCycle(loadedCycle);
      setCrop(loadedCrop);
      setPlot(loadedPlot);
      setActivities(loadedActivities);
      setEconomics(econ);
    } catch (err) {
      if (__DEV__) {
        console.warn("[CycleDetail] load failed", err);
      }
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, cycleId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (crop) {
      navigation.setOptions({ title: crop.name });
    }
  }, [crop, navigation]);

  const onEditCycle = useCallback((): void => {
    navigation.navigate("CycleForm", { cycleId });
  }, [navigation, cycleId]);

  const addActivity = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("ActivityForm", { cycleId });
  }, [navigation, cycleId]);

  const openActivity = useCallback(
    (activityId: string): void => {
      navigation.navigate("ActivityForm", { cycleId, activityId });
    },
    [navigation, cycleId],
  );

  const renderItem = useCallback(
    ({ item }: { item: CropActivity }) => {
      const typeLabel = t(keyForActivityType(item.activityType));
      const dateOnly = item.activityDate.slice(0, 10);
      const summary = item.description
        ? `${dateOnly} · ${item.description}`
        : dateOnly;

      return (
        <Pressable
          onPress={() => openActivity(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${typeLabel}, ${summary}`}
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
              {iconForActivityType(item.activityType)}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text
              style={[styles.rowTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {typeLabel}
            </Text>
            <Text
              style={[styles.rowMeta, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {summary}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openActivity, t],
  );

  const keyExtractor = useCallback((item: CropActivity) => item.id, []);

  const cycleSummary = useMemo(() => {
    if (!cycle) return "";
    const start = cycle.plantingDate.slice(0, 10);
    const end = cycle.expectedHarvestDate
      ? cycle.expectedHarvestDate.slice(0, 10)
      : "—";
    return `${start} → ${end}`;
  }, [cycle]);

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

  if (!cycle || !crop) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("cycle_not_found")}
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

  const statusLabel = t(keyForStatus(cycle.status));
  const currency = activeFarm?.currency ?? "KES";
  const econHasYield = economics !== null && economics.yieldQty > 0;
  const econMixed = economics?.yieldUnitsMixed === true;

  return (
    <Screen
      scroll={false}
      footer={
        <BigButton
          label={t("edit_cycle")}
          onPress={onEditCycle}
          variant="primary"
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {cycle.cycleName ?? crop.name}
        </Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon}>{iconForStatus(cycle.status)}</Text>
          <Text style={[styles.statusLabel, { color: colors.textMuted }]}>
            {statusLabel}
          </Text>
        </View>
        <Text style={[styles.summary, { color: colors.textMuted }]}>
          {plot ? `${plot.name} · ` : ""}
          {cycleSummary}
        </Text>
      </View>

      {economics ? (
        <View
          style={[
            styles.econCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.econHeading, { color: colors.textMuted }]}>
            {t("finance_econ_heading")}
          </Text>
          <View style={styles.econRow}>
            <Text style={[styles.econLabel, { color: colors.textMuted }]}>
              {t("finance_econ_cost")}
            </Text>
            <Text style={[styles.econValue, { color: colors.text }]}>
              {formatMoney(economics.cost, currency)}
            </Text>
          </View>
          <View style={styles.econRow}>
            <Text style={[styles.econLabel, { color: colors.textMuted }]}>
              {t("finance_econ_yield")}
            </Text>
            <Text style={[styles.econValue, { color: colors.text }]}>
              {econHasYield
                ? `${economics.yieldQty}${
                    economics.yieldUnit ? ` ${economics.yieldUnit}` : ""
                  }`
                : t("finance_econ_no_yield")}
            </Text>
          </View>
          <View style={styles.econRow}>
            <Text style={[styles.econLabel, { color: colors.textMuted }]}>
              {t("finance_econ_per_unit")}
            </Text>
            <Text style={[styles.econValue, { color: colors.text }]}>
              {econMixed
                ? t("finance_econ_mixed_units")
                : economics.costPerUnit != null && economics.yieldUnit
                  ? `${formatMoneyDecimal(
                      economics.costPerUnit,
                      currency,
                    )} / ${economics.yieldUnit}`
                  : "—"}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionHeading, { color: colors.text }]}>
        {t("activities")}
      </Text>

      {activities.length === 0 ? (
        <View style={styles.emptyActivities}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_activities_hint")}
          </Text>
          <BigButton
            label={t("add_first_activity")}
            onPress={addActivity}
            variant="secondary"
            style={styles.stretch}
          />
        </View>
      ) : (
        <FlatList
          data={activities}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {activities.length > 0 ? (
        <Pressable
          onPress={addActivity}
          accessibilityRole="button"
          accessibilityLabel={t("add_activity")}
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
      ) : null}
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
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },

  header: { marginBottom: spacing.lg, gap: spacing.xs },
  title: { ...typography.h1 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusIcon: { fontSize: 24 },
  statusLabel: { ...typography.label },
  summary: { ...typography.body },

  econCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  econHeading: {
    ...typography.label,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  econRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  econLabel: { ...typography.body },
  econValue: { ...typography.bodyBold },

  sectionHeading: { ...typography.h3, marginBottom: spacing.md },

  emptyActivities: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyIcon: { fontSize: 56 },

  listContent: { paddingBottom: spacing.md, gap: spacing.md },

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
