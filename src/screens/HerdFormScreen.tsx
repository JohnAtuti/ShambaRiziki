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
  herdRepo,
  ValidationError,
  type HerdPurpose,
  type Species,
} from "../db";
import {
  HERD_PURPOSE_VALUES,
  iconForSpecies,
  keyForPurpose,
  keyForSpecies,
  SPECIES_VALUES,
} from "../utils/livestockLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const HerdFormScreen: React.FC<RootStackScreenProps<"HerdForm">> = ({
  route,
  navigation,
}) => {
  const { herdId } = route.params ?? {};
  const mode: Mode = herdId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("cattle");
  const [breed, setBreed] = useState("");
  const [purpose, setPurpose] = useState<HerdPurpose>("mixed");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !herdId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await herdRepo.getById(ctx, herdId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setSpecies(existing.species);
        setBreed(existing.breed ?? "");
        setPurpose(existing.purpose);
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[HerdForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, herdId]);

  const speciesOptions = useMemo(
    () =>
      SPECIES_VALUES.map((value) => ({
        value,
        label: t(keyForSpecies(value)),
        icon: iconForSpecies(value),
      })),
    [t],
  );

  const purposeOptions = useMemo(
    () =>
      HERD_PURPOSE_VALUES.map((value) => ({
        value,
        label: t(keyForPurpose(value)),
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    if (!name.trim()) {
      setNameError(t("herd_name_required"));
      return false;
    }
    setNameError(null);
    return true;
  }, [name, t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create" && activeFarm) {
        await herdRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          species,
          breed: breed.trim() || null,
          purpose,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && herdId) {
        await herdRepo.update(ctx, herdId, {
          name: name.trim(),
          species,
          breed: breed.trim() || null,
          purpose,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_herd_error" : "update_herd_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[HerdForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    herdId,
    name,
    species,
    breed,
    purpose,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !herdId) return;
    Alert.alert(
      t("delete_herd_title"),
      t("delete_herd_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await herdRepo.softDelete(ctx, herdId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[HerdForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, herdId, navigation, t]);

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

  const submitLabel = mode === "create" ? t("create_herd") : t("update_herd");

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
        label={t("herd_name")}
        hint={t("herd_name_hint")}
        value={name}
        onChangeText={setName}
        error={nameError}
        required
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <SelectField<Species>
        label={t("herd_species")}
        value={species}
        onChange={setSpecies}
        options={speciesOptions}
      />

      <FormField
        label={t("herd_breed")}
        hint={t("herd_breed_hint")}
        value={breed}
        onChangeText={setBreed}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={100}
        returnKeyType="next"
      />

      <SelectField<HerdPurpose>
        label={t("herd_purpose")}
        value={purpose}
        onChange={setPurpose}
        options={purposeOptions}
      />

      <FormField
        label={t("herd_notes")}
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
