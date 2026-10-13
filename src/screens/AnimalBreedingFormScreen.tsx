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
  animalBreedingRepo,
  animalRepo,
  ValidationError,
  type Animal,
  type BreedingMethod,
  type BreedingRecordType,
} from "../db";
import {
  BREEDING_TYPE_VALUES,
  iconForBreedingType,
  keyForBreedingMethod,
  keyForBreedingType,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const NO_SIRE = "__none__";

const METHOD_VALUES: readonly BreedingMethod[] = [
  "natural",
  "artificial_insemination",
  "unknown",
];

export const AnimalBreedingFormScreen: React.FC<
  RootStackScreenProps<"AnimalBreedingForm">
> = ({ route, navigation }) => {
  const { animalId, recordId } = route.params;
  const mode: Mode = recordId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [males, setMales] = useState<Animal[]>([]);

  const [recordType, setRecordType] = useState<BreedingRecordType>("mating");
  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [sireId, setSireId] = useState<string>(NO_SIRE);
  const [method, setMethod] = useState<BreedingMethod>("natural");
  const [pregnancyConfirmedDate, setPregnancyConfirmedDate] = useState("");
  const [expectedDueDate, setExpectedDueDate] = useState("");
  const [offspringCount, setOffspringCount] = useState("");
  const [notes, setNotes] = useState("");

  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await animalRepo.listByFarm(ctx, activeFarm.id);
        if (cancelled) return;
        setMales(all.filter((a) => a.sex === "male" && a.id !== animalId));

        if (mode === "edit" && recordId) {
          const existing = await animalBreedingRepo.getById(ctx, recordId);
          if (cancelled || !existing) return;
          setRecordType(existing.recordType);
          setRecordDate(existing.recordDate.slice(0, 10));
          setSireId(existing.sireId ?? NO_SIRE);
          setMethod(existing.method ?? "natural");
          setPregnancyConfirmedDate(
            existing.pregnancyConfirmedDate
              ? existing.pregnancyConfirmedDate.slice(0, 10)
              : "",
          );
          setExpectedDueDate(
            existing.expectedDueDate
              ? existing.expectedDueDate.slice(0, 10)
              : "",
          );
          setOffspringCount(
            existing.offspringCount != null
              ? String(existing.offspringCount)
              : "",
          );
          setNotes(existing.notes ?? "");
        }
      } catch (err) {
        if (__DEV__) console.warn("[AnimalBreedingForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, recordId, animalId]);

  const typeOptions = useMemo(
    () =>
      BREEDING_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForBreedingType(value)),
        icon: iconForBreedingType(value),
      })),
    [t],
  );

  const methodOptions = useMemo(
    () =>
      METHOD_VALUES.map((value) => ({
        value,
        label: t(keyForBreedingMethod(value)),
      })),
    [t],
  );

  const sireOptions = useMemo(() => {
    const opts = males.map((a) => ({
      value: a.id,
      label: a.name ?? a.tagId,
    }));
    return [{ value: NO_SIRE, label: t("not_set") }, ...opts];
  }, [males, t]);

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
    const isoPregnancy = pregnancyConfirmedDate.trim()
      ? new Date(pregnancyConfirmedDate.trim()).toISOString()
      : null;
    const isoDue = expectedDueDate.trim()
      ? new Date(expectedDueDate.trim()).toISOString()
      : null;
    const parsedOffspring = offspringCount.trim()
      ? Number(offspringCount.replace(",", "."))
      : null;
    const finalSireId = sireId === NO_SIRE ? null : sireId;

    try {
      if (mode === "create" && activeFarm) {
        await animalBreedingRepo.create(ctx, {
          farmId: activeFarm.id,
          animalId,
          recordType,
          recordDate: isoDate,
          sireId: finalSireId,
          method,
          pregnancyConfirmedDate: isoPregnancy,
          expectedDueDate: isoDue,
          offspringCount: parsedOffspring,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && recordId) {
        await animalBreedingRepo.update(ctx, recordId, {
          recordType,
          recordDate: isoDate,
          sireId: finalSireId,
          method,
          pregnancyConfirmedDate: isoPregnancy,
          expectedDueDate: isoDue,
          offspringCount: parsedOffspring,
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
      if (__DEV__) console.warn("[AnimalBreedingForm] submit failed", err);
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
    sireId,
    method,
    pregnancyConfirmedDate,
    expectedDueDate,
    offspringCount,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !recordId) return;
    Alert.alert(
      t("delete_breeding_record_title"),
      t("delete_breeding_record_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await animalBreedingRepo.softDelete(ctx, recordId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[AnimalBreedingForm] delete failed", err);
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
    mode === "create"
      ? t("create_breeding_record")
      : t("update_breeding_record");

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
      <SelectField<BreedingRecordType>
        label={t("breeding_record_type")}
        value={recordType}
        onChange={setRecordType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("breeding_record_date")}
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

      <SelectField<string>
        label={t("breeding_sire")}
        value={sireId}
        onChange={setSireId}
        options={sireOptions}
      />

      <SelectField<BreedingMethod>
        label={t("breeding_method")}
        value={method}
        onChange={setMethod}
        options={methodOptions}
      />

      <FormField
        label={t("breeding_pregnancy_confirmed")}
        hint="YYYY-MM-DD (optional)"
        value={pregnancyConfirmedDate}
        onChangeText={setPregnancyConfirmedDate}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("breeding_expected_due")}
        hint="YYYY-MM-DD (optional)"
        value={expectedDueDate}
        onChangeText={setExpectedDueDate}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("breeding_offspring_count")}
        value={offspringCount}
        onChangeText={setOffspringCount}
        keyboardType="number-pad"
        maxLength={3}
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
