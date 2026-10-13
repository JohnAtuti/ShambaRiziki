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
import { animalFeedingRepo, ValidationError, type FeedType } from "../db";
import {
  FEED_TYPE_VALUES,
  iconForFeedType,
  keyForFeedType,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const AnimalFeedFormScreen: React.FC<
  RootStackScreenProps<"AnimalFeedForm">
> = ({ route, navigation }) => {
  const { animalId, herdId, recordId } = route.params;
  const mode: Mode = recordId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [recordDate, setRecordDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [feedType, setFeedType] = useState<FeedType>("hay");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [cost, setCost] = useState("");
  const [costCurrency, setCostCurrency] = useState("KES");
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
        const existing = await animalFeedingRepo.getById(ctx, recordId);
        if (cancelled || !existing) return;
        setRecordDate(existing.recordDate.slice(0, 10));
        setFeedType(existing.feedType);
        setQuantity(existing.quantity != null ? String(existing.quantity) : "");
        setQuantityUnit(existing.quantityUnit ?? "");
        setCost(existing.cost != null ? String(existing.cost) : "");
        setCostCurrency(existing.costCurrency ?? "KES");
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[AnimalFeedForm] hydrate failed", err);
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
      FEED_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForFeedType(value)),
        icon: iconForFeedType(value),
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
    if (mode === "create" && !animalId && !herdId) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(recordDate.trim()).toISOString();
    const parsedQuantity = quantity.trim()
      ? Number(quantity.replace(",", "."))
      : null;
    const parsedCost = cost.trim() ? Number(cost.replace(",", ".")) : null;

    try {
      if (mode === "create" && activeFarm) {
        await animalFeedingRepo.create(ctx, {
          farmId: activeFarm.id,
          animalId: animalId ?? null,
          herdId: herdId ?? null,
          recordDate: isoDate,
          feedType,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && recordId) {
        await animalFeedingRepo.update(ctx, recordId, {
          recordDate: isoDate,
          feedType,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
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
      if (__DEV__) console.warn("[AnimalFeedForm] submit failed", err);
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
    feedType,
    quantity,
    quantityUnit,
    cost,
    costCurrency,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !recordId) return;
    Alert.alert(
      t("delete_feed_record_title"),
      t("delete_feed_record_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await animalFeedingRepo.softDelete(ctx, recordId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[AnimalFeedForm] delete failed", err);
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
    mode === "create" ? t("create_feed_record") : t("update_feed_record");

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
        label={t("feed_record_date")}
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

      <SelectField<FeedType>
        label={t("feed_type")}
        value={feedType}
        onChange={setFeedType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("feed_quantity")}
        hint={t("feed_quantity_hint")}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="next"
      />

      <FormField
        label={t("feed_quantity_unit")}
        hint="kg, L, bales"
        value={quantityUnit}
        onChangeText={setQuantityUnit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("feed_cost")}
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
        label={t("feed_notes")}
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
