import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { taskRepo, type Task } from "../db";
import { colorForPriority, iconForTaskType } from "../utils/taskLabels";
import type { RootStackScreenProps } from "../navigation/types";

const MONTH_KEYS = [
  "month_jan",
  "month_feb",
  "month_mar",
  "month_apr",
  "month_may",
  "month_jun",
  "month_jul",
  "month_aug",
  "month_sep",
  "month_oct",
  "month_nov",
  "month_dec",
] as const;

const WEEKDAY_KEYS = [
  "weekday_sun",
  "weekday_mon",
  "weekday_tue",
  "weekday_wed",
  "weekday_thu",
  "weekday_fri",
  "weekday_sat",
] as const;

type Cell = {
  day: number; // day of month
  iso: string; // ISO date string for that day (UTC midnight)
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
};

const startOfUtcMonth = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

const addUtcMonths = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

const isoForUtcDay = (d: Date): string => {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
};

const sameUtcDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

export const CalendarScreen: React.FC<RootStackScreenProps<"Calendar">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [cursor, setCursor] = useState<Date>(() => startOfUtcMonth(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      // Fetch the full visible 6-week window so partial-week overflow cells
      // are populated too.
      const gridStart = new Date(cursor);
      gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
      const gridEnd = new Date(gridStart);
      gridEnd.setUTCDate(gridEnd.getUTCDate() + 42);

      const rows = await taskRepo.listBetween(
        ctx,
        activeFarm.id,
        isoForUtcDay(gridStart),
        isoForUtcDay(gridEnd),
      );
      setTasks(rows);
    } catch (err) {
      if (__DEV__) console.warn("[Calendar] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm, cursor]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const grid = useMemo<Cell[]>(() => {
    const monthStart = startOfUtcMonth(cursor);
    const gridStart = new Date(monthStart);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

    const today = new Date();
    const cells: Cell[] = [];

    // Bucket tasks by ISO day for O(1) lookup while building cells.
    const byDay = new Map<string, Task[]>();
    for (const task of tasks) {
      const day = task.dueDate.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(task);
      byDay.set(day, list);
    }

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = isoForUtcDay(d);
      const dayKey = iso.slice(0, 10);
      cells.push({
        day: d.getUTCDate(),
        iso,
        inMonth: d.getUTCMonth() === monthStart.getUTCMonth(),
        isToday: sameUtcDay(d, today),
        tasks: byDay.get(dayKey) ?? [],
      });
    }
    return cells;
  }, [cursor, tasks]);

  const onPrev = useCallback((): void => {
    setCursor((c) => addUtcMonths(c, -1));
  }, []);

  const onNext = useCallback((): void => {
    setCursor((c) => addUtcMonths(c, 1));
  }, []);

  const onToday = useCallback((): void => {
    setCursor(startOfUtcMonth(new Date()));
  }, []);

  const openTask = useCallback(
    (taskId: string): void => {
      navigation.navigate("TaskDetail", { taskId });
    },
    [navigation],
  );

  const monthLabel = `${t(MONTH_KEYS[cursor.getUTCMonth()])} ${cursor.getUTCFullYear()}`;

  return (
    <Screen scroll={false}>
      <View style={styles.headerBlock}>
        <View style={styles.monthRow}>
          <Pressable
            onPress={onPrev}
            accessibilityRole="button"
            accessibilityLabel={t("calendar_prev_month")}
            style={styles.navBtn}
          >
            <Text style={[styles.navBtnText, { color: colors.primary }]}>
              ‹
            </Text>
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {monthLabel}
          </Text>
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={t("calendar_next_month")}
            style={styles.navBtn}
          >
            <Text style={[styles.navBtnText, { color: colors.primary }]}>
              ›
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={onToday}
          accessibilityRole="button"
          accessibilityLabel={t("calendar_today")}
          style={[
            styles.todayChip,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.todayChipText, { color: colors.text }]}>
            {t("calendar_today")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_KEYS.map((key) => (
          <Text
            key={key}
            style={[styles.weekdayText, { color: colors.textMuted }]}
          >
            {t(key)}
          </Text>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            …
          </Text>
        ) : (
          <View style={styles.grid}>
            {grid.map((cell) => (
              <View
                key={cell.iso}
                style={[
                  styles.cell,
                  {
                    backgroundColor: cell.inMonth
                      ? colors.surface
                      : colors.surfaceAlt,
                    borderColor: cell.isToday ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cellDay,
                    {
                      color: cell.isToday
                        ? colors.primary
                        : cell.inMonth
                          ? colors.text
                          : colors.textMuted,
                      fontWeight: cell.isToday ? "900" : "700",
                    },
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.cellTasks}>
                  {cell.tasks.slice(0, 2).map((task) => (
                    <Pressable
                      key={task.id}
                      onPress={() => openTask(task.id)}
                      accessibilityRole="button"
                      accessibilityLabel={task.title}
                      style={[
                        styles.cellTask,
                        {
                          backgroundColor: colorForPriority(task.priority),
                        },
                      ]}
                    >
                      <Text style={styles.cellTaskText} numberOfLines={1}>
                        {iconForTaskType(task.taskType)} {task.title}
                      </Text>
                    </Pressable>
                  ))}
                  {cell.tasks.length > 2 ? (
                    <Text
                      style={[styles.cellMore, { color: colors.textMuted }]}
                    >
                      {t("calendar_more_tasks", {
                        count: cell.tasks.length - 2,
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnText: { fontSize: 32, fontWeight: "700" },
  monthLabel: { ...typography.h2, textAlign: "center", flex: 1 },
  todayChip: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: "center",
  },
  todayChipText: { ...typography.caption, fontWeight: "800" },

  weekdayRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    ...typography.caption,
    fontWeight: "800",
  },

  gridContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  loadingText: { ...typography.body, textAlign: "center", padding: spacing.xl },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "14.2857%",
    aspectRatio: 1,
    borderWidth: 1,
    padding: 4,
    gap: 2,
  },
  cellDay: { fontSize: 14, fontWeight: "700" },
  cellTasks: { flex: 1, gap: 2 },
  cellTask: {
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  cellTaskText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  cellMore: { fontSize: 9, fontWeight: "700" },
});
