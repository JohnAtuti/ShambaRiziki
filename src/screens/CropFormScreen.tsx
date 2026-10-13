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
import { cropRepo, ValidationError, type CropCategory } from "../db";
import {
  CATEGORY_VALUES,
  iconForCategory,
  keyForCategory,
} from "../utils/cropLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const CropFormScreen: React.FC<RootStackScreenProps<"CropForm">> = ({
  route,
  navigation,
}) => {
  const { cropId } = route.params ?? {};
  const mode: Mode = cropId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [variety, setVariety] = useState("");
  const [category, setCategory] = useState<CropCategory>("cereal");
  const [daysToHarvest, setDaysToHarvest] = useState("");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !cropId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await cropRepo.getById(ctx, cropId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setVariety(existing.variety ?? "");
        setCategory(existing.category);
        setDaysToHarvest(
          existing.daysToHarvest != null ? String(existing.daysToHarvest) : "",
        );
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) {
          console.warn("[CropForm] hydrate failed", err);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, cropId]);

  const categoryOptions = useMemo(
    () =>
      CATEGORY_VALUES.map((value) => ({
        value,
        label: t(keyForCategory(value)),
        icon: iconForCategory(value),
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!name.trim()) {
      setNameError(t("crop_name_required"));
      ok = false;
    } else {
      setNameError(null);
    }

    if (daysToHarvest.trim()) {
      const parsed = Number(daysToHarvest.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 3650) {
        setDaysError(t("invalid_number"));
        ok = false;
      } else {
        setDaysError(null);
      }
    } else {
      setDaysError(null);
    }

    return ok;
  }, [name, daysToHarvest, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parsedDays = daysToHarvest.trim()
      ? Number(daysToHarvest.replace(",", "."))
      : null;

    try {
      if (mode === "create" && activeFarm) {
        await cropRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          variety: variety.trim() || null,
          category,
          daysToHarvest: parsedDays,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && cropId) {
        await cropRepo.update(ctx, cropId, {
          name: name.trim(),
          variety: variety.trim() || null,
          category,
          daysToHarvest: parsedDays,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_crop_error" : "update_crop_error");
      setSubmitError(message);
      if (__DEV__) {
        console.warn("[CropForm] submit failed", err);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    cropId,
    name,
    variety,
    category,
    daysToHarvest,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !cropId) return;
    Alert.alert(
      t("delete_crop_title"),
      t("delete_crop_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await cropRepo.softDelete(ctx, cropId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[CropForm] delete failed", err);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, cropId, navigation, t]);

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

  const submitLabel = mode === "create" ? t("create_crop") : t("update_crop");

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
        label={t("crop_name")}
        hint={t("crop_name_hint")}
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
        label={t("crop_variety")}
        hint={t("crop_variety_hint")}
        value={variety}
        onChangeText={setVariety}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <SelectField<CropCategory>
        label={t("crop_category")}
        value={category}
        onChange={setCategory}
        options={categoryOptions}
      />

      <FormField
        label={t("crop_days_to_harvest")}
        hint={t("crop_days_to_harvest_hint")}
        value={daysToHarvest}
        onChangeText={setDaysToHarvest}
        error={daysError}
        keyboardType="number-pad"
        maxLength={4}
        returnKeyType="done"
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
