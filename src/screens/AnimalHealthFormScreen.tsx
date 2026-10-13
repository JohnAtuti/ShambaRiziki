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
  animalHealthRepo,
  ValidationError,
  type HealthRecordType,
} from "../db";
import {
  HEALTH_TYPE_VALUES,
  iconForHealthType,
  keyForHealthType,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const AnimalHealthFormScreen: React.FC<
  RootStackScreenProps<"AnimalHealthForm">
> = ({ route, navigation }) => {
  const { animalId, recordId } = route.params;
  const mode: Mode = recordId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [recordType, setRecordType] = useState<HealthRecordType>("vaccination");
  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [productName, setProductName] = useState("");
  const [dosage, setDosage] = useState("");
  const [dosageUnit, setDosageUnit] = useState("");
  const [administeredBy, setAdministeredBy] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [cost, setCost] = useState("");
  const [costCurrency, setCostCurrency] = useState("KES");
  const [withdrawalDays, setWithdrawalDays] = useState("");
  const [notes, setNotes] = useState("");

  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !recordId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await animalHealthRepo.getById(ctx, recordId);
        if (cancelled || !existing) return;
        setRecordType(existing.recordType);
        setRecordDate(existing.recordDate.slice(0, 10));
        setProductName(existing.productName ?? "");
        setDosage(existing.dosage != null ? String(existing.dosage) : "");
        setDosageUnit(existing.dosageUnit ?? "");
        setAdministeredBy(existing.administeredBy ?? "");
        setDiagnosis(existing.diagnosis ?? "");
        setSymptoms(existing.symptoms ?? "");
        setCost(existing.cost != null ? String(existing.cost) : "");
        setCostCurrency(existing.costCurrency ?? "KES");
        setWithdrawalDays(
          existing.withdrawalPeriodDays != null
            ? String(existing.withdrawalPeriodDays)
            : "",
        );
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[AnimalHealthForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, recordId]);

  const typeOptions = useMemo(
    () =>
      HEALTH_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForHealthType(value)),
        icon: iconForHealthType(value),
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    if (!recordDate.trim()) {
      setDateError(t("activity_date_required"));
      return false;
    }
    const parsed = new Date(recordDate.trim());
    if (Number.isNaN(parsed.getTime())) {
      setDateError(t("invalid_number"));
      return false;
    }
    setDateError(null);
    return true;
  }, [recordDate, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(recordDate.trim()).toISOString();
    const parsedDosage = dosage.trim()
      ? Number(dosage.replace(",", "."))
      : null;
    const parsedCost = cost.trim() ? Number(cost.replace(",", ".")) : null;
    const parsedWithdrawal = withdrawalDays.trim()
      ? Number(withdrawalDays.replace(",", "."))
      : null;

    try {
      if (mode === "create" && activeFarm) {
        await animalHealthRepo.create(ctx, {
          farmId: activeFarm.id,
          animalId,
          recordType,
          recordDate: isoDate,
          productName: productName.trim() || null,
          dosage: parsedDosage,
          dosageUnit: dosageUnit.trim() || null,
          administeredBy: administeredBy.trim() || null,
          diagnosis: diagnosis.trim() || null,
          symptoms: symptoms.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
          withdrawalPeriodDays: parsedWithdrawal,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && recordId) {
        await animalHealthRepo.update(ctx, recordId, {
          recordType,
          recordDate: isoDate,
          productName: productName.trim() || null,
          dosage: parsedDosage,
          dosageUnit: dosageUnit.trim() || null,
          administeredBy: administeredBy.trim() || null,
          diagnosis: diagnosis.trim() || null,
          symptoms: symptoms.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
          withdrawalPeriodDays: parsedWithdrawal,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t("create_activity_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[AnimalHealthForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    animalId,
    recordId,
    recordType,
    recordDate,
    productName,
    dosage,
    dosageUnit,
    administeredBy,
    diagnosis,
    symptoms,
    cost,
    costCurrency,
    withdrawalDays,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !recordId) return;
    Alert.alert(
      t("delete_health_record_title"),
      t("delete_health_record_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await animalHealthRepo.softDelete(ctx, recordId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[AnimalHealthForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, recordId, navigation, t]);

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

  const submitLabel =
    mode === "create" ? t("create_health_record") : t("update_health_record");

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
      <SelectField<HealthRecordType>
        label={t("health_record_type")}
        value={recordType}
        onChange={setRecordType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("health_record_date")}
        hint="2026-04-10"
        value={recordDate}
        onChangeText={setRecordDate}
        error={dateError}
        required
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("health_product_name")}
        hint={t("health_product_hint")}
        value={productName}
        onChangeText={setProductName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={200}
        returnKeyType="next"
      />

      <FormField
        label={t("health_dosage")}
        value={dosage}
        onChangeText={setDosage}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="next"
      />

      <FormField
        label={t("health_dosage_unit")}
        hint="ml, g, tablets"
        value={dosageUnit}
        onChangeText={setDosageUnit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("health_administered_by")}
        value={administeredBy}
        onChangeText={setAdministeredBy}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <FormField
        label={t("health_diagnosis")}
        value={diagnosis}
        onChangeText={setDiagnosis}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={300}
        returnKeyType="next"
      />

      <FormField
        label={t("health_symptoms")}
        value={symptoms}
        onChangeText={setSymptoms}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={300}
        returnKeyType="next"
      />

      <FormField
        label={t("health_cost")}
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        maxLength={12}
        returnKeyType="next"
      />

      <FormField
        label={t("cost_currency")}
        hint="KES"
        value={costCurrency}
        onChangeText={setCostCurrency}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={5}
        returnKeyType="next"
      />

      <FormField
        label={t("health_withdrawal_days")}
        hint={t("health_withdrawal_hint")}
        value={withdrawalDays}
        onChangeText={setWithdrawalDays}
        keyboardType="number-pad"
        maxLength={4}
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
  },
  loadingText: { ...typography.body },
  submitError: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
