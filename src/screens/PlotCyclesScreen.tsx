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
  cropCycleRepo,
  cropRepo,
  plotRepo,
  type Crop,
  type CropCycle,
} from "../db";
import { iconForStatus, keyForStatus } from "../utils/cropLabels";
import type { RootStackScreenProps } from "../navigation/types";

export const PlotCyclesScreen: React.FC<RootStackScreenProps<"PlotCycles">> = ({
  route,
  navigation,
}) => {
  const { plotId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [cycles, setCycles] = useState<CropCycle[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [plotName, setPlotName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [plot, cyclesForPlot, cropsForFarm] = await Promise.all([
        plotRepo.getById(ctx, plotId),
        cropCycleRepo.listByPlot(ctx, plotId),
        cropRepo.listByFarm(ctx, activeFarm.id),
      ]);
      setPlotName(plot?.name ?? null);
      setCycles(cyclesForPlot);
      setCrops(cropsForFarm);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, plotId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (plotName) navigation.setOptions({ title: plotName });
  }, [plotName, navigation]);

  const cropsById = useMemo(() => {
    const map = new Map<string, Crop>();
    for (const crop of crops) map.set(crop.id, crop);
    return map;
  }, [crops]);

  const hasCrops = crops.length > 0;

  const openCycle = useCallback(
    (cycleId: string): void => {
      navigation.navigate("CycleDetail", { cycleId });
    },
    [navigation],
  );

  const addCycle = useCallback((): void => {
    if (!hasCrops) {
      navigation.navigate("Crops");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("CycleForm", { plotId });
  }, [hasCrops, navigation, plotId]);

  const renderItem = useCallback(
    ({ item }: { item: CropCycle }) => {
      const crop = cropsById.get(item.cropId);
      const cropName = crop ? crop.name : "?";
      const statusLabel = t(keyForStatus(item.status));
      const dateOnly = item.plantingDate.slice(0, 10);
      const subtitle = `${cropName} · ${dateOnly} · ${statusLabel}`;

      return (
        <Pressable
          onPress={() => openCycle(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.cycleName ?? cropName}, ${subtitle}`}
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
            <Text style={styles.rowIconText}>{iconForStatus(item.status)}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text
              style={[styles.rowTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.cycleName ?? cropName}
            </Text>
            <Text
              style={[styles.rowMeta, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, cropsById, openCycle, t],
  );

  const keyExtractor = useCallback((item: CropCycle) => item.id, []);

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
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  if (cycles.length === 0) {
    const ctaLabel = hasCrops ? t("add_first_cycle") : t("add_first_crop");
    const hintText = hasCrops ? t("no_cycles_hint") : t("no_crops_hint");

    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🌱</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_cycles")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {hintText}
          </Text>
          <BigButton
            label={ctaLabel}
            onPress={addCycle}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={cycles}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={addCycle}
        accessibilityRole="button"
        accessibilityLabel={hasCrops ? t("add_cycle") : t("add_first_crop")}
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
