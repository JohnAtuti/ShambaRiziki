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
import { cropRepo, type Crop } from "../db";
import { iconForCategory, keyForCategory } from "../utils/cropLabels";
import type { RootStackScreenProps } from "../navigation/types";

export const CropsListScreen: React.FC<RootStackScreenProps<"Crops">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadCrops = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const rows = await cropRepo.listByFarm(ctx, activeFarm.id);
      setCrops(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void loadCrops();
    }, [loadCrops]),
  );

  const openCrop = useCallback(
    (cropId: string): void => {
      navigation.navigate("CropForm", { cropId });
    },
    [navigation],
  );

  const addCrop = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("CropForm", {});
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Crop }) => {
      const categoryLabel = t(keyForCategory(item.category));
      const subtitle = item.variety
        ? `${item.variety} · ${categoryLabel}`
        : categoryLabel;

      return (
        <Pressable
          onPress={() => openCrop(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${subtitle}`}
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
              {iconForCategory(item.category)}
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
              {subtitle}
            </Text>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openCrop, t],
  );

  const keyExtractor = useCallback((item: Crop) => item.id, []);

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
            onPress={() => void loadCrops()}
            variant="secondary"
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  if (crops.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🌾</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_crops")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_crops_hint")}
          </Text>
          <BigButton
            label={t("add_first_crop")}
            onPress={addCrop}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={crops}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={addCrop}
        accessibilityRole="button"
        accessibilityLabel={t("add_crop")}
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
