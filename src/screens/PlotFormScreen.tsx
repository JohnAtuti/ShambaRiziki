import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
  plotRepo,
  ValidationError,
  type Fertility,
  type PlotUse,
  type SizeUnit,
  type Slope,
  type SoilType,
  type TenureType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

const SOIL_OPTIONS: readonly { value: SoilType; key: string }[] = [
  { value: "clay", key: "soil_clay" },
  { value: "sandy", key: "soil_sandy" },
  { value: "loam", key: "soil_loam" },
  { value: "silt", key: "soil_silt" },
  { value: "peat", key: "soil_peat" },
  { value: "chalk", key: "soil_chalk" },
  { value: "other", key: "soil_other" },
];

const FERT_OPTIONS: readonly { value: Fertility; key: string }[] = [
  { value: "low", key: "fert_low" },
  { value: "medium", key: "fert_medium" },
  { value: "high", key: "fert_high" },
];

const SLOPE_OPTIONS: readonly { value: Slope; key: string }[] = [
  { value: "flat", key: "slope_flat" },
  { value: "gentle", key: "slope_gentle" },
  { value: "moderate", key: "slope_moderate" },
  { value: "steep", key: "slope_steep" },
];

const TENURE_OPTIONS: readonly { value: TenureType; key: string }[] = [
  { value: "owned", key: "tenure_owned" },
  { value: "leased", key: "tenure_leased" },
  { value: "rented", key: "tenure_rented" },
  { value: "communal", key: "tenure_communal" },
];

const USE_OPTIONS: readonly { value: PlotUse; key: string; icon: string }[] = [
  { value: "crops", key: "use_crops", icon: "🌱" },
  { value: "livestock", key: "use_livestock", icon: "🐄" },
  { value: "fallow", key: "use_fallow", icon: "🛌" },
  { value: "mixed", key: "use_mixed", icon: "🌾" },
  { value: "none", key: "use_none", icon: "⬜" },
];

type Mode = "create" | "edit";

