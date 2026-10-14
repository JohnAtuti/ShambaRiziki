import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  animalBreedingRepo,
  animalFeedingRepo,
  animalHealthRepo,
  animalProductionRepo,
  animalRepo,
  herdRepo,
  reportsRepo,
  windowForPeriod,
  type Animal,
  type AnimalBreedingRecord,
  type AnimalEconomics,
  type AnimalFeedRecord,
  type AnimalHealthRecord,
  type AnimalProductionRecord,
  type Herd,
  type ProductionType,
} from "../db";
import {
  colorForAnimalStatus,
  iconForBreedingType,
  iconForFeedType,
  iconForHealthType,
  iconForProductionType,
  iconForSpecies,
  keyForAnimalStatus,
  keyForBreedingType,
  keyForFeedType,
  keyForHealthType,
  keyForProductionType,
  keyForSex,
} from "../utils/livestockLabels";
import { formatMoney, formatMoneyDecimal } from "../utils/money";
import type { RootStackScreenProps } from "../navigation/types";

type TimelineEntry =
  | { kind: "health"; date: string; record: AnimalHealthRecord }
  | { kind: "breeding"; date: string; record: AnimalBreedingRecord }
  | { kind: "feeding"; date: string; record: AnimalFeedRecord }
  | { kind: "production"; date: string; record: AnimalProductionRecord };

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

