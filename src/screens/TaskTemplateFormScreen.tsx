import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  taskTemplateRepo,
  ValidationError,
  type RecurrenceType,
  type TaskPriority,
  type TaskTargetType,
  type TaskType,
} from "../db";
import {
  iconForRecurrence,
  iconForTaskType,
  keyForPriority,
  keyForRecurrence,
  keyForTargetType,
  keyForTaskType,
  PRIORITY_VALUES,
  RECURRENCE_VALUES,
  TARGET_TYPE_VALUES,
  TASK_TYPE_VALUES,
} from "../utils/taskLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const NO_TARGET_TYPE = "__none__";

export const TaskTemplateFormScreen: React.FC<
  RootStackScreenProps<"TaskTemplateForm">
> = ({ route, navigation }) => {
  const { templateId } = route.params ?? {};
  const mode: Mode = templateId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("field_work");
  const [defaultPriority, setDefaultPriority] =
    useState<TaskPriority>("normal");
  const [defaultRecurrenceType, setDefaultRecurrenceType] =
    useState<RecurrenceType>("none");
  const [defaultDueOffsetDays, setDefaultDueOffsetDays] = useState("");
  const [defaultTargetType, setDefaultTargetType] =
    useState<string>(NO_TARGET_TYPE);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !templateId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await taskTemplateRepo.getById(ctx, templateId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setDescription(existing.description ?? "");
        setTaskType(existing.taskType);
        setDefaultPriority(existing.defaultPriority);
        setDefaultRecurrenceType(existing.defaultRecurrenceType);
        setDefaultDueOffsetDays(
          existing.defaultDueOffsetDays != null
            ? String(existing.defaultDueOffsetDays)
            : "",
        );
        setDefaultTargetType(existing.defaultTargetType ?? NO_TARGET_TYPE);
        setEstimatedHours(
          existing.estimatedHours != null
            ? String(existing.estimatedHours)
            : "",
        );
        setIsActive(existing.isActive);
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[TaskTemplateForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, templateId]);

  const typeOptions = useMemo(
    () =>
      TASK_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForTaskType(value)),
        icon: iconForTaskType(value),
      })),
    [t],
  );

  const priorityOptions = useMemo(
    () =>
      PRIORITY_VALUES.map((value) => ({
        value,
        label: t(keyForPriority(value)),
      })),
    [t],
  );

  const recurrenceOptions = useMemo(
    () =>
      RECURRENCE_VALUES.map((value) => ({
        value,
        label: t(keyForRecurrence(value)),
        icon: iconForRecurrence(value) || undefined,
      })),
    [t],
  );

  const targetTypeOptions = useMemo(() => {
    const opts = TARGET_TYPE_VALUES.map((value) => ({
      value,
      label: t(keyForTargetType(value)),
    }));
    return [{ value: NO_TARGET_TYPE, label: t("not_set") }, ...opts];
  }, [t]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parsedOffset = defaultDueOffsetDays.trim()
      ? Number(defaultDueOffsetDays.replace(",", "."))
      : null;
    const parsedHours = estimatedHours.trim()
      ? Number(estimatedHours.replace(",", "."))
      : null;
    const finalTargetType =
      defaultTargetType === NO_TARGET_TYPE
        ? null
        : (defaultTargetType as TaskTargetType);

    try {
      if (mode === "create" && activeFarm) {
        await taskTemplateRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          description: description.trim() || null,
          taskType,
          defaultPriority,
          defaultRecurrenceType,
          defaultDueOffsetDays: parsedOffset,
          defaultTargetType: finalTargetType,
          estimatedHours: parsedHours,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && templateId) {
        await taskTemplateRepo.update(ctx, templateId, {
          name: name.trim(),
          description: description.trim() || null,
          taskType,
          defaultPriority,
          defaultRecurrenceType,
          defaultDueOffsetDays: parsedOffset,
          defaultTargetType: finalTargetType,
          estimatedHours: parsedHours,
          isActive,
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
                ? "create_template_error"
                : "update_template_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[TaskTemplateForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    templateId,
    name,
    description,
    taskType,
    defaultPriority,
    defaultRecurrenceType,
    defaultDueOffsetDays,
    defaultTargetType,
    estimatedHours,
    isActive,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !templateId) return;
    Alert.alert(
      t("delete_template_title"),
      t("delete_template_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await taskTemplateRepo.softDelete(ctx, templateId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[TaskTemplateForm] delete failed", err);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, templateId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "step_template_identity",
        hintKey: "step_template_identity_hint",
        icon: "📋",
        validate: () => name.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("template_name")}
              hint={t("template_name_hint")}
              value={name}
              onChangeText={setName}
              required
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={150}
              returnKeyType="next"
            />
            <FormField
              label={t("template_description")}
              hint={t("task_description_hint")}
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={500}
              returnKeyType="next"
            />
            <SelectField<TaskType>
              label={t("template_task_type")}
              value={taskType}
              onChange={setTaskType}
              options={typeOptions}
            />
          </>
        ),
      },
      {
        id: "defaults",
        titleKey: "step_template_defaults",
        hintKey: "step_template_defaults_hint",
        icon: "⚙️",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<TaskPriority>
              label={t("template_default_priority")}
              value={defaultPriority}
              onChange={setDefaultPriority}
              options={priorityOptions}
            />
            <SelectField<RecurrenceType>
              label={t("template_default_recurrence")}
              value={defaultRecurrenceType}
              onChange={setDefaultRecurrenceType}
              options={recurrenceOptions}
            />
            <FormField
              label={t("template_due_offset")}
              hint={t("template_due_offset_hint")}
              value={defaultDueOffsetDays}
              onChangeText={setDefaultDueOffsetDays}
              keyboardType="number-pad"
              maxLength={4}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "step_template_extras",
        hintKey: "step_template_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<string>
              label={t("template_target_type")}
              value={defaultTargetType}
              onChange={setDefaultTargetType}
              options={targetTypeOptions}
            />
            <FormField
              label={t("template_estimated_hours")}
              value={estimatedHours}
              onChangeText={setEstimatedHours}
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="next"
            />
            {mode === "edit" ? (
              <View
                style={[
                  styles.switchRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Text style={[styles.switchLabel, { color: colors.text }]}>
                  {t("template_is_active")}
                </Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            ) : null}
            <FormField
              label={t("template_notes")}
              hint={t("plot_notes_hint")}
              value={notes}
              onChangeText={setNotes}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={500}
              returnKeyType="done"
            />
          </>
        ),
      },
    ],
    [
      t,
      name,
      description,
      taskType,
      typeOptions,
      defaultPriority,
      priorityOptions,
      defaultRecurrenceType,
      recurrenceOptions,
      defaultDueOffsetDays,
      defaultTargetType,
      targetTypeOptions,
      estimatedHours,
      mode,
      colors,
      isActive,
      notes,
    ],
  );

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
    mode === "create" ? t("create_template") : t("update_template");

  return (
    <Screen scroll={false} contentStyle={styles.noPadding}>
      <WizardForm
        steps={steps}
        onSubmit={onSubmit}
        submitting={submitting}
        submitLabel={submitLabel}
        errorMessage={submitError}
      />
      {mode === "edit" ? (
        <View
          style={[
            styles.deleteRow,
            { borderTopColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <BigButton
            label={t("delete")}
            onPress={onDelete}
            variant="danger"
            style={styles.deleteBtn}
          />
        </View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  noPadding: { padding: 0 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: { ...typography.body },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
  },
  switchLabel: { ...typography.body },
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
