import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DateField } from "../components/DateField";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  cropCycleRepo,
  cropRepo,
  ValidationError,
  type Crop,
  type CycleStatus,
  type PlantingMethod,
} from "../db";
import {
  iconForStatus,
  keyForMethod,
  keyForStatus,
  METHOD_VALUES,
  STATUS_VALUES,
} from "../utils/cropLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const CycleFormScreen: React.FC<RootStackScreenProps<"CycleForm">> = ({
  route,
  navigation,
}) => {
  const { plotId, cycleId } = route.params ?? {};
  const mode: Mode = cycleId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  // ---- Form state ----
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropId, setCropId] = useState("");
  const [cycleName, setCycleName] = useState("");
  const [plantingDate, setPlantingDate] = useState("");
  const [plantingMethod, setPlantingMethod] =
    useState<PlantingMethod>("direct_sowing");
  const [expectedHarvestDate, setExpectedHarvestDate] = useState("");
  const [status, setStatus] = useState<CycleStatus>("planned");
  const [seedSource, setSeedSource] = useState("");
  const [seedQuantity, setSeedQuantity] = useState("");
  const [seedUnit, setSeedUnit] = useState("");
  const [expectedYield, setExpectedYield] = useState("");
  const [expectedYieldUnit, setExpectedYieldUnit] = useState("");
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // ---- Hydrate ----
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const cropRows = await cropRepo.listByFarm(ctx, activeFarm.id);
        if (cancelled) return;
        setCrops(cropRows);

        if (mode === "edit" && cycleId) {
          const existing = await cropCycleRepo.getById(ctx, cycleId);
          if (cancelled || !existing) return;
          setCropId(existing.cropId);
          setCycleName(existing.cycleName ?? "");
          setPlantingDate(existing.plantingDate.slice(0, 10));
          setPlantingMethod(existing.plantingMethod);
          setExpectedHarvestDate(
            existing.expectedHarvestDate
              ? existing.expectedHarvestDate.slice(0, 10)
              : "",
          );
          setStatus(existing.status);
          setSeedSource(existing.seedSource ?? "");
          setSeedQuantity(
            existing.seedQuantity != null ? String(existing.seedQuantity) : "",
          );
          setSeedUnit(existing.seedUnit ?? "");
          setExpectedYield(
            existing.expectedYield != null
              ? String(existing.expectedYield)
              : "",
          );
          setExpectedYieldUnit(existing.expectedYieldUnit ?? "");
          setNotes(existing.notes ?? "");
        }
      } catch (err) {
        if (__DEV__) console.warn("[CycleForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, cycleId]);

  // ---- Option lists ----
  const cropOptions = useMemo(
    () =>
      crops.map((crop) => ({
        value: crop.id,
        label: crop.variety ? `${crop.name} — ${crop.variety}` : crop.name,
      })),
    [crops],
  );

  const statusOptions = useMemo(
    () =>
      STATUS_VALUES.map((value) => ({
        value,
        label: t(keyForStatus(value)),
        icon: iconForStatus(value),
      })),
    [t],
  );

  const methodOptions = useMemo(
    () =>
      METHOD_VALUES.map((value) => ({
        value,
        label: t(keyForMethod(value)),
      })),
    [t],
  );

  // ---- Submit ----
  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!cropId) return;
    if (mode === "create" && (!activeFarm || !plotId)) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoPlanting = new Date(plantingDate.trim()).toISOString();
    const isoExpectedHarvest = expectedHarvestDate.trim()
      ? new Date(expectedHarvestDate.trim()).toISOString()
      : null;
    const parsedSeed = seedQuantity.trim()
      ? Number(seedQuantity.replace(",", "."))
      : null;
    const parsedYield = expectedYield.trim()
      ? Number(expectedYield.replace(",", "."))
      : null;

    try {
      if (mode === "create" && activeFarm && plotId) {
        await cropCycleRepo.create(ctx, {
          farmId: activeFarm.id,
          plotId,
          cropId,
          cycleName: cycleName.trim() || null,
          plantingDate: isoPlanting,
          plantingMethod,
          expectedHarvestDate: isoExpectedHarvest,
          status,
          seedSource: seedSource.trim() || null,
          seedQuantity: parsedSeed,
          seedUnit: seedUnit.trim() || null,
          expectedYield: parsedYield,
          expectedYieldUnit: expectedYieldUnit.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && cycleId) {
        await cropCycleRepo.update(ctx, cycleId, {
          cycleName: cycleName.trim() || null,
          plantingDate: isoPlanting,
          plantingMethod,
          expectedHarvestDate: isoExpectedHarvest,
          status,
          seedSource: seedSource.trim() || null,
          seedQuantity: parsedSeed,
          seedUnit: seedUnit.trim() || null,
          expectedYield: parsedYield,
          expectedYieldUnit: expectedYieldUnit.trim() || null,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_cycle_error" : "update_cycle_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[CycleForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    plotId,
    cycleId,
    cropId,
    cycleName,
    plantingDate,
    plantingMethod,
    expectedHarvestDate,
    status,
    seedSource,
    seedQuantity,
    seedUnit,
    expectedYield,
    expectedYieldUnit,
    notes,
    navigation,
    t,
  ]);

  // ---- Wizard steps ----
  // Grouping mirrors how a farmer thinks about planting a crop:
  //   what → when → when we expect to harvest → where the seed came from → optional extras.
  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "crop",
        titleKey: "cycle_step_crop",
        hintKey: "cycle_step_crop_hint",
        icon: "🌾",
        validate: () => cropId !== "",
        render: () => (
          <>
            <SelectField<string>
              label={t("crop_singular")}
              value={cropId}
              onChange={setCropId}
              options={cropOptions}
              required
            />
            <FormField
              label={t("cycle_name")}
              hint={t("cycle_name_hint")}
              value={cycleName}
              onChangeText={setCycleName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "planting",
        titleKey: "cycle_step_planting",
        hintKey: "cycle_step_planting_hint",
        icon: "🌱",
        validate: () => {
          const s = plantingDate.trim();
          if (!s) return false;
          const d = new Date(s);
          return !Number.isNaN(d.getTime());
        },
        render: () => (
          <>
            <DateField
              label={t("planting_date")}
              value={plantingDate}
              onChange={setPlantingDate}
              required
              clearable={false}
            />
            <SelectField<PlantingMethod>
              label={t("planting_method")}
              value={plantingMethod}
              onChange={setPlantingMethod}
              options={methodOptions}
            />
          </>
        ),
      },
      {
        id: "harvest",
        titleKey: "cycle_step_harvest",
        hintKey: "cycle_step_harvest_hint",
        icon: "🌾",
        validate: () => true, // all optional
        isOptional: true,
        render: () => (
          <>
            <DateField
              label={t("expected_harvest_date")}
              value={expectedHarvestDate}
              onChange={setExpectedHarvestDate}
            />
            <SelectField<CycleStatus>
              label={t("cycle_status")}
              value={status}
              onChange={setStatus}
              options={statusOptions}
            />
          </>
        ),
      },
      {
        id: "seed",
        titleKey: "cycle_step_seed",
        hintKey: "cycle_step_seed_hint",
        icon: "🌰",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("seed_source")}
              hint={t("seed_source_hint")}
              value={seedSource}
              onChangeText={setSeedSource}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={200}
              returnKeyType="next"
            />
            <FormField
              label={t("seed_quantity")}
              hint={t("seed_quantity_hint")}
              value={seedQuantity}
              onChangeText={setSeedQuantity}
              keyboardType="decimal-pad"
              maxLength={10}
              returnKeyType="next"
            />
            <FormField
              label={t("seed_unit")}
              hint="kg, g, seeds"
              value={seedUnit}
              onChangeText={setSeedUnit}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "cycle_step_extras",
        hintKey: "cycle_step_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("expected_yield")}
              hint={t("expected_yield_hint")}
              value={expectedYield}
              onChangeText={setExpectedYield}
              keyboardType="decimal-pad"
              maxLength={10}
              returnKeyType="next"
            />
            <FormField
              label={t("expected_yield_unit")}
              hint="kg, tonnes, bags"
              value={expectedYieldUnit}
              onChangeText={setExpectedYieldUnit}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="next"
            />
            <FormField
              label={t("plot_notes")}
              hint={t("plot_notes_hint")}
              value={notes}
              onChangeText={setNotes}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={500}
              returnKeyType="done"
            />
          </>
        ),
      },
    ],
    [
      t,
      cropId,
      cropOptions,
      cycleName,
      plantingDate,
      plantingMethod,
      methodOptions,
      expectedHarvestDate,
      status,
      statusOptions,
      seedSource,
      seedQuantity,
      seedUnit,
      expectedYield,
      expectedYieldUnit,
      notes,
    ],
  );

  // ---- Cancel from step 1 ----
  const onCancel = useCallback((): void => {
    if (mode === "edit") {
      Alert.alert(t("cancel_edits_title"), t("cancel_edits_message"), [
        { text: t("no"), style: "cancel" },
        { text: t("yes"), onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  }, [mode, navigation, t]);

  // ---- Delete button (edit mode) ----
  const onDelete = useCallback((): void => {
    if (!ctx || !cycleId) return;
    Alert.alert(
      t("delete_cycle_title"),
      t("delete_cycle_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await cropCycleRepo.softDelete(ctx, cycleId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[CycleForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, cycleId, navigation, t]);

  if (hydrating) {
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
            onPress={() => navigation.navigate("Crops")}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  const submitLabel = mode === "create" ? t("create_cycle") : t("update_cycle");

  return (
    <Screen scroll={false} contentStyle={styles.noPadding}>
      <WizardForm
        steps={steps}
        onSubmit={onSubmit}
        submitting={submitting}
        submitLabel={submitLabel}
        onCancel={onCancel}
        errorMessage={submitError}
      />
      {mode === "edit" ? (
        <View
          style={[
            styles.deleteRow,
            { borderTopColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <BigButton
            label={t("delete")}
            onPress={onDelete}
            variant="danger"
            style={styles.deleteBtn}
          />
        </View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  noPadding: { padding: 0 },
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
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
