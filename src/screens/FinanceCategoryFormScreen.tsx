import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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
  financeCategoryRepo,
  ValidationError,
  type FinanceCategory,
  type FinanceCategoryType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const TYPE_OPTIONS: readonly {
  value: FinanceCategoryType;
  key: string;
  icon: string;
}[] = [
  {
    value: "income",
    key: "finance_category_type_income",
    icon: "💰",
  },
  {
    value: "expense",
    key: "finance_category_type_expense",
    icon: "💸",
  },
];

export const FinanceCategoryFormScreen: React.FC<
  RootStackScreenProps<"FinanceCategoryForm">
> = ({ route, navigation }) => {
  const { categoryId } = route.params ?? {};
  const mode: Mode = categoryId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [categoryType, setCategoryType] =
    useState<FinanceCategoryType>("expense");
  const [parentId, setParentId] = useState<string>("");
  const [icon, setIcon] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [existing, setExisting] = useState<FinanceCategory | null>(null);
  const [siblings, setSiblings] = useState<FinanceCategory[]>([]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        if (mode === "edit" && categoryId) {
          const cat = await financeCategoryRepo.getById(ctx, categoryId);
          if (cancelled || !cat) return;
          setExisting(cat);
          setName(cat.name);
          setCategoryType(cat.categoryType);
          setParentId(cat.parentId ?? "");
          setIcon(cat.icon ?? "");
          setIsActive(cat.isActive);
        }
        if (!cancelled) setHydrating(false);
      } catch (err) {
        if (__DEV__) console.warn("[FinanceCategoryForm] hydrate failed", err);
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, activeFarm, categoryId]);

  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await financeCategoryRepo.listByType(
          ctx,
          activeFarm.id,
          categoryType,
        );
        if (cancelled) return;
        setSiblings(list);
      } catch (err) {
        if (__DEV__)
          console.warn("[FinanceCategoryForm] siblings load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, categoryType]);

  const typeOptions = useMemo(
    () =>
      TYPE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
        icon: o.icon,
      })),
    [t],
  );
  const parentOptions = useMemo(() => {
    const filtered = siblings.filter((c) => c.id !== categoryId);
    return [
      { value: "", label: t("finance_category_parent"), icon: "—" },
      ...filtered.map((c) => ({
        value: c.id,
        label: c.name,
        icon: c.icon ?? "🏷️",
      })),
    ];
  }, [siblings, categoryId, t]);
  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create" && activeFarm) {
        await financeCategoryRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          categoryType,
          parentId: parentId || null,
          icon: icon.trim() || null,
        });
      } else if (mode === "edit" && categoryId) {
        await financeCategoryRepo.update(ctx, categoryId, {
          name: name.trim(),
          parentId: parentId || null,
          icon: icon.trim() || null,
          isActive,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(
              mode === "create"
                ? "finance_category_create_error"
                : "finance_category_update_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[FinanceCategoryForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    categoryId,
    name,
    categoryType,
    parentId,
    icon,
    isActive,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !categoryId || !existing) return;
    if (existing.isSystem) {
      Alert.alert(
        t("finance_category_delete_title"),
        t("finance_category_system"),
      );
      return;
    }
    Alert.alert(
      t("finance_category_delete_title"),
      t("finance_category_delete_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await financeCategoryRepo.softDelete(ctx, categoryId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[FinanceCategoryForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, categoryId, existing, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "finance_category_name",
        hintKey: "finance_categories_hint",
        icon: "🏷️",
        validate: () => name.trim().length > 0,
        render: () => (
          <>
            <SelectField<FinanceCategoryType>
              label={t("finance_category_type")}
              value={categoryType}
              onChange={setCategoryType}
              options={typeOptions}
            />
            <FormField
              label={t("finance_category_name")}
              hint={t("finance_category_name_hint")}
              value={name}
              onChangeText={setName}
              required
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
            />
            <SelectField<string>
              label={t("finance_category_parent")}
              value={parentId}
              onChange={setParentId}
              options={parentOptions}
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "finance_category_icon",
        hintKey: "finance_category_icon_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <FormField
            label={t("finance_category_icon")}
            hint={t("finance_category_icon_hint")}
            value={icon}
            onChangeText={setIcon}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={4}
            returnKeyType="done"
          />
        ),
      },
    ],
    [t, name, categoryType, typeOptions, parentId, parentOptions, icon],
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
    mode === "create"
      ? t("finance_category_create")
      : t("finance_category_update");

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
            disabled={existing?.isSystem === true}
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
