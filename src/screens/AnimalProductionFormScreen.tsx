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
  animalProductionRepo,
  ValidationError,
  type ProductionType,
} from "../db";
import {
  PRODUCTION_TYPE_VALUES,
  iconForProductionType,
  keyForProductionType,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const AnimalProductionFormScreen: React.FC<
  RootStackScreenProps<"AnimalProductionForm">
> = ({ route, navigation }) => {
  const { animalId, herdId, recordId } = route.params;
  const mode: Mode = recordId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [productionType, setProductionType] = useState<ProductionType>("milk");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [quality, setQuality] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [bcs, setBcs] = useState("");
  const [notes, setNotes] = useState("");

  const [dateError, setDateError] = useState<string | null>(null);
  const [bcsError, setBcsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !recordId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await animalProductionRepo.getById(ctx, recordId);
        if (cancelled || !existing) return;
        setRecordDate(existing.recordDate.slice(0, 10));
        setProductionType(existing.productionType);
        setQuantity(existing.quantity != null ? String(existing.quantity) : "");
        setQuantityUnit(existing.quantityUnit ?? "");
        setQuality(existing.quality ?? "");
        setWeightKg(existing.weightKg != null ? String(existing.weightKg) : "");
        setBcs(
          existing.bodyConditionScore != null
            ? String(existing.bodyConditionScore)
            : "",
        );
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[AnimalProductionForm] hydrate failed", err);
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
      PRODUCTION_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForProductionType(value)),
        icon: iconForProductionType(value),
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!recordDate.trim()) {
      setDateError(t("activity_date_required"));
      ok = false;
    } else {
      const parsed = new Date(recordDate.trim());
      if (Number.isNaN(parsed.getTime())) {
        setDateError(t("invalid_number"));
        ok = false;
      } else {
        setDateError(null);
      }
    }

    if (bcs.trim()) {
      const parsed = Number(bcs.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        setBcsError(t("invalid_number"));
        ok = false;
      } else {
        setBcsError(null);
      }
    } else {
      setBcsError(null);
    }

    return ok;
  }, [recordDate, bcs, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;
    if (mode === "create" && !animalId && !herdId) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(recordDate.trim()).toISOString();
    const parsedQuantity = quantity.trim()
      ? Number(quantity.replace(",", "."))
      : null;
    const parsedWeight = weightKg.trim()
      ? Number(weightKg.replace(",", "."))
      : null;
    const parsedBcs = bcs.trim() ? Number(bcs.replace(",", ".")) : null;

    try {
      if (mode === "create" && activeFarm) {
        await animalProductionRepo.create(ctx, {
          farmId: activeFarm.id,
          animalId: animalId ?? null,
          herdId: herdId ?? null,
          recordDate: isoDate,
          productionType,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          quality: quality.trim() || null,
          weightKg: parsedWeight,
          bodyConditionScore: parsedBcs,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && recordId) {
        await animalProductionRepo.update(ctx, recordId, {
          recordDate: isoDate,
          productionType,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          quality: quality.trim() || null,
          weightKg: parsedWeight,
          bodyConditionScore: parsedBcs,
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
      if (__DEV__) console.warn("[AnimalProductionForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    animalId,
    herdId,
    recordId,
    recordDate,
    productionType,
    quantity,
    quantityUnit,
    quality,
    weightKg,
    bcs,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !recordId) return;
    Alert.alert(
      t("delete_production_record_title"),
      t("delete_production_record_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await animalProductionRepo.softDelete(ctx, recordId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[AnimalProductionForm] delete failed", err);
                }
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
      ? t("create_production_record")
      : t("update_production_record");

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
      <FormField
        label={t("production_record_date")}
        hint="2026-04-12"
        value={recordDate}
        onChangeText={setRecordDate}
        error={dateError}
        required
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <SelectField<ProductionType>
        label={t("production_type")}
        value={productionType}
        onChange={setProductionType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("production_quantity")}
        hint={t("production_quantity_hint")}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="next"
      />

      <FormField
        label={t("production_quantity_unit")}
        hint="L, kg, pieces"
        value={quantityUnit}
        onChangeText={setQuantityUnit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("production_quality")}
        hint="excellent, good, fair (optional)"
        value={quality}
        onChangeText={setQuality}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={50}
        returnKeyType="next"
      />

      <FormField
        label={t("production_weight_kg")}
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="decimal-pad"
        maxLength={7}
        returnKeyType="next"
      />

      <FormField
        label={t("production_bcs")}
        hint={t("animal_bcs_hint")}
        value={bcs}
        onChangeText={setBcs}
        error={bcsError}
        keyboardType="decimal-pad"
        maxLength={3}
        returnKeyType="next"
      />

      <FormField
        label={t("production_notes")}
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
