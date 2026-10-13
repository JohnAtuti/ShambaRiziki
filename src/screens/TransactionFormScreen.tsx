import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  animalRepo,
  herdRepo,
  inventoryItemRepo,
  inventoryTransactionRepo,
  plotRepo,
  ValidationError,
  warehouseRepo,
  type Animal,
  type Herd,
  type InventoryItem,
  type InventoryTargetType,
  type InventoryTransactionType,
  type Plot,
  type Warehouse,
} from "../db";
import {
  iconForTransactionType,
  keyForTargetType,
  keyForTransactionType,
  TRANSACTION_TYPE_VALUES,
} from "../utils/inventoryLabels";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const NO_WAREHOUSE = "__none__";
const NO_TARGET_TYPE = "__none__";

// Only these target types are surfaced in the picker. crop_cycle is
// supported by the schema but not shown in v1 UI; users can pick "Other"
// and describe the target in the free-text field.
const PICKABLE_TARGET_TYPES: readonly InventoryTargetType[] = [
  "plot",
  "animal",
  "herd",
  "worker",
  "other",
];

const usesTarget = (type: InventoryTransactionType): boolean =>
  type === "issue" || type === "return";

const usesSupplierAndBatch = (type: InventoryTransactionType): boolean =>
  type === "purchase";

const usesCost = (type: InventoryTransactionType): boolean =>
  type === "purchase";

const allowsNegativeQuantity = (type: InventoryTransactionType): boolean =>
  type === "stocktake";

export const TransactionFormScreen: React.FC<
  RootStackScreenProps<"TransactionForm">
