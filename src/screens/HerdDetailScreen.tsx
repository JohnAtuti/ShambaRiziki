import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  keyForPurpose,
  keyForSex,
  keyForSpecies,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

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

export const HerdDetailScreen: React.FC<RootStackScreenProps<"HerdDetail">> = ({
  route,
  navigation,
}) => {
  const { herdId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx } = useAppState();

  const [herd, setHerd] = useState<Herd | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const [loadedHerd, loadedAnimals] = await Promise.all([
        herdRepo.getById(ctx, herdId),
        animalRepo.listByHerd(ctx, herdId),
      ]);
      setHerd(loadedHerd);
      setAnimals(loadedAnimals);
    } catch (err) {
      if (__DEV__) console.warn("[HerdDetail] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, herdId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (herd) navigation.setOptions({ title: herd.name });
  }, [herd, navigation]);

  const onEdit = useCallback((): void => {
    navigation.navigate("HerdForm", { herdId });
  }, [navigation, herdId]);

  const addAnimal = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("AnimalForm", { defaultHerdId: herdId });
  }, [navigation, herdId]);

  const openAnimal = useCallback(
    (animalId: string): void => {
      navigation.navigate("AnimalDetail", { animalId });
    },
    [navigation],
  );

  const onDelete = useCallback((): void => {
    if (!ctx) return;
    Alert.alert(
      t("delete_herd_title"),
      t("delete_herd_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await herdRepo.softDelete(ctx, herdId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[HerdDetail] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, herdId, navigation, t]);

  const renderItem = useCallback(
    ({ item }: { item: Animal }) => {
      const subtitle = `${t(keyForSex(item.sex))} · ${t(
        keyForAnimalStatus(item.status),
      )}`;
      return (
        <Pressable
          onPress={() => openAnimal(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name ?? item.tagId}, ${subtitle}`}
          style={({ pressed }) => [
            styles.animalRow,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[styles.animalIcon, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text style={styles.animalIconText}>
              {iconForSpecies(item.species)}
            </Text>
          </View>
          <View style={styles.animalBody}>
            <Text
              style={[styles.animalTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name ?? item.tagId}
            </Text>
            <Text
              style={[styles.animalMeta, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {item.tagId} · {subtitle}
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
    [colors, openAnimal, t],
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

  if (!herd) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("herd_not_found")}
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

  return (
    <Screen
      scroll={false}
      footer={
        <View style={styles.footerRow}>
          <BigButton
            label={t("edit")}
            onPress={onEdit}
            variant="primary"
            style={styles.footerButton}
          />
          <BigButton
            label={t("delete")}
            onPress={onDelete}
            variant="danger"
            style={styles.footerButton}
          />
        </View>
      }
    >
      <FlatList
        data={animals}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <View>
            <View style={styles.headerBlock}>
              <Text style={[styles.title, { color: colors.text }]}>
                {herd.name}
              </Text>
            </View>

            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <InfoRow
                label={t("herd_species")}
                value={t(keyForSpecies(herd.species))}
              />
              <InfoRow
                label={t("herd_breed")}
                value={herd.breed ?? t("not_set")}
              />
              <InfoRow
                label={t("herd_purpose")}
                value={t(keyForPurpose(herd.purpose))}
              />
              <InfoRow
                label={t("herd_animal_count")}
                value={String(animals.length)}
              />
              {herd.notes ? (
                <InfoRow label={t("herd_notes")} value={herd.notes} />
              ) : null}
            </View>

            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              {t("herd_members")}
            </Text>

            {animals.length === 0 ? (
              <View style={styles.emptyAnimals}>
                <Text style={styles.emptyIcon}>🐄</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {t("no_animals_hint")}
                </Text>
                <BigButton
                  label={t("add_first_animal")}
                  onPress={addAnimal}
                  variant="secondary"
                  style={styles.stretch}
                />
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {animals.length > 0 ? (
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
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },
  listContent: { padding: spacing.md, gap: spacing.md },
  headerBlock: { marginBottom: spacing.lg },
  title: { ...typography.h1 },
  infoCard: {
    borderRadius: 20,
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
  sectionHeading: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  emptyAnimals: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyIcon: { fontSize: 56 },
  emptySub: { ...typography.body, textAlign: "center" },
  animalRow: {
    minHeight: TOUCH_TARGET + 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  animalIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  animalIconText: { fontSize: 28 },
  animalBody: { flex: 1, gap: 2 },
  animalTitle: { ...typography.bodyBold },
  animalMeta: { ...typography.caption },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  chevron: { fontSize: 32, paddingHorizontal: spacing.sm },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
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