export const PlotFormScreen: React.FC<RootStackScreenProps<"PlotForm">> = ({
  route,
  navigation,
}) => {
  const { plotId } = route.params ?? {};
  const mode: Mode = plotId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm, refreshActiveFarm } = useAppState();

  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("acre");
  const [locationText, setLocationText] = useState("");
  const [soilType, setSoilType] = useState<SoilType>("loam");
  const [soilPh, setSoilPh] = useState("");
  const [fertility, setFertility] = useState<Fertility>("medium");
  const [slope, setSlope] = useState<Slope>("flat");
  const [tenureType, setTenureType] = useState<TenureType>("owned");
  const [currentUse, setCurrentUse] = useState<PlotUse>("crops");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [phError, setPhError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  // Hydrate the form when editing. All setState calls happen after the
  // first await, so this is the same documented false positive as
  // AppStateContext.
  useEffect(() => {
    if (mode !== "edit" || !ctx || !plotId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await plotRepo.getById(ctx, plotId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setSize(existing.size != null ? String(existing.size) : "");
        setSizeUnit(existing.sizeUnit);
        setLocationText(existing.locationText ?? "");
        setSoilType(existing.soilType ?? "loam");
        setSoilPh(existing.soilPh != null ? String(existing.soilPh) : "");
        setFertility(existing.fertility ?? "medium");
        setSlope(existing.slope ?? "flat");
        setTenureType(existing.tenureType);
        setCurrentUse(existing.currentUse);
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) {
          console.warn("[PlotForm] hydrate failed", err);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, plotId]);

  const soilOptions = useMemo(
    () =>
      SOIL_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
      })),
    [t],
  );
  const fertOptions = useMemo(
    () =>
      FERT_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
      })),
    [t],
  );
  const slopeOptions = useMemo(
    () =>
      SLOPE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
      })),
    [t],
  );
  const tenureOptions = useMemo(
    () =>
      TENURE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
      })),
    [t],
  );
  const useOptions = useMemo(
    () =>
      USE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
        icon: o.icon,
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!name.trim()) {
      setNameError(t("plot_name_required"));
      ok = false;
    } else {
      setNameError(null);
    }

    if (size.trim()) {
      const parsed = Number(size.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setSizeError(t("invalid_number"));
        ok = false;
      } else {
        setSizeError(null);
      }
    } else {
      setSizeError(null);
    }

    if (soilPh.trim()) {
      const parsed = Number(soilPh.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 14) {
        setPhError(t("invalid_number"));
        ok = false;
      } else {
        setPhError(null);
      }
    } else {
      setPhError(null);
    }

    return ok;
  }, [name, size, soilPh, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parsedSize = size.trim() ? Number(size.replace(",", ".")) : null;
    const parsedPh = soilPh.trim() ? Number(soilPh.replace(",", ".")) : null;

    try {
      if (mode === "create" && activeFarm) {
        await plotRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          size: parsedSize,
          sizeUnit,
          locationText: locationText.trim() || null,
          soilType,
          soilPh: parsedPh,
          fertility,
          slope,
          tenureType,
          currentUse,
          notes: notes.trim() || null,
        });
        await refreshActiveFarm();
      } else if (mode === "edit" && plotId) {
        await plotRepo.update(ctx, plotId, {
          name: name.trim(),
          size: parsedSize,
          sizeUnit,
          locationText: locationText.trim() || null,
          soilType,
          soilPh: parsedPh,
          fertility,
          slope,
          tenureType,
          currentUse,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_plot_error" : "update_plot_error");
      setSubmitError(message);
      if (__DEV__) {
        console.warn("[PlotForm] submit failed", err);
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
    name,
    size,
    sizeUnit,
    locationText,
    soilType,
    soilPh,
    fertility,
    slope,
    tenureType,
    currentUse,
    notes,
    navigation,
    refreshActiveFarm,
    t,
  ]);

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

  const submitLabel = mode === "create" ? t("create_plot") : t("update_plot");

  return (
    <Screen
      footer={
        <BigButton
          label={submitLabel}
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={submitting}
        />
      }
    >
      <FormField
        label={t("plot_name")}
        hint={t("plot_name_hint")}
        value={name}
        onChangeText={setName}
        error={nameError}
        required
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <FormField
        label={t("plot_size")}
        hint={t("plot_size_hint")}
        value={size}
        onChangeText={setSize}
        error={sizeError}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="next"
      />

      <SelectField<SizeUnit>
        label={t("size_unit")}
        value={sizeUnit}
        onChange={setSizeUnit}
        options={[
          { value: "acre", label: t("acre"), icon: "🟩" },
          { value: "hectare", label: t("hectare"), icon: "🟦" },
        ]}
      />

      <FormField
        label={t("plot_location")}
        hint={t("plot_location_hint")}
        value={locationText}
        onChangeText={setLocationText}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={200}
        returnKeyType="next"
      />

      <SelectField<SoilType>
        label={t("soil_type")}
        value={soilType}
        onChange={setSoilType}
        options={soilOptions}
      />

      <FormField
        label={t("soil_ph")}
        hint={t("soil_ph_hint")}
        value={soilPh}
        onChangeText={setSoilPh}
        error={phError}
        keyboardType="decimal-pad"
        maxLength={5}
        returnKeyType="next"
      />

      <SelectField<Fertility>
        label={t("fertility")}
        value={fertility}
        onChange={setFertility}
        options={fertOptions}
      />

      <SelectField<Slope>
        label={t("slope")}
        value={slope}
        onChange={setSlope}
        options={slopeOptions}
      />

      <SelectField<TenureType>
        label={t("tenure")}
        value={tenureType}
        onChange={setTenureType}
        options={tenureOptions}
      />

      <SelectField<PlotUse>
        label={t("current_use")}
        value={currentUse}
        onChange={setCurrentUse}
        options={useOptions}
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
  },
  loadingText: { ...typography.body },
  submitError: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
