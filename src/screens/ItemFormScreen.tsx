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
import { inventoryItemRepo, ValidationError, type ItemCategory } from "../db";
import {
  ITEM_CATEGORY_VALUES,
  iconForItemCategory,
  keyForItemCategory,
} from "../utils/inventoryLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const ItemFormScreen: React.FC<RootStackScreenProps<"ItemForm">> = ({
  route,
  navigation,
}) => {
  const { itemId } = route.params ?? {};
  const mode: Mode = itemId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<ItemCategory>("other");
  const [unit, setUnit] = useState("unit");
  const [description, setDescription] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [defaultCost, setDefaultCost] = useState("");
  const [defaultCostCurrency, setDefaultCostCurrency] = useState("KES");
  const [preferredSupplier, setPreferredSupplier] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !itemId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await inventoryItemRepo.getById(ctx, itemId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setSku(existing.sku ?? "");
        setCategory(existing.category);
        setUnit(existing.unit);
        setDescription(existing.description ?? "");
        setReorderLevel(
          existing.reorderLevel != null ? String(existing.reorderLevel) : "",
        );
        setReorderQuantity(
          existing.reorderQuantity != null
            ? String(existing.reorderQuantity)
            : "",
        );
        setDefaultCost(
          existing.defaultCost != null ? String(existing.defaultCost) : "",
        );
        setDefaultCostCurrency(existing.defaultCostCurrency ?? "KES");
        setPreferredSupplier(existing.preferredSupplier ?? "");
        setIsActive(existing.isActive);
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[ItemForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, itemId]);

  const categoryOptions = useMemo(
    () =>
      ITEM_CATEGORY_VALUES.map((value) => ({
        value,
        label: t(keyForItemCategory(value)),
        icon: iconForItemCategory(value),
      })),
    [t],
  );

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parseOptNum = (raw: string): number | null => {
      if (!raw.trim()) return null;
      const n = Number(raw.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };

    const parsedReorderLevel = parseOptNum(reorderLevel);
    const parsedReorderQuantity = parseOptNum(reorderQuantity);
    const parsedCost = parseOptNum(defaultCost);

    try {
      if (mode === "create" && activeFarm) {
        await inventoryItemRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          sku: sku.trim() || null,
          category,
          unit: unit.trim() || "unit",
          description: description.trim() || null,
          reorderLevel: parsedReorderLevel,
          reorderQuantity: parsedReorderQuantity,
          defaultCost: parsedCost,
          defaultCostCurrency: defaultCostCurrency.trim() || null,
          preferredSupplier: preferredSupplier.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && itemId) {
        await inventoryItemRepo.update(ctx, itemId, {
          name: name.trim(),
          sku: sku.trim() || null,
          category,
          unit: unit.trim() || "unit",
          description: description.trim() || null,
          reorderLevel: parsedReorderLevel,
          reorderQuantity: parsedReorderQuantity,
          defaultCost: parsedCost,
          defaultCostCurrency: defaultCostCurrency.trim() || null,
          preferredSupplier: preferredSupplier.trim() || null,
          isActive,
          notes: notes.trim() || null,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_item_error" : "update_item_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[ItemForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    itemId,
    name,
    sku,
    category,
    unit,
    description,
    reorderLevel,
    reorderQuantity,
    defaultCost,
    defaultCostCurrency,
    preferredSupplier,
    isActive,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !itemId) return;
    Alert.alert(
      t("delete_item_title"),
      t("delete_item_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await inventoryItemRepo.softDelete(ctx, itemId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[ItemForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, itemId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "step_item_identity",
        hintKey: "step_item_identity_hint",
        icon: "📦",
        validate: () => name.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("item_name")}
              hint={t("item_name_hint")}
              value={name}
              onChangeText={setName}
              required
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={150}
              returnKeyType="next"
            />
            <FormField
              label={t("item_sku")}
              hint={t("item_sku_hint")}
              value={sku}
              onChangeText={setSku}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={50}
              returnKeyType="next"
            />
            <SelectField<ItemCategory>
              label={t("item_category")}
              value={category}
              onChange={setCategory}
              options={categoryOptions}
            />
          </>
        ),
      },
      {
        id: "details",
        titleKey: "step_item_details",
        hintKey: "step_item_details_hint",
        icon: "💵",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("item_unit")}
              hint={t("item_unit_hint")}
              value={unit}
              onChangeText={setUnit}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="next"
            />
            <FormField
              label={t("item_description")}
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={500}
              returnKeyType="next"
            />
            <FormField
              label={t("item_default_cost")}
              hint={t("item_default_cost_hint")}
              value={defaultCost}
              onChangeText={setDefaultCost}
              keyboardType="decimal-pad"
              maxLength={12}
              returnKeyType="next"
            />
            <FormField
              label={t("cost_currency")}
              hint="KES"
              value={defaultCostCurrency}
              onChangeText={setDefaultCostCurrency}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={5}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "reorder",
        titleKey: "step_item_reorder",
        hintKey: "step_item_reorder_hint",
        icon: "⚠️",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("item_reorder_level")}
              hint={t("item_reorder_level_hint")}
              value={reorderLevel}
              onChangeText={setReorderLevel}
              keyboardType="decimal-pad"
              maxLength={10}
              returnKeyType="next"
            />
            <FormField
              label={t("item_reorder_quantity")}
              hint={t("item_reorder_quantity_hint")}
              value={reorderQuantity}
              onChangeText={setReorderQuantity}
              keyboardType="decimal-pad"
              maxLength={10}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "step_item_extras",
        hintKey: "step_item_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("item_preferred_supplier")}
              hint={t("item_preferred_supplier_hint")}
              value={preferredSupplier}
              onChangeText={setPreferredSupplier}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={150}
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
                  {t("item_is_active")}
                </Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            ) : null}
            <FormField
              label={t("item_notes")}
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
      sku,
      categoryOptions,
      category,
      unit,
      description,
      defaultCost,
      defaultCostCurrency,
      reorderLevel,
      reorderQuantity,
      preferredSupplier,
      isActive,
      notes,
      mode,
      colors,
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

  const submitLabel = mode === "create" ? t("create_item") : t("update_item");

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
