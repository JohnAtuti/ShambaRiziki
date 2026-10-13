import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
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
import { taskTemplateRepo, type TaskTemplate } from "../db";
import {
  colorForPriority,
  iconForRecurrence,
  iconForTaskType,
  keyForPriority,
  keyForRecurrence,
} from "../utils/taskLabels";
import type { RootStackScreenProps } from "../navigation/types";

export const TaskTemplatesScreen: React.FC<
  RootStackScreenProps<"TaskTemplates">
> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const rows = await taskTemplateRepo.listByFarm(ctx, activeFarm.id);
      setTemplates(rows);
    } catch (err) {
      if (__DEV__) console.warn("[TaskTemplates] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openTemplate = useCallback(
    (templateId: string): void => {
      navigation.navigate("TaskTemplateForm", { templateId });
    },
    [navigation],
  );

  const addTemplate = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("TaskTemplateForm", {});
  }, [navigation]);

  const startFromTemplate = useCallback(
    (templateId: string): void => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      navigation.navigate("TaskForm", { templateId });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: TaskTemplate }) => {
      const priorityColor = colorForPriority(item.defaultPriority);
      return (
        <View
          style={[
            styles.row,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => openTemplate(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            style={({ pressed }) => [
              styles.rowMain,
              { opacity: pressed ? 0.85 : 1 },
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
              <Text
                style={[styles.rowTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text
                style={[styles.rowMeta, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {t(keyForPriority(item.defaultPriority))}
                {item.defaultRecurrenceType !== "none"
                  ? ` · ${iconForRecurrence(item.defaultRecurrenceType)} ${t(
                      keyForRecurrence(item.defaultRecurrenceType),
                    )}`
                  : ""}
                {!item.isActive ? ` · ${t("task_status_cancelled")}` : ""}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => startFromTemplate(item.id)}
            accessibilityRole="button"
            accessibilityLabel={t("template_use")}
            style={({ pressed }) => [
              styles.useBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.useBtnText, { color: colors.onPrimary }]}>
              {t("template_use")}
            </Text>
          </Pressable>
        </View>
      );
    },
    [colors, openTemplate, startFromTemplate, t],
  );

  const keyExtractor = useCallback((item: TaskTemplate) => item.id, []);

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

  if (templates.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("no_templates")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("no_templates_hint")}
          </Text>
          <BigButton
            label={t("add_first_template")}
            onPress={addTemplate}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <FlatList
        data={templates}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      />
      <Pressable
        onPress={addTemplate}
        accessibilityRole="button"
        accessibilityLabel={t("add_template")}
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
  emptySub: { ...typography.body, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },
  row: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  rowMain: {
    minHeight: TOUCH_TARGET + 16,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyBold },
  rowMeta: { ...typography.caption },
  useBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  useBtnText: { ...typography.label, fontWeight: "800" },
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