> = ({ route, navigation }) => {
  const { itemId, transactionId } = route.params;
  const mode: Mode = transactionId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [herds, setHerds] = useState<Herd[]>([]);

  const [transactionType, setTransactionType] =
    useState<InventoryTransactionType>("purchase");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>(NO_WAREHOUSE);
  const [unitCost, setUnitCost] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [costCurrency, setCostCurrency] = useState("KES");
  const [supplier, setSupplier] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [reference, setReference] = useState("");
  const [targetType, setTargetType] = useState<string>(NO_TARGET_TYPE);
  const [targetId, setTargetId] = useState<string>("");
  const [targetFreeText, setTargetFreeText] = useState("");
  const [notes, setNotes] = useState("");

  const [dateError, setDateError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // ---------------------------------------------------------------------
  // Hydrate: load reference data, and existing transaction when editing.
  // Every setState in this effect happens after the first await, so the
  // react-hooks/set-state-in-effect rule's synchronous-mutation concern
  // does not apply. Same pattern as AppStateContext.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const [warehouseRows, plotRows, animalRows, herdRows] =
          await Promise.all([
            warehouseRepo.listByFarm(ctx, activeFarm.id),
            plotRepo.listByFarm(ctx, activeFarm.id),
            animalRepo.listAliveByFarm(ctx, activeFarm.id),
            herdRepo.listByFarm(ctx, activeFarm.id),
          ]);
        if (cancelled) return;
        setWarehouses(warehouseRows);
        setPlots(plotRows);
        setAnimals(animalRows);
        setHerds(herdRows);

        if (mode === "edit" && transactionId) {
          const existing = await inventoryTransactionRepo.getById(
            ctx,
            transactionId,
          );
          if (cancelled || !existing) return;
          const existingItem = await inventoryItemRepo.getById(
            ctx,
            existing.itemId,
          );
          if (cancelled) return;
          setItem(existingItem ?? null);

          setTransactionType(existing.transactionType);
          setTransactionDate(existing.transactionDate.slice(0, 10));
          setQuantity(String(existing.quantity));
          setQuantityUnit(existing.quantityUnit ?? existingItem?.unit ?? "");
          setWarehouseId(existing.warehouseId ?? NO_WAREHOUSE);
          setUnitCost(
            existing.unitCost != null ? String(existing.unitCost) : "",
          );
          setTotalCost(
            existing.totalCost != null ? String(existing.totalCost) : "",
          );
          setCostCurrency(existing.costCurrency ?? "KES");
          setSupplier(existing.supplier ?? "");
          setBatchNumber(existing.batchNumber ?? "");
          setExpiryDate(
            existing.expiryDate ? existing.expiryDate.slice(0, 10) : "",
          );
          setReference(existing.reference ?? "");
          setTargetType(existing.targetType ?? NO_TARGET_TYPE);
          setTargetId(existing.targetId ?? "");
          // Any free-text label is loaded here; when the target type is a
          // picker (plot/animal/herd), the label is re-derived at submit
          // time from the picked instance.
          setTargetFreeText(existing.targetLabel ?? "");
          setNotes(existing.notes ?? "");
        } else if (itemId) {
          const loadedItem = await inventoryItemRepo.getById(ctx, itemId);
          if (cancelled) return;
          setItem(loadedItem ?? null);
          if (loadedItem) {
            setQuantityUnit(loadedItem.unit);
            if (loadedItem.defaultCost != null) {
              setUnitCost(String(loadedItem.defaultCost));
            }
            if (loadedItem.defaultCostCurrency) {
              setCostCurrency(loadedItem.defaultCostCurrency);
            }
            if (loadedItem.preferredSupplier) {
              setSupplier(loadedItem.preferredSupplier);
            }
          }
        }
      } catch (err) {
        if (__DEV__) console.warn("[TransactionForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode, transactionId, itemId]);

  // ---------------------------------------------------------------------
  // Option lists
  // ---------------------------------------------------------------------

  const typeOptions = useMemo(
    () =>
      TRANSACTION_TYPE_VALUES.map((value) => ({
        value,
        label: t(keyForTransactionType(value)),
        icon: iconForTransactionType(value),
      })),
    [t],
  );

  const warehouseOptions = useMemo(() => {
    const opts = warehouses.map((w) => ({ value: w.id, label: w.name }));
    return [{ value: NO_WAREHOUSE, label: t("not_set") }, ...opts];
  }, [warehouses, t]);

  const targetTypeOptions = useMemo(() => {
    const opts = PICKABLE_TARGET_TYPES.map((value) => ({
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
    return [];
  }, [targetType, plots, animals, herds]);

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    let ok = true;

    if (!transactionDate.trim()) {
      setDateError(t("transaction_date_required"));
      ok = false;
    } else {
      const parsed = new Date(transactionDate.trim());
      if (Number.isNaN(parsed.getTime())) {
        setDateError(t("invalid_number"));
        ok = false;
      } else {
        setDateError(null);
      }
    }

    const qtyTrimmed = quantity.trim();
    if (!qtyTrimmed) {
      setQuantityError(t("transaction_quantity_required"));
      ok = false;
    } else {
      const parsed = Number(qtyTrimmed.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        setQuantityError(t("invalid_number"));
        ok = false;
      } else if (parsed === 0) {
        setQuantityError(t("transaction_requires_positive"));
        ok = false;
      } else if (!allowsNegativeQuantity(transactionType) && parsed < 0) {
        setQuantityError(t("transaction_requires_positive"));
        ok = false;
      } else {
        setQuantityError(null);
      }
    }

    if (usesTarget(transactionType)) {
      if (targetType === NO_TARGET_TYPE) {
        setTargetError(t("required"));
        ok = false;
      } else if (targetType === "other" || targetType === "worker") {
        if (!targetFreeText.trim()) {
          setTargetError(t("required"));
          ok = false;
        } else {
          setTargetError(null);
        }
      } else if (!targetId) {
        setTargetError(t("required"));
        ok = false;
      } else {
        setTargetError(null);
      }
    } else {
      setTargetError(null);
    }

    return ok;
  }, [
    transactionDate,
    quantity,
    transactionType,
    targetType,
    targetId,
    targetFreeText,
    t,
  ]);

  // ---------------------------------------------------------------------
  // Submit
  //
  // The final target label is derived here from the picked instance (for
  // plot/animal/herd) or from the free-text field (for worker/other).
  // This avoids storing derived state, which would trip the set-state-in-
  // effect rule.
  // ---------------------------------------------------------------------

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx || !item) return;
    if (!validate()) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const isoDate = new Date(transactionDate.trim()).toISOString();
    const parsedQuantity = Number(quantity.trim().replace(",", "."));
    const parsedUnitCost = unitCost.trim()
      ? Number(unitCost.replace(",", "."))
      : null;
    const parsedTotalCost = totalCost.trim()
      ? Number(totalCost.replace(",", "."))
      : null;
    const finalWarehouseId = warehouseId === NO_WAREHOUSE ? null : warehouseId;
    const finalTargetType =
      usesTarget(transactionType) && targetType !== NO_TARGET_TYPE
        ? (targetType as InventoryTargetType)
        : null;

    let finalTargetId: string | null = null;
    let finalTargetLabel: string | null = null;
    if (usesTarget(transactionType) && targetType !== NO_TARGET_TYPE) {
      if (targetType === "other" || targetType === "worker") {
        finalTargetId = null;
        finalTargetLabel = targetFreeText.trim() || null;
      } else {
        finalTargetId = targetId || null;
        const picked = targetInstanceOptions.find((o) => o.value === targetId);
        finalTargetLabel = picked?.label ?? null;
      }
    }

    const isoExpiry = expiryDate.trim()
      ? new Date(expiryDate.trim()).toISOString()
      : null;

    try {
      if (mode === "create" && activeFarm) {
        await inventoryTransactionRepo.create(ctx, {
          farmId: activeFarm.id,
          itemId: item.id,
          warehouseId: finalWarehouseId,
          transactionType,
          transactionDate: isoDate,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          unitCost: parsedUnitCost,
          totalCost: parsedTotalCost,
          costCurrency: costCurrency.trim() || null,
          supplier: usesSupplierAndBatch(transactionType)
            ? supplier.trim() || null
            : null,
          batchNumber: usesSupplierAndBatch(transactionType)
            ? batchNumber.trim() || null
            : null,
          expiryDate: usesSupplierAndBatch(transactionType) ? isoExpiry : null,
          reference: reference.trim() || null,
          targetType: finalTargetType,
          targetId: finalTargetId,
          targetLabel: finalTargetLabel,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && transactionId) {
        await inventoryTransactionRepo.update(ctx, transactionId, {
          warehouseId: finalWarehouseId,
          transactionType,
          transactionDate: isoDate,
          quantity: parsedQuantity,
          quantityUnit: quantityUnit.trim() || null,
          unitCost: parsedUnitCost,
          totalCost: parsedTotalCost,
          costCurrency: costCurrency.trim() || null,
          supplier: usesSupplierAndBatch(transactionType)
            ? supplier.trim() || null
            : null,
          batchNumber: usesSupplierAndBatch(transactionType)
            ? batchNumber.trim() || null
            : null,
          expiryDate: usesSupplierAndBatch(transactionType) ? isoExpiry : null,
          reference: reference.trim() || null,
          targetType: finalTargetType,
          targetId: finalTargetId,
          targetLabel: finalTargetLabel,
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
                ? "create_transaction_error"
                : "update_transaction_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[TransactionForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    item,
    validate,
    mode,
    activeFarm,
    transactionId,
    transactionDate,
    quantity,
    quantityUnit,
    warehouseId,
    unitCost,
    totalCost,
    costCurrency,
    supplier,
    batchNumber,
    expiryDate,
    reference,
    targetType,
    targetId,
    targetFreeText,
    targetInstanceOptions,
    notes,
    transactionType,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !transactionId) return;
    Alert.alert(
      t("delete_transaction_title"),
      t("delete_transaction_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await inventoryTransactionRepo.softDelete(ctx, transactionId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[TransactionForm] delete failed", err);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, transactionId, navigation, t]);

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

  if (!item) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("item_not_found")}
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

  const submitLabel =
    mode === "create" ? t("create_transaction") : t("update_transaction");

  const showSupplierBatch = usesSupplierAndBatch(transactionType);
  const showCost = usesCost(transactionType);
  const showTarget = usesTarget(transactionType);
  const showTargetInstance =
    showTarget && targetType !== NO_TARGET_TYPE && targetType !== "other";

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
      <View
        style={[
          styles.itemHeader,
          { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.itemLabel, { color: colors.textMuted }]}>
          {t("item_singular")}
        </Text>
        <Text style={[styles.itemName, { color: colors.text }]}>
          {item.name}
        </Text>
      </View>

      <SelectField<InventoryTransactionType>
        label={t("transaction_type")}
        value={transactionType}
        onChange={setTransactionType}
        options={typeOptions}
        required
      />

      <FormField
        label={t("transaction_date")}
        hint="2026-04-10"
        value={transactionDate}
        onChangeText={setTransactionDate}
        error={dateError}
        required
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <FormField
        label={t("transaction_quantity")}
        hint={
          allowsNegativeQuantity(transactionType)
            ? "e.g. -2 to correct downward"
            : undefined
        }
        value={quantity}
        onChangeText={setQuantity}
        error={quantityError}
        required
        keyboardType="numbers-and-punctuation"
        maxLength={12}
        returnKeyType="next"
      />

      <FormField
        label={t("quantity_unit")}
        hint={item.unit}
        value={quantityUnit}
        onChangeText={setQuantityUnit}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="next"
      />

      <SelectField<string>
        label={t("warehouses")}
        value={warehouseId}
        onChange={setWarehouseId}
        options={warehouseOptions}
      />

      {showTarget ? (
        <>
          <SelectField<string>
            label={t("transaction_target")}
            hint={t("transaction_target_hint")}
            value={targetType}
            onChange={(v) => {
              setTargetType(v);
              setTargetId("");
              setTargetFreeText("");
            }}
            options={targetTypeOptions}
            error={targetError}
            required
          />

          {showTargetInstance ? (
            <SelectField<string>
              label={t(keyForTargetType(targetType as InventoryTargetType))}
              value={targetId}
              onChange={setTargetId}
              options={targetInstanceOptions}
            />
          ) : null}

          {targetType === "other" || targetType === "worker" ? (
            <FormField
              label={t(keyForTargetType(targetType as InventoryTargetType))}
              hint="e.g. John Kamau, tractor #2"
              value={targetFreeText}
              onChangeText={setTargetFreeText}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={200}
              returnKeyType="next"
            />
          ) : null}
        </>
      ) : null}

      {showCost ? (
        <>
          <FormField
            label={t("transaction_unit_cost")}
            value={unitCost}
            onChangeText={setUnitCost}
            keyboardType="decimal-pad"
            maxLength={12}
            returnKeyType="next"
          />

          <FormField
            label={t("transaction_total_cost")}
            value={totalCost}
            onChangeText={setTotalCost}
            keyboardType="decimal-pad"
            maxLength={14}
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
        </>
      ) : null}

      {showSupplierBatch ? (
        <>
          <FormField
            label={t("transaction_supplier")}
            value={supplier}
            onChangeText={setSupplier}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={200}
            returnKeyType="next"
          />

          <FormField
            label={t("transaction_batch")}
            value={batchNumber}
            onChangeText={setBatchNumber}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={50}
            returnKeyType="next"
          />

          <FormField
            label={t("transaction_expiry")}
            hint="YYYY-MM-DD (optional)"
            value={expiryDate}
            onChangeText={setExpiryDate}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="next"
          />
        </>
      ) : null}

      <FormField
        label={t("transaction_reference")}
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={80}
        returnKeyType="next"
      />

      <FormField
        label={t("transaction_notes")}
        hint={t("plot_notes_hint")}
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="sentences"
        autoCorrect={false}
        maxLength={500}
        returnKeyType="done"
      />

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
    gap: spacing.md,
  },
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  stretch: { marginTop: spacing.lg, alignSelf: "stretch" },
  submitError: {
    ...typography.caption,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
  itemHeader: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
    gap: 4,
  },
  itemLabel: { ...typography.caption },
  itemName: { ...typography.bodyBold },
});
