import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";
import { taskRepo, type Task, type TaskStatus } from "../db";
import {
  colorForPriority,
  colorForStatus,
  computeDueStatus,
  iconForRecurrence,
  iconForTaskType,
} from "../utils/taskLabels";
import type { RootStackScreenProps } from "../navigation/types";

type FilterKey =
  | "all"
  | "today"
  | "overdue"
  | "upcoming"
  | "pending"
  | "in_progress"
  | "completed";

const FILTERS: readonly FilterKey[] = [
  "today",
  "overdue",
  "upcoming",
  "all",
  "pending",
  "in_progress",
  "completed",
];

export const TasksScreen: React.FC<RootStackScreenProps<"Tasks">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [all, setAll] = useState<Task[]>([]);
  const [today, setToday] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [filter, setFilter] = useState<FilterKey>("today");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [allRows, todayRows, overdueRows, upcomingRows] = await Promise.all(
        [
          taskRepo.listByFarm(ctx, activeFarm.id),
          taskRepo.listTodays(ctx, activeFarm.id),
          taskRepo.listOverdue(ctx, activeFarm.id),
          taskRepo.listUpcoming(ctx, activeFarm.id, 30),
        ],
      );
      setAll(allRows);
      setToday(todayRows);
      setOverdue(overdueRows);
      setUpcoming(upcomingRows);
    } catch (err) {
      if (__DEV__) console.warn("[Tasks] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo<Task[]>(() => {
    if (filter === "today") return today;
    if (filter === "overdue") return overdue;
    if (filter === "upcoming") return upcoming;
    if (filter === "all") return all;
    return all.filter((task) => task.status === (filter as TaskStatus));
  }, [filter, today, overdue, upcoming, all]);

  const openTask = useCallback(
    (taskId: string): void => {
      navigation.navigate("TaskDetail", { taskId });
    },
    [navigation],
  );

  const addTask = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("TaskForm", {});
  }, [navigation]);

  const openCalendar = useCallback((): void => {
    navigation.navigate("Calendar");
  }, [navigation]);

  const openTemplates = useCallback((): void => {
    navigation.navigate("TaskTemplates");
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Task }) => {
      const due = computeDueStatus(item.dueDate);
      const priorityColor = colorForPriority(item.priority);
      const statusColor = colorForStatus(item.status);

      let dueLabel: string;
      if (due.kind === "overdue") {
        dueLabel = t("task_overdue_badge");
      } else if (due.kind === "today") {
        dueLabel = t("task_due_today_badge");
      } else if (due.kind === "tomorrow") {
        dueLabel = t("task_due_tomorrow_badge");
      } else {
        dueLabel = item.dueDate.slice(0, 10);
      }

      return (
        <Pressable
          onPress={() => openTask(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${dueLabel}`}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor:
                due.kind === "overdue" ? colors.danger : colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View
            style={[styles.priorityBar, { backgroundColor: priorityColor }]}
          />
          <View
            style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}
          >
            <Text style={styles.rowIconText}>
              {iconForTaskType(item.taskType)}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTitleLine}>
              <Text
                style={[styles.rowTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {item.recurrenceType !== "none" ? (
                <Text style={[styles.recurIcon, { color: colors.textMuted }]}>
                  {iconForRecurrence(item.recurrenceType)}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowMetaLine}>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
              />
              <Text
                style={[styles.rowMeta, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {dueLabel}
                {item.targetLabel ? ` · ${item.targetLabel}` : ""}
              </Text>
            </View>
          </View>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </Pressable>
      );
    },
    [colors, openTask, t],
  );

  const keyExtractor = useCallback((item: Task) => item.id, []);

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

  const counts = {
    today: today.length,
    overdue: overdue.length,
    upcoming: upcoming.length,
    all: all.length,
  };

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <View style={styles.headerBlock}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t("tasks_subtitle")}
        </Text>

        <View style={styles.shortcutRow}>
          <Pressable
            onPress={openCalendar}
            accessibilityRole="button"
            accessibilityLabel={t("calendar_title")}
            style={({ pressed }) => [
              styles.shortcut,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.shortcutEmoji}>📅</Text>
            <Text style={[styles.shortcutLabel, { color: colors.text }]}>
              {t("calendar_title")}
            </Text>
          </Pressable>

          <Pressable
            onPress={openTemplates}
            accessibilityRole="button"
            accessibilityLabel={t("task_templates")}
            style={({ pressed }) => [
              styles.shortcut,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.shortcutEmoji}>📋</Text>
            <Text style={[styles.shortcutLabel, { color: colors.text }]}>
              {t("task_templates")}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            const count =
              f === "today" ||
              f === "overdue" ||
              f === "upcoming" ||
              f === "all"
                ? counts[f]
                : undefined;
            const label = t(`task_filter_${f}`);
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? colors.onPrimary : colors.text },
                  ]}
                >
                  {label}
                  {count !== undefined ? ` (${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.bigIcon}>✅</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {all.length === 0 ? t("no_tasks") : t("task_empty_filter")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {all.length === 0
              ? t("no_tasks_hint")
              : t("task_empty_filter_hint")}
          </Text>
          {all.length === 0 ? (
            <BigButton
              label={t("add_first_task")}
              onPress={addTask}
              style={styles.stretch}
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        onPress={addTask}
        accessibilityRole="button"
        accessibilityLabel={t("add_task")}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary,
            bottom: insets.bottom + spacing.lg,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}
      >
        <Text style={[styles.fabIcon, { color: colors.onPrimary }]}>＋</Text>
      </Pressable>
    </Screen>
  );
};

const styles = StyleSheet.create({
  listContainer: { padding: 0 },
  listContent: { padding: spacing.md, gap: spacing.md },

  headerBlock: { padding: spacing.md, gap: spacing.md },
  subtitle: { ...typography.body },

  shortcutRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  shortcut: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 88,
    justifyContent: "center",
  },
  shortcutEmoji: { fontSize: 28 },
  shortcutLabel: { ...typography.caption, textAlign: "center" },

  filterStrip: { gap: spacing.sm, paddingVertical: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: "center",
  },
  filterText: { ...typography.label },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: { ...typography.body },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  emptySub: { ...typography.body, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },

  row: {
    minHeight: TOUCH_TARGET + 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    overflow: "hidden",
  },
  priorityBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs,
  },
  rowIconText: { fontSize: 24 },
  rowBody: { flex: 1, gap: 4 },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTitle: { ...typography.bodyBold, flex: 1 },
  recurIcon: { fontSize: 16 },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowMeta: { ...typography.caption, flex: 1 },
  chevron: { fontSize: 32, paddingHorizontal: spacing.sm },

  fab: {
    position: "absolute",
    right: spacing.lg,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  fabIcon: { fontSize: 34, lineHeight: 36, fontWeight: "700" },
});
