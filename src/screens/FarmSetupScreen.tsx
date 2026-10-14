import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;

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
      if (__DEV__) console.warn("[FarmSetup] create failed", err);
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
    refreshActiveFarm,
    t,
  ]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "step_farm_identity",
        hintKey: "step_farm_identity_hint",
        icon: "🏡",
        validate: () => name.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("farm_name")}
              hint={t("farm_name_hint")}
              value={name}
              onChangeText={setName}
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
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "size",
        titleKey: "step_farm_size",
        hintKey: "step_farm_size_hint",
        icon: "📏",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("farm_size")}
              hint={t("farm_size_hint")}
              value={size}
              onChangeText={setSize}
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
            <SelectField<FarmType>
              label={t("farm_type")}
              value={farmType}
              onChange={setFarmType}
              options={[
                { value: "crops", label: t("type_crops"), icon: "🌱" },
                { value: "livestock", label: t("type_livestock"), icon: "🐄" },
                { value: "poultry", label: t("type_poultry"), icon: "🐔" },
                {
                  value: "aquaculture",
                  label: t("type_aquaculture"),
                  icon: "🐟",
                },
                { value: "mixed", label: t("type_mixed"), icon: "🌾" },
                { value: "apiary", label: t("type_apiary"), icon: "🐝" },
              ]}
            />
          </>
        ),
      },
      {
        id: "currency",
        titleKey: "step_farm_currency",
        hintKey: "step_farm_currency_hint",
        icon: "💰",
        validate: () => true,
        render: () => (
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
        ),
      },
    ],
    [t, name, location, size, sizeUnit, farmType, currency],
  );

  return (
    <Screen scroll={false} contentStyle={styles.noPadding}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("onboarding_title")}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {t("onboarding_subtitle")}
        </Text>
      </View>
      <WizardForm
        steps={steps}
        onSubmit={onSubmit}
        submitting={submitting}
        submitLabel={t("create_farm")}
        errorMessage={submitError}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  noPadding: { padding: 0 },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  title: { ...typography.h1, textAlign: "center" },
  sub: { ...typography.body, textAlign: "center" },
});