const QuickAdd: React.FC<{
  emoji: string;
  label: string;
  onPress: () => void;
}> = ({ emoji, label, onPress }) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.quickAdd,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={styles.quickAddEmoji}>{emoji}</Text>
      <Text style={[styles.quickAddLabel, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
};

const dominantProductionType = (
  records: readonly AnimalProductionRecord[],
): ProductionType | null => {
  if (records.length === 0) return null;
  const counts = new Map<ProductionType, number>();
  for (const r of records) {
    counts.set(r.productionType, (counts.get(r.productionType) ?? 0) + 1);
  }
  let best: ProductionType = records[0].productionType;
  let bestCount = 0;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
};

export const AnimalDetailScreen: React.FC<
  RootStackScreenProps<"AnimalDetail">
> = ({ route, navigation }) => {
  const { animalId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [herd, setHerd] = useState<Herd | null>(null);
  const [health, setHealth] = useState<AnimalHealthRecord[]>([]);
  const [breeding, setBreeding] = useState<AnimalBreedingRecord[]>([]);
  const [feeding, setFeeding] = useState<AnimalFeedRecord[]>([]);
  const [production, setProduction] = useState<AnimalProductionRecord[]>([]);
  const [economics, setEconomics] = useState<AnimalEconomics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    try {
      const loaded = await animalRepo.getById(ctx, animalId);
      if (!loaded) {
        setAnimal(null);
        setLoading(false);
        return;
      }
      const [loadedHerd, h, b, f, p] = await Promise.all([
        loaded.herdId
          ? herdRepo.getById(ctx, loaded.herdId)
          : Promise.resolve(null),
        animalHealthRepo.listByAnimal(ctx, animalId),
        animalBreedingRepo.listByAnimal(ctx, animalId),
        animalFeedingRepo.listByAnimal(ctx, animalId),
        animalProductionRepo.listByAnimal(ctx, animalId),
      ]);
      setAnimal(loaded);
      setHerd(loadedHerd);
      setHealth(h);
      setBreeding(b);
      setFeeding(f);
      setProduction(p);

      // Economics — fetched separately so a failure here does not lose the
      // animal's main data. Uses the animal's most-recorded production type,
      // so a dairy cow shows milk economics and a layer shows eggs.
      const dominant = dominantProductionType(p);
      if (dominant) {
        try {
          const econ = await reportsRepo.getAnimalEconomics(
            ctx,
            activeFarm.id,
            animalId,
            dominant,
            windowForPeriod("all_time"),
          );
          setEconomics(econ);
        } catch (econErr) {
          if (__DEV__) {
            console.warn("[AnimalDetail] econ failed", econErr);
          }
          setEconomics(null);
        }
      } else {
        setEconomics(null);
      }
    } catch (err) {
      if (__DEV__) console.warn("[AnimalDetail] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, animalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (animal) {
      navigation.setOptions({ title: animal.name ?? animal.tagId });
    }
  }, [animal, navigation]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...health.map((r) => ({
        kind: "health" as const,
        date: r.recordDate,
        record: r,
      })),
      ...breeding.map((r) => ({
        kind: "breeding" as const,
        date: r.recordDate,
        record: r,
      })),
      ...feeding.map((r) => ({
        kind: "feeding" as const,
        date: r.recordDate,
        record: r,
      })),
      ...production.map((r) => ({
        kind: "production" as const,
        date: r.recordDate,
        record: r,
      })),
    ];
    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return entries;
  }, [health, breeding, feeding, production]);

  const onEdit = useCallback((): void => {
    navigation.navigate("AnimalForm", { animalId });
  }, [navigation, animalId]);

  const goHealth = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("AnimalHealthForm", { animalId });
  }, [navigation, animalId]);

  const goBreeding = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("AnimalBreedingForm", { animalId });
  }, [navigation, animalId]);

  const goFeeding = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("AnimalFeedForm", { animalId });
  }, [navigation, animalId]);

  const goProduction = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate("AnimalProductionForm", { animalId });
  }, [navigation, animalId]);

  const openEntry = useCallback(
    (entry: TimelineEntry): void => {
      Haptics.selectionAsync().catch(() => {});
      if (entry.kind === "health") {
        navigation.navigate("AnimalHealthForm", {
          animalId,
          recordId: entry.record.id,
        });
      } else if (entry.kind === "breeding") {
        navigation.navigate("AnimalBreedingForm", {
          animalId,
          recordId: entry.record.id,
        });
      } else if (entry.kind === "feeding") {
        navigation.navigate("AnimalFeedForm", {
          animalId,
          recordId: entry.record.id,
        });
      } else {
        navigation.navigate("AnimalProductionForm", {
          animalId,
          recordId: entry.record.id,
        });
      }
    },
    [navigation, animalId],
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

  if (!animal) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("animal_not_found")}
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

  const dob = animal.dateOfBirth
    ? animal.dateOfBirth.slice(0, 10)
    : t("not_set");
  const bcsValue =
    animal.bodyConditionScore != null
      ? animal.bodyConditionScore.toFixed(1)
      : t("not_set");

  const currency = activeFarm?.currency ?? "KES";
  const showEcon = economics !== null && production.length > 0;
  const econHasYield = economics !== null && economics.yieldQty > 0;
  const econMixed = economics?.yieldUnitsMixed === true;

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
        <View style={styles.headerBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>
              {iconForSpecies(animal.species)}
            </Text>
            <View style={styles.titleText}>
              <Text style={[styles.title, { color: colors.text }]}>
                {animal.name ?? animal.tagId}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {animal.tagId}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: colorForAnimalStatus(animal.status) },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {t(keyForAnimalStatus(animal.status))}
              </Text>
            </View>
          </View>
        </View>

        {showEcon && economics ? (
          <View
            style={[
              styles.econCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.econHeadingRow}>
              <Text style={[styles.econHeading, { color: colors.textMuted }]}>
                {t("finance_econ_heading")}
              </Text>
              <Text style={styles.econHeadingIcon}>
                {iconForProductionType(economics.productionType)}
              </Text>
              <Text
                style={[styles.econHeadingType, { color: colors.textMuted }]}
              >
                {t(keyForProductionType(economics.productionType))}
              </Text>
            </View>
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

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <InfoRow label={t("animal_sex")} value={t(keyForSex(animal.sex))} />
          <InfoRow
            label={t("animal_breed")}
            value={animal.breed ?? t("not_set")}
          />
          <InfoRow label={t("animal_date_of_birth")} value={dob} />
          <InfoRow
            label={t("animal_herd")}
            value={herd ? herd.name : t("unassigned")}
          />
          <InfoRow label={t("animal_bcs")} value={bcsValue} />
          {animal.notes ? (
            <InfoRow label={t("animal_notes")} value={animal.notes} />
          ) : null}
        </View>

        <Text style={[styles.sectionHeading, { color: colors.text }]}>
          {t("add_activity")}
        </Text>

        <View style={styles.quickAddRow}>
          <QuickAdd emoji="🩺" label={t("health_records")} onPress={goHealth} />
          <QuickAdd
            emoji="💕"
            label={t("breeding_records")}
            onPress={goBreeding}
          />
        </View>
        <View style={styles.quickAddRow}>
          <QuickAdd emoji="🌾" label={t("feed_records")} onPress={goFeeding} />
          <QuickAdd
            emoji="🥛"
            label={t("production_records")}
            onPress={goProduction}
          />
        </View>

        <Text style={[styles.sectionHeading, { color: colors.text }]}>
          {t("activities")}
        </Text>

        {timeline.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {t("no_activities_hint")}
            </Text>
          </View>
        ) : (
          timeline.map((entry) => {
            const date = entry.date.slice(0, 10);
            let icon = "📝";
            let label = "";
            if (entry.kind === "health") {
              icon = iconForHealthType(entry.record.recordType);
              label = t(keyForHealthType(entry.record.recordType));
            } else if (entry.kind === "breeding") {
              icon = iconForBreedingType(entry.record.recordType);
              label = t(keyForBreedingType(entry.record.recordType));
            } else if (entry.kind === "feeding") {
              icon = iconForFeedType(entry.record.feedType);
              label = t(keyForFeedType(entry.record.feedType));
            } else {
              icon = iconForProductionType(entry.record.productionType);
              label = t(keyForProductionType(entry.record.productionType));
            }
            return (
              <Pressable
                key={`${entry.kind}-${entry.record.id}`}
                onPress={() => openEntry(entry)}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${date}`}
                style={({ pressed }) => [
                  styles.timelineRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.timelineIcon,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <Text style={styles.timelineIconText}>{icon}</Text>
                </View>
                <View style={styles.timelineBody}>
                  <Text style={[styles.timelineTitle, { color: colors.text }]}>
                    {label}
                  </Text>
                  <Text
                    style={[styles.timelineMeta, { color: colors.textMuted }]}
                  >
                    {date}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colors.textMuted }]}>
                  ›
                </Text>
              </Pressable>
            );
          })
        )}
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

  headerBlock: { marginBottom: spacing.lg },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  titleEmoji: { fontSize: 56 },
  titleText: { flex: 1, gap: 2 },
  title: { ...typography.h1 },
  subtitle: { ...typography.body },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  econCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  econHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  econHeading: {
    ...typography.label,
    textTransform: "uppercase",
  },
  econHeadingIcon: { fontSize: 18 },
  econHeadingType: { ...typography.label },
  econRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  econLabel: { ...typography.body },
  econValue: { ...typography.bodyBold },

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

  sectionHeading: { ...typography.h3, marginBottom: spacing.md },
  quickAddRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  quickAdd: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 96,
    justifyContent: "center",
  },
  quickAddEmoji: { fontSize: 32 },
  quickAddLabel: { ...typography.caption, textAlign: "center" },

  emptyTimeline: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 56 },
  emptySub: { ...typography.body, textAlign: "center" },

  timelineRow: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  timelineIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineIconText: { fontSize: 24 },
  timelineBody: { flex: 1, gap: 2 },
  timelineTitle: { ...typography.bodyBold },
  timelineMeta: { ...typography.caption },
  chevron: { fontSize: 32, paddingHorizontal: spacing.sm },
});
