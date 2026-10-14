import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { DateField } from "../components/DateField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  customerRepo,
  saleRepo,
  ValidationError,
  type Customer,
  type SaleStatus,
} from "../db";
import { formatMoney } from "../utils/money";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

type DraftItem = {
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

const newDraftItem = (): DraftItem => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  description: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
});

const parseNum = (s: string): number => {
  const cleaned = s.trim().replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00.000Z`;
};

const STATUS_OPTIONS: readonly { value: SaleStatus; key: string }[] = [
  { value: "draft", key: "sale_status_draft" },
  { value: "sent", key: "sale_status_sent" },
  { value: "paid", key: "sale_status_paid" },
  { value: "cancelled", key: "sale_status_cancelled" },
];

export const SaleFormScreen: React.FC<RootStackScreenProps<"SaleForm">> = ({
  route,
  navigation,
}) => {
  const { saleId, defaultCustomerId } = route.params ?? {};
  const mode: Mode = saleId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? "");
  const [saleDate, setSaleDate] = useState<string>(todayIso());
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [status, setStatus] = useState<SaleStatus>("draft");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  // Load customers for the picker.
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await customerRepo.listActiveByFarm(ctx, activeFarm.id);
        if (!cancelled) setCustomers(rows);
      } catch (err) {
        if (__DEV__) console.warn("[SaleForm] customers load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm]);

  // Hydrate for edit mode.
  useEffect(() => {
    if (mode !== "edit" || !ctx || !saleId) return;
    let cancelled = false;
    void (async () => {
      try {
        const sale = await saleRepo.getById(ctx, saleId);
        if (cancelled || !sale) return;
        const lines = await saleRepo.listItems(ctx, saleId);
        if (cancelled) return;
        setCustomerId(sale.customerId ?? "");
        setSaleDate(sale.saleDate);
        setReference(sale.reference ?? "");
        setDueDate(sale.dueDate ?? "");
        setStatus(sale.status);
        setAmountPaid(sale.amountPaid > 0 ? String(sale.amountPaid) : "");
        setNotes(sale.notes ?? "");
        setItems(
          lines.map((l) => ({
            key: l.id,
            description: l.description,
            quantity: String(l.quantity),
            unit: l.unit ?? "",
            unitPrice: String(l.unitPrice),
          })),
        );
      } catch (err) {
        if (__DEV__) console.warn("[SaleForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, saleId]);

  const customerOptions = useMemo(
    () => [
      { value: "", label: t("not_set"), icon: "—" },
      ...customers.map((c) => ({
        value: c.id,
        label: c.name,
        icon: "👤",
      })),
    ],
    [customers, t],
  );

  const statusOptions = useMemo(
    () => STATUS_OPTIONS.map((s) => ({ value: s.value, label: t(s.key) })),
    [t],
  );

  const computedTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + parseNum(item.quantity) * parseNum(item.unitPrice),
        0,
      ),
    [items],
  );

  const addItem = useCallback((): void => {
    setItems((prev) => [...prev, newDraftItem()]);
  }, []);

  const removeItem = useCallback((key: string): void => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const updateItem = useCallback(
    (key: string, patch: Partial<DraftItem>): void => {
      setItems((prev) =>
        prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
      );
    },
    [],
  );

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const cleanItems = items
      .filter((i) => i.description.trim().length > 0)
      .map((i) => ({
        description: i.description.trim(),
        quantity: parseNum(i.quantity),
        unit: i.unit.trim() || null,
        unitPrice: parseNum(i.unitPrice),
      }));

    const parsedPaid = amountPaid.trim() ? parseNum(amountPaid) : 0;

    try {
      if (mode === "create" && activeFarm) {
        await saleRepo.create(ctx, {
          farmId: activeFarm.id,
          customerId: customerId || null,
          saleDate,
          dueDate: dueDate || null,
          reference: reference.trim() || null,
          currency: activeFarm.currency,
          status,
          notes: notes.trim() || null,
          items: cleanItems,
        });
      } else if (mode === "edit" && saleId) {
        await saleRepo.update(ctx, saleId, {
          customerId: customerId || null,
          saleDate,
          dueDate: dueDate || null,
          reference: reference.trim() || null,
          status,
          amountPaid: parsedPaid,
          notes: notes.trim() || null,
          items: cleanItems,
        });
      }
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.message
          : t(mode === "create" ? "create_sale_error" : "update_sale_error");
      setSubmitError(message);
      if (__DEV__) console.warn("[SaleForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    saleId,
    customerId,
    saleDate,
    dueDate,
    reference,
    status,
    amountPaid,
    notes,
    items,
    navigation,
    t,
  ]);

  const renderItemCard = useCallback(
    (item: DraftItem): React.ReactElement => {
      const lineTotal = parseNum(item.quantity) * parseNum(item.unitPrice);
      const currency = activeFarm?.currency ?? "KES";
      return (
        <View
          key={item.key}
          style={[
            styles.itemCard,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.itemHeader}>
            <Text style={[styles.itemHeaderLabel, { color: colors.textMuted }]}>
              {t("sale_item_description")}
            </Text>
            <Pressable
              onPress={() => removeItem(item.key)}
              accessibilityRole="button"
              accessibilityLabel={t("sale_remove_item")}
              hitSlop={12}
            >
              <Text style={[styles.itemRemove, { color: colors.danger }]}>
                ×
              </Text>
            </Pressable>
          </View>
          <FormField
            label=""
            value={item.description}
            onChangeText={(v) => updateItem(item.key, { description: v })}
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={200}
            returnKeyType="next"
          />
          <View style={styles.itemRow}>
            <View style={styles.itemCol}>
              <FormField
                label={t("sale_item_quantity")}
                value={item.quantity}
                onChangeText={(v) => updateItem(item.key, { quantity: v })}
                keyboardType="decimal-pad"
                maxLength={10}
              />
            </View>
            <View style={styles.itemCol}>
              <FormField
                label={t("sale_item_unit")}
                value={item.unit}
                onChangeText={(v) => updateItem(item.key, { unit: v })}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
            </View>
          </View>
          <FormField
            label={t("sale_item_unit_price")}
            value={item.unitPrice}
            onChangeText={(v) => updateItem(item.key, { unitPrice: v })}
            keyboardType="decimal-pad"
            maxLength={14}
          />
          <Text style={[styles.itemLineTotal, { color: colors.text }]}>
            {t("sale_item_line_total")}: {formatMoney(lineTotal, currency)}
          </Text>
        </View>
      );
    },
    [activeFarm, colors, removeItem, t, updateItem],
  );

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "sale_step_identity",
        hintKey: "sale_step_identity_hint",
        icon: "🧾",
        validate: () => saleDate.length > 0,
        render: () => (
          <>
            <SelectField<string>
              label={t("sale_customer")}
              hint={t("sale_customer_hint")}
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
            />
            <DateField
              label={t("sale_date")}
              value={saleDate}
              onChange={setSaleDate}
              required
            />
            <FormField
              label={t("sale_reference")}
              hint={t("sale_reference_hint")}
              value={reference}
              onChangeText={setReference}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={60}
              returnKeyType="next"
            />
          </>
        ),
      },
      {
        id: "items",
        titleKey: "sale_step_items",
        hintKey: "sale_step_items_hint",
        icon: "📦",
        validate: () => items.some((i) => i.description.trim().length > 0),
        render: () => (
          <>
            {items.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("sale_no_items_hint")}
              </Text>
            ) : (
              items.map(renderItemCard)
            )}
            <BigButton
              label={t("sale_add_item")}
              onPress={addItem}
              variant="secondary"
              style={styles.addItemBtn}
            />
            <Text style={[styles.totalLine, { color: colors.text }]}>
              {t("sale_total")}:{" "}
              {formatMoney(computedTotal, activeFarm?.currency ?? "KES")}
            </Text>
          </>
        ),
      },
      {
        id: "payment",
        titleKey: "sale_step_payment",
        hintKey: "sale_step_payment_hint",
        icon: "💰",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<SaleStatus>
              label={t("sale_status")}
              value={status}
              onChange={setStatus}
              options={statusOptions}
            />
            <FormField
              label={t("sale_amount_paid")}
              hint={t("sale_amount_paid_hint")}
              value={amountPaid}
              onChangeText={setAmountPaid}
              keyboardType="decimal-pad"
              maxLength={14}
              returnKeyType="next"
            />
            <DateField
              label={t("sale_due_date")}
              value={dueDate}
              onChange={setDueDate}
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "sale_step_extras",
        hintKey: "sale_step_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <FormField
            label={t("sale_notes")}
            value={notes}
            onChangeText={setNotes}
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={500}
            returnKeyType="done"
          />
        ),
      },
    ],
    [
      t,
      colors,
      saleDate,
      customerId,
      customerOptions,
      reference,
      items,
      renderItemCard,
      addItem,
      computedTotal,
      activeFarm,
      status,
      statusOptions,
      amountPaid,
      dueDate,
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

  const submitLabel = mode === "create" ? t("create_sale") : t("update_sale");

  return (
    <Screen scroll={false} contentStyle={styles.noPadding}>
      <WizardForm
        steps={steps}
        onSubmit={onSubmit}
        submitting={submitting}
        submitLabel={submitLabel}
        errorMessage={submitError}
      />
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
  hint: { ...typography.caption, marginBottom: spacing.md },
  addItemBtn: { marginTop: spacing.sm, alignSelf: "stretch" },
  totalLine: {
    ...typography.h3,
    marginTop: spacing.lg,
    textAlign: "right",
  },
  itemCard: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemHeaderLabel: {
    ...typography.caption,
    textTransform: "uppercase",
  },
  itemRemove: { fontSize: 28, fontWeight: "800", paddingHorizontal: 6 },
  itemRow: { flexDirection: "row", gap: spacing.sm },
  itemCol: { flex: 1 },
  itemLineTotal: { ...typography.bodyBold, marginTop: spacing.xs },
});
