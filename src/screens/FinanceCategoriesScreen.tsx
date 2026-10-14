import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { financeCategoryRepo, type FinanceCategory } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

const DEFAULT_ICON = "🏷️";

const openCategory = (
  navigation: RootStackScreenProps<"FinanceCategories">["navigation"],
  categoryId: string,
): void => {
  navigation.navigate("FinanceCategoryForm", { categoryId });
};

const renderCategoryRow = (
  category: FinanceCategory,
  colors: ReturnType<typeof useTheme>["colors"],
  t: (k: string) => string,
  onPress: () => void,
): React.ReactElement => {
  const icon = category.icon ?? DEFAULT_ICON;
  return (
    <Pressable
      key={category.id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${category.categoryType}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {category.name}
        </Text>
        {category.parentId ? (
          <Text
            style={[styles.rowMeta, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {t("finance_category_parent")}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
    </Pressable>
  );
};

export const FinanceCategoriesScreen: React.FC<
  RootStackScreenProps<"FinanceCategories">
> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ctx, activeFarm } = useAppState();

  const [income, setIncome] = useState<FinanceCategory[]>([]);
  const [expense, setExpense] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadCategories = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) {
      setLoading(false);
      return;
    }
    try {
      const [incomeList, expenseList] = await Promise.all([
        financeCategoryRepo.listByType(ctx, activeFarm.id, "income"),
        financeCategoryRepo.listByType(ctx, activeFarm.id, "expense"),
      ]);
      setIncome(incomeList);
      setExpense(expenseList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void loadCategories();
    }, [loadCategories]),
  );

  const addCategory = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate("FinanceCategoryForm", {});
  }, [navigation]);

  const seedDefaults = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    setSeeding(true);
    try {
      await financeCategoryRepo.seedDefaults(ctx, activeFarm.id);
      await loadCategories();
    } catch (err) {
      if (__DEV__) console.warn("[FinanceCategories] seed failed", err);
    } finally {
      setSeeding(false);
    }
  }, [ctx, activeFarm, loadCategories]);

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

  if (error) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {error.message}
          </Text>
          <BigButton
            label={t("yes")}
            onPress={() => void loadCategories()}
            variant="secondary"
            style={styles.retry}
          />
        </View>
      </Screen>
    );
  }

  const isEmpty = income.length === 0 && expense.length === 0;

  if (isEmpty) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🏷️</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("finance_no_categories")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("finance_no_categories_hint")}
          </Text>
          <BigButton
            label={t("finance_add_category")}
            onPress={addCategory}
            style={styles.emptyCta}
          />
          <BigButton
            label={t("finance_add_first_category")}
            onPress={() => void seedDefaults()}
            variant="secondary"
            disabled={seeding}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.listContainer}>
      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + TOUCH_TARGET + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {income.length > 0 ? (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
              {t("finance_category_type_income")}
            </Text>
            {income.map((c) =>
              renderCategoryRow(c, colors, t, () =>
                openCategory(navigation, c.id),
              ),
            )}
          </>
        ) : null}

        {expense.length > 0 ? (
          <>
            <Text
              style={[
                styles.sectionHeader,
                { color: colors.textMuted, marginTop: spacing.lg },
              ]}
            >
              {t("finance_category_type_expense")}
            </Text>
            {expense.map((c) =>
              renderCategoryRow(c, colors, t, () =>
                openCategory(navigation, c.id),
              ),
            )}
          </>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={addCategory}
        accessibilityRole="button"
        accessibilityLabel={t("finance_add_category")}
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
  listContent: { padding: spacing.md, gap: spacing.sm },
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
  emptyCta: { marginTop: spacing.md, alignSelf: "stretch" },
  retry: { marginTop: spacing.lg, alignSelf: "stretch" },

  sectionHeader: {
    ...typography.label,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },

  row: {
    minHeight: TOUCH_TARGET + 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconText: { fontSize: 26 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyBold },
  rowMeta: { ...typography.caption },
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
