import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
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

  const [cropError, setCropError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const cropsForFarm = await cropRepo.listByFarm(ctx, activeFarm.id);
        if (cancelled) return;
        setCrops(cropsForFarm);

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
        if (__DEV__) {
          console.warn("[CycleForm] hydrate failed", err);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, cycleId]);

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

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!cropId) {
      setCropError(t("required"));
      ok = false;
    } else {
      setCropError(null);
    }

    if (!plantingDate.trim()) {
      setDateError(t("planting_date_required"));
      ok = false;
    } else {
      const parsed = new Date(plantingDate.trim());
      if (Number.isNaN(parsed.getTime())) {
        setDateError(t("invalid_number"));
        ok = false;
      } else {
        setDateError(null);
      }
    }

    return ok;
  }, [cropId, plantingDate, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (!cropId) return;

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
      if (__DEV__) {
        console.warn("[CycleForm] submit failed", err);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
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
                if (__DEV__) {
                  console.warn("[CycleForm] delete failed", err);
                }
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
    <Screen
      footer={
        <View style={styles.footerRow}>
          {mode === "edit" ? (
            <BigButton
              label={t("delete")}
              onPress={onDelete}
              variant="danger"
              style={styles.footerButton}
            />
          ) : null}
          <BigButton
            label={submitLabel}
            onPress={() => void onSubmit()}
            loading={submitting}
            disabled={submitting}
            style={styles.footerButton}
          />
        </View>
      }
    >
      <SelectField<string>
        label={t("crop_singular")}
        value={cropId}
        onChange={setCropId}
        options={cropOptions}
        error={cropError}
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
        returnKeyType="next"
      />

      <FormField
        label={t("planting_date")}
        hint="2026-03-15"
        value={plantingDate}
        onChangeText={setPlantingDate}
        error={dateError}
        required
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <SelectField<PlantingMethod>
        label={t("planting_method")}
        value={plantingMethod}
        onChange={setPlantingMethod}
        options={methodOptions}
      />

      <FormField
        label={t("expected_harvest_date")}
        hint="2026-07-15"
        value={expectedHarvestDate}
        onChangeText={setExpectedHarvestDate}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <SelectField<CycleStatus>
        label={t("cycle_status")}
        value={status}
        onChange={setStatus}
        options={statusOptions}
      />

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
        returnKeyType="next"
      />

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

      {submitError ? (
        <Text style={[styles.submitError, { color: colors.danger }]}>
          {submitError}
        </Text>
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
  submitError: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
