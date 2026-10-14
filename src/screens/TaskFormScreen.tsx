import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { DateField } from "../components/DateField";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  animalRepo,
  herdRepo,
  inventoryItemRepo,
  plotRepo,
  taskRepo,
  taskTemplateRepo,
  ValidationError,
  type Animal,
  type Herd,
  type InventoryItem,
  type Plot,
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

export const TaskFormScreen: React.FC<RootStackScreenProps<"TaskForm">> = ({
  route,
  navigation,
}) => {
  const { taskId, templateId: templateIdParam } = route.params ?? {};
  const mode: Mode = taskId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [plots, setPlots] = useState<Plot[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("field_work");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const [targetType, setTargetType] = useState<string>(NO_TARGET_TYPE);
  const [targetId, setTargetId] = useState<string>("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const [plotRows, animalRows, herdRows, itemRows, templateRows] =
          await Promise.all([
            plotRepo.listByFarm(ctx, activeFarm.id),
            animalRepo.listAliveByFarm(ctx, activeFarm.id),
            herdRepo.listByFarm(ctx, activeFarm.id),
            inventoryItemRepo.listActiveByFarm(ctx, activeFarm.id),
            taskTemplateRepo.listActiveByFarm(ctx, activeFarm.id),
          ]);
        if (cancelled) return;
        setPlots(plotRows);
        setAnimals(animalRows);
        setHerds(herdRows);
        setItems(itemRows);

        if (mode === "edit" && taskId) {
          const existing = await taskRepo.getById(ctx, taskId);
          if (cancelled || !existing) return;
          setTitle(existing.title);
          setDescription(existing.description ?? "");
          setTaskType(existing.taskType);
          setPriority(existing.priority);
          setDueDate(existing.dueDate.slice(0, 10));
          setRecurrenceType(existing.recurrenceType);
          setTargetType(existing.targetType ?? NO_TARGET_TYPE);
          setTargetId(existing.targetId ?? "");
          setEstimatedHours(
            existing.estimatedHours != null
              ? String(existing.estimatedHours)
              : "",
          );
          setNotes(existing.notes ?? "");
        } else if (templateIdParam) {
          const tpl = templateRows.find((x) => x.id === templateIdParam);
          if (tpl && !cancelled) {
            setTitle(tpl.name);
            setDescription(tpl.description ?? "");
            setTaskType(tpl.taskType);
            setPriority(tpl.defaultPriority);
            setRecurrenceType(tpl.defaultRecurrenceType);
            setTargetType(tpl.defaultTargetType ?? NO_TARGET_TYPE);
            if (tpl.defaultDueOffsetDays != null) {
              const d = new Date();
              d.setUTCDate(d.getUTCDate() + tpl.defaultDueOffsetDays);
              setDueDate(d.toISOString().slice(0, 10));
            }
            setEstimatedHours(
              tpl.estimatedHours != null ? String(tpl.estimatedHours) : "",
            );
          }
        }
      } catch (err) {
        if (__DEV__) console.warn("[TaskForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, taskId, templateIdParam]);

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

  const targetInstanceOptions = useMemo(() => {
    if (targetType === "plot") {
      return plots.map((p) => ({ value: p.id, label: p.name }));
    }
    if (targetType === "animal") {
      return animals.map((a) => ({
        value: a.id,
        label: a.name ? `${a.name} (${a.tagId})` : a.tagId,
      }));
    }
    if (targetType === "herd") {
      return herds.map((h) => ({ value: h.id, label: h.name }));
    }
    if (targetType === "item") {
      return items.map((i) => ({ value: i.id, label: i.name }));
    }
    return [];
  }, [targetType, plots, animals, herds, items]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(dueDate.trim()).toISOString();
    const parsedHours = estimatedHours.trim()
      ? Number(estimatedHours.replace(",", "."))
      : null;

    const finalTargetType =
      targetType === NO_TARGET_TYPE ? null : (targetType as TaskTargetType);
    const finalTargetId =
      targetType === NO_TARGET_TYPE || targetType === "other"
        ? null
        : targetId || null;
    const picked = targetInstanceOptions.find((o) => o.value === targetId);
    const finalTargetLabel = picked?.label ?? null;

    try {
      if (mode === "create" && activeFarm) {
        await taskRepo.create(ctx, {
          farmId: activeFarm.id,
          templateId: templateIdParam ?? null,
          title: title.trim(),
          description: description.trim() || null,
          taskType,
          priority,
          dueDate: isoDate,
          recurrenceType,
          targetType: finalTargetType,
          targetId: finalTargetId,
          targetLabel: finalTargetLabel,
          estimatedHours: parsedHours,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && taskId) {
        await taskRepo.update(ctx, taskId, {
          title: title.trim(),
          description: description.trim() || null,
          taskType,
          priority,
          dueDate: isoDate,
          targetType: finalTargetType,
          targetId: finalTargetId,
          targetLabel: finalTargetLabel,
          estimatedHours: parsedHours,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_task_error" : "update_task_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[TaskForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    taskId,
    templateIdParam,
    title,
    description,
    taskType,
    priority,
    dueDate,
    recurrenceType,
    targetType,
    targetId,
    targetInstanceOptions,
    estimatedHours,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !taskId) return;
    const isSeries = taskId.indexOf("-o") > -1;
    if (isSeries) {
      Alert.alert(
        t("delete_task_series_title"),
        t("delete_task_series_message"),
        [
          { text: t("no"), style: "cancel" },
          {
            text: t("delete_task_single"),
            onPress: () => {
              void (async () => {
                try {
                  await taskRepo.softDelete(ctx, taskId);
                  navigation.goBack();
                } catch (err) {
                  if (__DEV__) console.warn("[TaskForm] delete failed", err);
                }
              })();
            },
          },
          {
            text: t("delete_task_series"),
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  const parentId = taskId.split("-o")[0];
                  await taskRepo.softDeleteSeries(ctx, parentId);
                  navigation.goBack();
                } catch (err) {
                  if (__DEV__)
                    console.warn("[TaskForm] series delete failed", err);
                }
              })();
            },
          },
        ],
      );
      return;
    }
    Alert.alert(t("delete_task_title"), t("delete_task_message"), [
      { text: t("no"), style: "cancel" },
      {
        text: t("yes"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await taskRepo.softDelete(ctx, taskId);
              navigation.goBack();
            } catch (err) {
              if (__DEV__) console.warn("[TaskForm] delete failed", err);
            }
          })();
        },
      },
    ]);
  }, [ctx, taskId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "what",
        titleKey: "step_task_what",
        hintKey: "step_task_what_hint",
        icon: "✅",
        validate: () => title.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("task_title")}
              hint={t("task_title_hint")}
              value={title}
              onChangeText={setTitle}
              required
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={200}
              returnKeyType="next"
            />
            <FormField
              label={t("task_description")}
              hint={t("task_description_hint")}
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={500}
              returnKeyType="next"
            />
            <SelectField<TaskType>
              label={t("task_type")}
              value={taskType}
              onChange={setTaskType}
              options={typeOptions}
            />
          </>
        ),
      },
      {
        id: "when",
        titleKey: "step_task_when",
        hintKey: "step_task_when_hint",
        icon: "📅",
        validate: () => {
          const s = dueDate.trim();
          if (!s) return false;
          const d = new Date(s);
          return !Number.isNaN(d.getTime());
        },
        render: () => (
          <>
            <DateField
              label={t("task_due_date")}
              value={dueDate}
              onChange={setDueDate}
              required
              clearable={false}
            />
            <SelectField<TaskPriority>
              label={t("task_priority")}
              value={priority}
              onChange={setPriority}
              options={priorityOptions}
            />
            {mode === "create" ? (
              <SelectField<RecurrenceType>
                label={t("task_recurrence")}
                value={recurrenceType}
                onChange={setRecurrenceType}
                options={recurrenceOptions}
              />
            ) : null}
          </>
        ),
      },
      {
        id: "link",
        titleKey: "step_task_link",
        hintKey: "step_task_link_hint",
        icon: "🔗",
        validate: () => {
          if (targetType === NO_TARGET_TYPE) return true;
          if (targetType === "other") return true;
          return targetId.length > 0;
        },
        isOptional: true,
        render: () => (
          <>
            <SelectField<string>
              label={t("task_target")}
              hint={t("task_target_hint")}
              value={targetType}
              onChange={(v) => {
                setTargetType(v);
                setTargetId("");
              }}
              options={targetTypeOptions}
            />
            {targetType !== NO_TARGET_TYPE && targetType !== "other" ? (
              <SelectField<string>
                label={t(keyForTargetType(targetType as TaskTargetType))}
                value={targetId}
                onChange={setTargetId}
                options={targetInstanceOptions}
              />
            ) : null}
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "step_task_extras",
        hintKey: "step_task_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("task_estimated_hours")}
              value={estimatedHours}
              onChangeText={setEstimatedHours}
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="next"
            />
            <FormField
              label={t("task_notes")}
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
      title,
      description,
      taskType,
      typeOptions,
      dueDate,
      priority,
      priorityOptions,
      mode,
      recurrenceType,
      recurrenceOptions,
      targetType,
      targetTypeOptions,
      targetId,
      targetInstanceOptions,
      estimatedHours,
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

  const submitLabel = mode === "create" ? t("create_task") : t("update_task");

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
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
