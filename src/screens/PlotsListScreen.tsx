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
import { plotRepo, type Plot } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type UseKey =
  | "use_crops"
  | "use_livestock"
  | "use_fallow"
  | "use_mixed"
  | "use_none";

const iconForUse = (use: Plot["currentUse"]): string => {
  switch (use) {
    case "crops":
      return "🌱";
    case "livestock":
      return "🐄";
    case "fallow":
      return "🛌";
    case "mixed":
      return "🌾";
    case "none":
    default:
      return "⬜";
  }
};

const keyForUse = (use: Plot["currentUse"]): UseKey => {
  switch (use) {
    case "crops":
      return "use_crops";
    case "livestock":
      return "use_livestock";
    case "fallow":
      return "use_fallow";
    case "mixed":
      return "use_mixed";
    case "none":
    default:
      return "use_none";
  }
};

export const PlotsListScreen: React.FC<RootStackScreenProps<"Plots">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadPlots = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const rows = await plotRepo.listByFarm(ctx, activeFarm.id);
      setPlots(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void loadPlots();
    }, [loadPlots]),
  );

  const openPlot = useCallback(
    (plotId: string): void => {
      navigation.navigate("PlotDetail", { plotId });
    },
    [navigation],
  );

  const addPlot = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("PlotForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Plot }) => {
      const sizeLabel =
        item.size != null ? `${item.size} ${t(item.sizeUnit)}` : t("not_set");
      const useLabel = t(keyForUse(item.currentUse));

      return (
        <Pressable
          onPress={() => openPlot(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${sizeLabel}, ${useLabel}`}
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
              {iconForUse(item.currentUse)}
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
              {sizeLabel} · {useLabel}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openPlot, t],
  );

  const keyExtractor = useCallback((item: Plot) => item.id, []);

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
            onPress={() => void loadPlots()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  if (plots.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🌍</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_plots")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_plots_hint")}
          </Text>
          <BigButton
            label={t("add_first_plot")}
            onPress={addPlot}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={plots}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={addPlot}
        accessibilityRole="button"
        accessibilityLabel={t("add_plot")}
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
