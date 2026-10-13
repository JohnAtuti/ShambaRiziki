import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { warehouseRepo, ValidationError } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const WarehouseFormScreen: React.FC<
  RootStackScreenProps<"WarehouseForm">
> = ({ route, navigation }) => {
  const { warehouseId } = route.params ?? {};
  const mode: Mode = warehouseId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !warehouseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await warehouseRepo.getById(ctx, warehouseId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setLocation(existing.location ?? "");
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[WarehouseForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, warehouseId]);

  const validate = useCallback((): boolean => {
    if (!name.trim()) {
      setNameError(t("warehouse_name_required"));
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
        await warehouseRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && warehouseId) {
        await warehouseRepo.update(ctx, warehouseId, {
          name: name.trim(),
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(
              mode === "create"
                ? "create_warehouse_error"
                : "update_warehouse_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[WarehouseForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    warehouseId,
    name,
    location,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !warehouseId) return;
    Alert.alert(
      t("delete_warehouse_title"),
      t("delete_warehouse_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await warehouseRepo.softDelete(ctx, warehouseId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[WarehouseForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, warehouseId, navigation, t]);

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
    mode === "create" ? t("create_warehouse") : t("update_warehouse");

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
        label={t("warehouse_name")}
        hint={t("warehouse_name_hint")}
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
        label={t("warehouse_location")}
        hint={t("warehouse_location_hint")}
        value={location}
        onChangeText={setLocation}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={200}
        returnKeyType="next"
      />

      <FormField
        label={t("warehouse_notes")}
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
