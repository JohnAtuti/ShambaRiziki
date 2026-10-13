import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { taskRepo, type Task } from "../db";
import {
  colorForPriority,
  colorForStatus,
  computeDueStatus,
  iconForRecurrence,
  iconForStatus,
  iconForTaskType,
  keyForPriority,
  keyForRecurrence,
  keyForStatus,
  keyForTargetType,
  keyForTaskType,
} from "../utils/taskLabels";
import type { RootStackScreenProps } from "../navigation/types";

const InfoRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
};

export const TaskDetailScreen: React.FC<RootStackScreenProps<"TaskDetail">> = ({
  route,
  navigation,
}) => {
  const { taskId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx } = useAppState();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const loaded = await taskRepo.getById(ctx, taskId);
      setTask(loaded);
    } catch (err) {
      if (__DEV__) console.warn("[TaskDetail] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, taskId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (task) navigation.setOptions({ title: task.title });
  }, [task, navigation]);

  const onEdit = useCallback((): void => {
    navigation.navigate("TaskForm", { taskId });
  }, [navigation, taskId]);

  const onComplete = useCallback((): void => {
    if (!ctx) return;
    Alert.alert(t("complete_task_title"), t("complete_task_hint"), [
      { text: t("no"), style: "cancel" },
      {
        text: t("yes"),
        onPress: () => {
          void (async () => {
            try {
              await taskRepo.complete(ctx, taskId, {});
              await load();
            } catch (err) {
              if (__DEV__) console.warn("[TaskDetail] complete failed", err);
            }
          })();
        },
      },
    ]);
  }, [ctx, taskId, load, t]);

  const onReopen = useCallback((): void => {
    if (!ctx) return;
    void (async () => {
      try {
        await taskRepo.update(ctx, taskId, {
          status: "pending",
          completedAt: null,
          completedBy: null,
        });
        await load();
      } catch (err) {
        if (__DEV__) console.warn("[TaskDetail] reopen failed", err);
      }
    })();
  }, [ctx, taskId, load]);

  if (loading) {
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

  if (!task) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("task_not_found")}
          </Text>
          <BigButton
            label={t("back")}
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  const due = computeDueStatus(task.dueDate);
  let dueText: string;
  if (due.kind === "overdue") dueText = t("task_overdue_badge");
  else if (due.kind === "today") dueText = t("task_due_today_badge");
  else if (due.kind === "tomorrow") dueText = t("task_due_tomorrow_badge");
  else dueText = task.dueDate.slice(0, 10);

  const priorityColor = colorForPriority(task.priority);
  const statusColor = colorForStatus(task.status);
  const isCompleted = task.status === "completed";

  return (
    <Screen
      scroll={false}
      footer={
        <View style={styles.footerRow}>
          {isCompleted ? (
            <BigButton
              label={t("reopen_task")}
              onPress={onReopen}
              variant="secondary"
              style={styles.footerButton}
            />
          ) : (
            <BigButton
              label={t("complete_task")}
              onPress={onComplete}
              variant="primary"
              style={styles.footerButton}
            />
          )}
          <BigButton
            label={t("edit")}
            onPress={onEdit}
            variant="secondary"
            style={styles.footerButton}
          />
        </View>
      }
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>
              {iconForTaskType(task.taskType)}
            </Text>
            <View style={styles.titleText}>
              <Text style={[styles.title, { color: colors.text }]}>
                {task.title}
              </Text>
              {task.description ? (
                <Text
                  style={[styles.subtitle, { color: colors.textMuted }]}
                  numberOfLines={3}
                >
                  {task.description}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: statusColor }]}>
              <Text style={styles.badgeText}>
                {iconForStatus(task.status)} {t(keyForStatus(task.status))}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: priorityColor }]}>
              <Text style={styles.badgeText}>
                {t(keyForPriority(task.priority))}
              </Text>
            </View>
            {task.recurrenceType !== "none" ? (
              <View
                style={[styles.badge, { backgroundColor: colors.textMuted }]}
              >
                <Text style={styles.badgeText}>
                  {iconForRecurrence(task.recurrenceType)}{" "}
                  {t(keyForRecurrence(task.recurrenceType))}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <InfoRow
            label={t("task_due_date")}
            value={`${dueText} (${task.dueDate.slice(0, 10)})`}
          />
          <InfoRow
            label={t("task_type")}
            value={t(keyForTaskType(task.taskType))}
          />
          {task.targetType ? (
            <InfoRow
              label={t("task_target")}
              value={
                task.targetLabel
                  ? `${t(keyForTargetType(task.targetType))}: ${task.targetLabel}`
                  : t(keyForTargetType(task.targetType))
              }
            />
          ) : null}
          {task.estimatedHours != null ? (
            <InfoRow
              label={t("task_estimated_hours")}
              value={`${task.estimatedHours} h`}
            />
          ) : null}
          {task.actualHours != null ? (
            <InfoRow
              label={t("task_actual_hours")}
              value={`${task.actualHours} h`}
            />
          ) : null}
          {task.completedAt ? (
            <InfoRow
              label={t("task_completed_at")}
              value={task.completedAt.slice(0, 10)}
            />
          ) : null}
          {task.notes ? (
            <InfoRow label={t("task_notes")} value={task.notes} />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xl },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },

  headerBlock: { marginBottom: spacing.lg, gap: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  titleEmoji: { fontSize: 48 },
  titleText: { flex: 1, gap: 4 },
  title: { ...typography.h1 },
  subtitle: { ...typography.body },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  infoCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  infoRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  infoLabel: { ...typography.caption },
  infoValue: { ...typography.body },

  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
