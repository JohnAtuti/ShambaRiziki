import React, { useCallback, useState } from "react";
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
  farmRepo,
  ValidationError,
  type Currency,
  type FarmType,
  type SizeUnit,
} from "../db";

export const FarmSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, refreshActiveFarm } = useAppState();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [size, setSize] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("acre");
  const [farmType, setFarmType] = useState<FarmType>("mixed");
  const [currency, setCurrency] = useState<Currency>("KES");

  const [nameError, setNameError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!name.trim()) {
      setNameError(t("required"));
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

    return ok;
  }, [name, size, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const parsedSize = size.trim() ? Number(size.replace(",", ".")) : null;

      await farmRepo.create(ctx, {
        name: name.trim(),
        location: location.trim() || null,
        size: parsedSize,
        sizeUnit,
        farmType,
        currency,
      });

      await refreshActiveFarm();
    } catch (err) {
      const message =
        err instanceof ValidationError ? err.message : t("create_farm_error");
      setSubmitError(message);
      if (__DEV__) {
        console.warn("[FarmSetup] create failed", err);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    name,
    location,
    size,
    sizeUnit,
    farmType,
    currency,
    validate,
    refreshActiveFarm,
    t,
  ]);

  return (
    <Screen
      footer={
        <BigButton
          label={t("create_farm")}
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={submitting}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("onboarding_title")}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {t("onboarding_subtitle")}
        </Text>
      </View>

      <FormField
        label={t("farm_name")}
        hint={t("farm_name_hint")}
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
        label={t("farm_location")}
        hint={t("farm_location_hint")}
        value={location}
        onChangeText={setLocation}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={200}
        returnKeyType="next"
      />

      <FormField
        label={t("farm_size")}
        hint={t("farm_size_hint")}
        value={size}
        onChangeText={setSize}
        error={sizeError}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="done"
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

      <SelectField<FarmType>
        label={t("farm_type")}
        value={farmType}
        onChange={setFarmType}
        options={[
          { value: "crops", label: t("type_crops"), icon: "🌱" },
          { value: "livestock", label: t("type_livestock"), icon: "🐄" },
          { value: "poultry", label: t("type_poultry"), icon: "🐔" },
          { value: "aquaculture", label: t("type_aquaculture"), icon: "🐟" },
          { value: "mixed", label: t("type_mixed"), icon: "🌾" },
          { value: "apiary", label: t("type_apiary"), icon: "🐝" },
        ]}
      />

      <SelectField<Currency>
        label={t("currency")}
        value={currency}
        onChange={setCurrency}
        options={[
          { value: "KES", label: t("currency_kes") },
          { value: "TZS", label: t("currency_tzs") },
          { value: "UGX", label: t("currency_ugx") },
          { value: "USD", label: t("currency_usd") },
          { value: "EUR", label: t("currency_eur") },
        ]}
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
  header: { marginBottom: spacing.lg },
  title: { ...typography.h1, marginBottom: spacing.xs },
  sub: { ...typography.body },
  submitError: {
    ...typography.caption,
    marginBottom: spacing.md,
    textAlign: "center",
  },
});
