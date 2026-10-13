import React, { useCallback, useMemo, useState } from "react";
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
import { animalRepo, herdRepo, type Animal, type Herd } from "../db";
import {
  colorForAnimalStatus,
  iconForSpecies,
  keyForAnimalStatus,
  keyForSex,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

export const AnimalsListScreen: React.FC<RootStackScreenProps<"Animals">> = ({
  route,
  navigation,
}) => {
  const filterHerdId = route.params?.herdId;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [animals, setAnimals] = useState<Animal[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [animalRows, herdRows] = await Promise.all([
        filterHerdId
          ? animalRepo.listByHerd(ctx, filterHerdId)
          : animalRepo.listByFarm(ctx, activeFarm.id),
        herdRepo.listByFarm(ctx, activeFarm.id),
      ]);
      setAnimals(animalRows);
      setHerds(herdRows);
    } catch (err) {
      if (__DEV__) console.warn("[AnimalsList] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, filterHerdId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const herdsById = useMemo(() => {
    const map = new Map<string, Herd>();
    for (const herd of herds) map.set(herd.id, herd);
    return map;
  }, [herds]);

  const openAnimal = useCallback(
    (animalId: string): void => {
      navigation.navigate("AnimalDetail", { animalId });
    },
    [navigation],
  );

  const addAnimal = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate(
      "AnimalForm",
      filterHerdId ? { defaultHerdId: filterHerdId } : {},
    );
  }, [navigation, filterHerdId]);

  const renderItem = useCallback(
    ({ item }: { item: Animal }) => {
      const herd = item.herdId ? herdsById.get(item.herdId) : undefined;
      const parts: string[] = [item.tagId];
      parts.push(t(keyForSex(item.sex)));
      parts.push(t(keyForAnimalStatus(item.status)));
      if (herd) parts.push(herd.name);
      const subtitle = parts.join(" · ");

      return (
        <Pressable
          onPress={() => openAnimal(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name ?? item.tagId}, ${subtitle}`}
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
              {iconForSpecies(item.species)}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text
              style={[styles.rowTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name ?? item.tagId}
            </Text>
            <Text
              style={[styles.rowMeta, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </View>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: colorForAnimalStatus(item.status) },
            ]}
          />
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, herdsById, openAnimal, t],
  );

  const keyExtractor = useCallback((item: Animal) => item.id, []);

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

  if (animals.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🐄</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_animals")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_animals_hint")}
          </Text>
          <BigButton
            label={t("add_first_animal")}
            onPress={addAnimal}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={animals}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        onPress={addAnimal}
        accessibilityRole="button"
        accessibilityLabel={t("add_animal")}
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
  statusDot: { width: 10, height: 10, borderRadius: 5 },
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
