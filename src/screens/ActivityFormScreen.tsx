import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import {
  AttachmentPicker,
  type PickedPhoto,
  type PickedVoice,
} from "../components/AttachmentPicker";
import { AttachmentList } from "../components/AttachmentList";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  attachmentRepo,
  cropActivityRepo,
  ValidationError,
  type Attachment,
  type CropActivityType,
} from "../db";
import {
  ACTIVITY_TYPE_VALUES,
  iconForActivityType,
  keyForActivityType,
} from "../utils/cropLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

type PendingPhoto = {
  uri: string;
  mimeType: string;
};

type PendingVoice = {
  uri: string;
  mimeType: string;
  durationMs: number;
};

export const ActivityFormScreen: React.FC<
  RootStackScreenProps<"ActivityForm">
> = ({ route, navigation }) => {
  const { cycleId, activityId } = route.params;
  const mode: Mode = activityId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [activityType, setActivityType] =
    useState<CropActivityType>("scouting");
  const [activityDate, setActivityDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [cost, setCost] = useState("");
  const [costCurrency, setCostCurrency] = useState("KES");
  const [notes, setNotes] = useState("");

  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(
    [],
  );
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [pendingVoices, setPendingVoices] = useState<PendingVoice[]>([]);

  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !activityId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await cropActivityRepo.getById(ctx, activityId);
        if (cancelled || !existing) return;
        setActivityType(existing.activityType);
        setActivityDate(existing.activityDate.slice(0, 10));
        setDescription(existing.description ?? "");
        setQuantity(existing.quantity != null ? String(existing.quantity) : "");
        setQuantityUnit(existing.quantityUnit ?? "");
        setCost(existing.cost != null ? String(existing.cost) : "");
        setCostCurrency(existing.costCurrency ?? "KES");
        setNotes(existing.notes ?? "");

        const attachments = await attachmentRepo.listByEntity(
          ctx,
          "crop_activity",
          activityId,
        );
        if (!cancelled) setExistingAttachments(attachments);
      } catch (err) {
        if (__DEV__) {
          console.warn("[ActivityForm] hydrate failed", err);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, activityId]);

  const typeOptions = useMemo(
    () =>
      ACTIVITY_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForActivityType(value)),
        icon: iconForActivityType(value),
      })),
    [t],
  );

  const validate = useCallback((): boolean => {
    if (!activityDate.trim()) {
      setDateError(t("activity_date_required"));
      return false;
    }
    const parsed = new Date(activityDate.trim());
    if (Number.isNaN(parsed.getTime())) {
      setDateError(t("invalid_number"));
      return false;
    }
    setDateError(null);
    return true;
  }, [activityDate, t]);

  const handlePhotoPicked = useCallback((photo: PickedPhoto): void => {
    setPendingPhotos((prev) => [...prev, photo]);
  }, []);

  const handleVoicePicked = useCallback((voice: PickedVoice): void => {
    setPendingVoices((prev) => [...prev, voice]);
  }, []);

  const handleDeleteAttachment = useCallback(
    (attachment: Attachment): void => {
      if (!ctx) return;
      Alert.alert(
        t("delete_attachment_title"),
        t("delete_attachment_message"),
        [
          { text: t("no"), style: "cancel" },
          {
            text: t("yes"),
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await attachmentRepo.softDelete(ctx, attachment.id);
                  setExistingAttachments((prev) =>
                    prev.filter((a) => a.id !== attachment.id),
                  );
                } catch (err) {
                  if (__DEV__) {
                    console.warn(
                      "[ActivityForm] delete attachment failed",
                      err,
                    );
                  }
                }
              })();
            },
          },
        ],
        { cancelable: true },
      );
    },
    [ctx, t],
  );

  const persistPending = useCallback(
    async (targetActivityId: string): Promise<void> => {
      if (!ctx || !activeFarm) return;

      const allPending: {
        kind: "photo" | "voice";
        uri: string;
        mimeType: string;
        durationMs?: number;
      }[] = [
        ...pendingPhotos.map((p) => ({
          kind: "photo" as const,
          uri: p.uri,
          mimeType: p.mimeType,
        })),
        ...pendingVoices.map((v) => ({
          kind: "voice" as const,
          uri: v.uri,
          mimeType: v.mimeType,
          durationMs: v.durationMs,
        })),
      ];

      for (const item of allPending) {
        try {
          await attachmentRepo.create(ctx, {
            farmId: activeFarm.id,
            entityType: "crop_activity",
            entityId: targetActivityId,
            kind: item.kind,
            localPath: item.uri,
            mimeType: item.mimeType,
            durationMs: item.durationMs ?? null,
          });
        } catch (err) {
          if (__DEV__) {
            console.warn("[ActivityForm] persist attachment failed", err);
          }
        }
      }
    },
    [ctx, activeFarm, pendingPhotos, pendingVoices],
  );

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(activityDate.trim()).toISOString();
    const parsedQuantity = quantity.trim()
      ? Number(quantity.replace(",", "."))
      : null;
    const parsedCost = cost.trim() ? Number(cost.replace(",", ".")) : null;

    try {
      if (mode === "create" && activeFarm) {
        const created = await cropActivityRepo.create(ctx, {
          farmId: activeFarm.id,
          cycleId,
          activityType,
          activityDate: isoDate,
          description: description.trim() || null,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
          notes: notes.trim() || null,
        });
        await persistPending(created.id);
      } else if (mode === "edit" && activityId) {
        await cropActivityRepo.update(ctx, activityId, {
          activityType,
          activityDate: isoDate,
          description: description.trim() || null,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          cost: parsedCost,
          costCurrency: costCurrency.trim() || null,
          notes: notes.trim() || null,
        });
        await persistPending(activityId);
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(
              mode === "create"
                ? "create_activity_error"
                : "update_activity_error",
            );
      setSubmitError(message);
      if (__DEV__) {
        console.warn("[ActivityForm] submit failed", err);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    validate,
    mode,
    activeFarm,
    cycleId,
    activityId,
    activityType,
    activityDate,
    description,
    quantity,
    quantityUnit,
    cost,
    costCurrency,
    notes,
    navigation,
    persistPending,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !activityId) return;
    Alert.alert(
      t("delete_activity_title"),
      t("delete_activity_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await cropActivityRepo.softDelete(ctx, activityId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[ActivityForm] delete failed", err);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, activityId, navigation, t]);

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
    mode === "create" ? t("create_activity") : t("update_activity");

  const pendingCount = pendingPhotos.length + pendingVoices.length;

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
      <SelectField<CropActivityType>
        label={t("activity_type")}
        value={activityType}
        onChange={setActivityType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("activity_date")}
        hint="2026-04-01"
        value={activityDate}
        onChangeText={setActivityDate}
        error={dateError}
        required
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("activity_description")}
        hint={t("activity_description_hint")}
        value={description}
        onChangeText={setDescription}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={500}
        returnKeyType="next"
      />

      <FormField
        label={t("quantity")}
        hint={t("quantity_hint")}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        maxLength={10}
        returnKeyType="next"
      />

      <FormField
        label={t("quantity_unit")}
        hint="kg, L, bags"
        value={quantityUnit}
        onChangeText={setQuantityUnit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("cost")}
        hint={t("cost_hint")}
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
        label={t("plot_notes")}
        hint={t("plot_notes_hint")}
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={500}
        returnKeyType="done"
      />

      <AttachmentPicker
        onPhotoPicked={handlePhotoPicked}
        onVoicePicked={handleVoicePicked}
      />

      {existingAttachments.length > 0 ? (
        <AttachmentList
          attachments={existingAttachments}
          onDelete={handleDeleteAttachment}
        />
      ) : null}

      {pendingCount > 0 ? (
        <View style={styles.pendingNote}>
          <Text style={[styles.pendingText, { color: colors.textMuted }]}>
            {pendingCount} {t("attachments").toLowerCase()}
          </Text>
        </View>
      ) : null}

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
  pendingNote: {
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  pendingText: { ...typography.caption },
});
