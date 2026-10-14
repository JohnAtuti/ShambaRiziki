import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { SelectField } from "../components/SelectField";
import { DateField } from "../components/DateField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  animalRepo,
  financeAccountRepo,
  financeCategoryRepo,
  financeTransactionRepo,
  herdRepo,
  inventoryItemRepo,
  plotRepo,
  ValidationError,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceTargetType,
  type FinanceTransactionType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

type Option = { value: string; label: string; icon: string };

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00.000Z`;
};

const TYPE_CHOICES: readonly {
  value: FinanceTransactionType;
  key: string;
  icon: string;
}[] = [
  {
    value: "expense",
    key: "finance_transaction_type_expense",
    icon: "💸",
  },
  {
    value: "income",
    key: "finance_transaction_type_income",
    icon: "💰",
  },
  {
    value: "transfer",
    key: "finance_transaction_type_transfer",
    icon: "⇄",
  },
];

const TARGET_TYPE_CHOICES: readonly {
  value: FinanceTargetType | "";
  key: string;
  icon: string;
}[] = [
  { value: "", key: "not_set", icon: "—" },
  { value: "plot", key: "finance_target_plot", icon: "🌍" },
  { value: "animal", key: "finance_target_animal", icon: "🐄" },
  { value: "herd", key: "finance_target_herd", icon: "🐐" },
  { value: "item", key: "finance_target_item", icon: "📦" },
  { value: "other", key: "finance_target_other", icon: "🔗" },
];

export const FinanceTransactionFormScreen: React.FC<
  RootStackScreenProps<"FinanceTransactionForm">
> = ({ route, navigation }) => {
  const { transactionId, defaultTargetType, defaultTargetId } =
    route.params ?? {};
  const mode: Mode = transactionId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [transactionType, setTransactionType] =
    useState<FinanceTransactionType>("expense");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [payee, setPayee] = useState("");
  const [targetType, setTargetType] = useState<FinanceTargetType | "">(
    (defaultTargetType as FinanceTargetType | "") ?? "",
  );
  const [targetId, setTargetId] = useState(defaultTargetId ?? "");
  const [notes, setNotes] = useState("");

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [plotOptions, setPlotOptions] = useState<Option[]>([]);
  const [animalOptions, setAnimalOptions] = useState<Option[]>([]);
  const [herdOptions, setHerdOptions] = useState<Option[]>([]);
  const [itemOptions, setItemOptions] = useState<Option[]>([]);

  // Tracks which target types we have already fetched, so switching back
  // and forth between types does not re-query. A ref is used because
  // reading option-array `.length` inside the effect body triggers the
  // exhaustive-deps lint rule.
  const fetchedTargets = useRef<Set<FinanceTargetType>>(new Set());

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  // ---- Initial load: accounts, and defaults for create mode.
  // accountId is a dep intentionally omitted: it is only read once on mount
  // to seed the default. Adding it would re-trigger the fetch on every
  // user selection, which is wasteful and causes a render loop.
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await financeAccountRepo.listActiveByFarm(
          ctx,
          activeFarm.id,
        );
        if (cancelled) return;
        setAccounts(list);
        if (mode === "create" && list.length > 0) {
          setAccountId((prev) => (prev.length > 0 ? prev : list[0].id));
        }
      } catch (err) {
        if (__DEV__)
          console.warn("[FinanceTransactionForm] accounts load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, mode]);

  // ---- Hydrate for edit mode.
  // No setState outside the async callback — the eslint rule forbids it.
  // If mode is "create", hydrating starts false, so the guard just returns.
  useEffect(() => {
    if (mode !== "edit" || !ctx || !transactionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const tx = await financeTransactionRepo.getById(ctx, transactionId);
        if (cancelled || !tx) return;
        setTransactionType(tx.transactionType);
        setAccountId(tx.accountId);
        setTransferAccountId(tx.transferAccountId ?? "");
        setCategoryId(tx.categoryId ?? "");
        setAmount(String(tx.amount));
        setTransactionDate(tx.transactionDate);
        setDescription(tx.description ?? "");
        setReference(tx.reference ?? "");
        setPayee(tx.payee ?? "");
        setTargetType(tx.targetType ?? "");
        setTargetId(tx.targetId ?? "");
        setNotes(tx.notes ?? "");
      } catch (err) {
        if (__DEV__)
          console.warn("[FinanceTransactionForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, transactionId]);

  // ---- Load categories when type changes.
  // On transfer we do not fetch and do not clear — the category UI is not
  // rendered on transfer, and onSubmit already nulls categoryId for transfers.
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    if (transactionType === "transfer") return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await financeCategoryRepo.listByType(
          ctx,
          activeFarm.id,
          transactionType === "income" ? "income" : "expense",
        );
        if (cancelled) return;
        setCategories(list);
        setCategoryId((prev) => (list.some((c) => c.id === prev) ? prev : ""));
      } catch (err) {
        if (__DEV__)
          console.warn("[FinanceTransactionForm] categories load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, activeFarm, transactionType]);

  // ---- Lazy-load target options for the selected target type.
  // Uses a ref to remember which types have already been fetched, instead
  // of reading option-array lengths inside the effect body.
  useEffect(() => {
    if (!ctx || !activeFarm) return;
    if (targetType === "" || targetType === "other") return;
    if (fetchedTargets.current.has(targetType)) return;
    fetchedTargets.current.add(targetType);
    let cancelled = false;
    void (async () => {
      try {
        if (targetType === "plot") {
          const rows = await plotRepo.listByFarm(ctx, activeFarm.id);
          if (!cancelled) {
            setPlotOptions(
              rows.map((p) => ({ value: p.id, label: p.name, icon: "🌍" })),
            );
          }
        } else if (targetType === "animal") {
          const rows = await animalRepo.listByFarm(ctx, activeFarm.id);
          if (!cancelled) {
            setAnimalOptions(
              rows.map((a) => ({
                value: a.id,
                label: a.name ?? a.tagId,
                icon: "🐄",
              })),
            );
          }
        } else if (targetType === "herd") {
          const rows = await herdRepo.listByFarm(ctx, activeFarm.id);
          if (!cancelled) {
            setHerdOptions(
              rows.map((h) => ({ value: h.id, label: h.name, icon: "🐐" })),
            );
          }
        } else if (targetType === "item") {
          const rows = await inventoryItemRepo.listByFarm(ctx, activeFarm.id);
          if (!cancelled) {
            setItemOptions(
              rows.map((i) => ({ value: i.id, label: i.name, icon: "📦" })),
            );
          }
        }
      } catch (err) {
        if (__DEV__)
          console.warn("[FinanceTransactionForm] targets load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetType, ctx, activeFarm]);

  const accountOptions = useMemo<Option[]>(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.name,
        icon: a.accountType === "bank" ? "🏦" : "💵",
      })),
    [accounts],
  );

  const transferAccountOptions = useMemo<Option[]>(
    () => accountOptions.filter((o) => o.value !== accountId),
    [accountOptions, accountId],
  );

  const categoryOptions = useMemo<Option[]>(
    () => [
      { value: "", label: t("not_set"), icon: "—" },
      ...categories.map((c) => ({
        value: c.id,
        label: c.name,
        icon: c.icon ?? "🏷️",
      })),
    ],
    [categories, t],
  );

  const targetTypeOptions = useMemo(
    () =>
      TARGET_TYPE_CHOICES.map((o) => ({
        value: o.value,
        label: t(o.key),
        icon: o.icon,
      })),
    [t],
  );

  const targetOptions = useMemo<Option[]>(() => {
    switch (targetType) {
      case "plot":
        return plotOptions;
      case "animal":
        return animalOptions;
      case "herd":
        return herdOptions;
      case "item":
        return itemOptions;
      default:
        return [];
    }
  }, [targetType, plotOptions, animalOptions, herdOptions, itemOptions]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parsedAmount = Number(amount.replace(",", "."));
    const selectedTarget = targetOptions.find((o) => o.value === targetId);
    const targetLabel =
      targetType === "other" ? null : (selectedTarget?.label ?? null);

    try {
      if (mode === "create" && activeFarm) {
        await financeTransactionRepo.create(ctx, {
          farmId: activeFarm.id,
          accountId,
          categoryId:
            transactionType === "transfer" ? null : categoryId || null,
          transferAccountId:
            transactionType === "transfer" ? transferAccountId : null,
          transactionType,
          transactionDate,
          amount: parsedAmount,
          currency: activeFarm.currency,
          description: description.trim() || null,
          reference: reference.trim() || null,
          payee: payee.trim() || null,
          targetType: targetType || null,
          targetId: targetId || null,
          targetLabel,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && transactionId) {
        await financeTransactionRepo.update(ctx, transactionId, {
          accountId,
          categoryId:
            transactionType === "transfer" ? null : categoryId || null,
          transferAccountId:
            transactionType === "transfer" ? transferAccountId : null,
          transactionType,
          transactionDate,
          amount: parsedAmount,
          description: description.trim() || null,
          reference: reference.trim() || null,
          payee: payee.trim() || null,
          targetType: targetType || null,
          targetId: targetId || null,
          targetLabel,
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
                ? "finance_transaction_create_error"
                : "finance_transaction_update_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[FinanceTransactionForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    transactionId,
    accountId,
    transferAccountId,
    categoryId,
    transactionType,
    transactionDate,
    amount,
    description,
    reference,
    payee,
    targetType,
    targetId,
    targetOptions,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !transactionId) return;
    Alert.alert(
      t("finance_transaction_delete_title"),
      t("finance_transaction_delete_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await financeTransactionRepo.softDelete(ctx, transactionId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[FinanceTransactionForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, transactionId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(() => {
    const baseSteps: WizardStep[] = [
      {
        id: "type",
        titleKey: "finance_step_transaction_type",
        hintKey: "finance_step_transaction_type_hint",
        icon: "💸",
        validate: () => true,
        render: () => (
          <View style={styles.typeGrid}>
            {TYPE_CHOICES.map((choice) => (
              <BigButton
                key={choice.value}
                layout="column"
                variant={
                  transactionType === choice.value ? "primary" : "secondary"
                }
                label={t(choice.key)}
                icon={<Text style={styles.typeEmoji}>{choice.icon}</Text>}
                onPress={() => setTransactionType(choice.value)}
              />
            ))}
          </View>
        ),
      },
      {
        id: "amount",
        titleKey: "finance_step_transaction_amount",
        hintKey: "finance_step_transaction_amount_hint",
        icon: "💰",
        validate: () => {
          const n = Number(amount.replace(",", "."));
          return (
            Number.isFinite(n) &&
            n > 0 &&
            accountId.length > 0 &&
            (transactionType !== "transfer" ||
              (transferAccountId.length > 0 && transferAccountId !== accountId))
          );
        },
        render: () => (
          <>
            <FormField
              label={t("finance_transaction_amount")}
              value={amount}
              onChangeText={setAmount}
              required
              keyboardType="decimal-pad"
              maxLength={14}
              returnKeyType="next"
            />
            <DateField
              label={t("finance_transaction_date")}
              value={transactionDate}
              onChange={setTransactionDate}
              required
            />
            <SelectField<string>
              label={t("finance_transaction_account")}
              value={accountId}
              onChange={setAccountId}
              options={accountOptions}
            />
            {transactionType === "transfer" ? (
              <SelectField<string>
                label={t("finance_transaction_transfer_to")}
                value={transferAccountId}
                onChange={setTransferAccountId}
                options={transferAccountOptions}
              />
            ) : null}
          </>
        ),
      },
    ];

    if (transactionType !== "transfer") {
      baseSteps.push({
        id: "category",
        titleKey: "finance_transaction_category",
        hintKey: "finance_step_transaction_target_hint",
        icon: "🏷️",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<string>
              label={t("finance_transaction_category")}
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
            />
            <SelectField<FinanceTargetType | "">
              label={t("finance_transaction_target")}
              value={targetType}
              onChange={(v) => {
                setTargetType(v);
                setTargetId("");
              }}
              options={targetTypeOptions}
            />
            {targetOptions.length > 0 ? (
              <SelectField<string>
                label={t("finance_transaction_target")}
                hint={t("finance_transaction_target_hint")}
                value={targetId}
                onChange={setTargetId}
                options={targetOptions}
              />
            ) : null}
          </>
        ),
      });
    } else {
      baseSteps.push({
        id: "target",
        titleKey: "finance_transaction_target",
        hintKey: "finance_step_transaction_target_hint",
        icon: "🔗",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <SelectField<FinanceTargetType | "">
              label={t("finance_transaction_target")}
              value={targetType}
              onChange={(v) => {
                setTargetType(v);
                setTargetId("");
              }}
              options={targetTypeOptions}
            />
            {targetOptions.length > 0 ? (
              <SelectField<string>
                label={t("finance_transaction_target")}
                value={targetId}
                onChange={setTargetId}
                options={targetOptions}
              />
            ) : null}
          </>
        ),
      });
    }

    baseSteps.push({
      id: "details",
      titleKey: "finance_step_transaction_details",
      hintKey: "finance_step_transaction_details_hint",
      icon: "📝",
      validate: () => true,
      isOptional: true,
      render: () => (
        <>
          <FormField
            label={t("finance_transaction_description")}
            hint={t("finance_transaction_description_hint")}
            value={description}
            onChangeText={setDescription}
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={200}
            returnKeyType="next"
          />
          <FormField
            label={t("finance_transaction_payee")}
            hint={t("finance_transaction_payee_hint")}
            value={payee}
            onChangeText={setPayee}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={100}
            returnKeyType="next"
          />
          <FormField
            label={t("finance_transaction_reference")}
            hint={t("finance_transaction_reference_hint")}
            value={reference}
            onChangeText={setReference}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={60}
            returnKeyType="next"
          />
          <FormField
            label={t("finance_transaction_notes")}
            value={notes}
            onChangeText={setNotes}
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={500}
            returnKeyType="done"
          />
        </>
      ),
    });

    return baseSteps;
  }, [
    t,
    transactionType,
    amount,
    transactionDate,
    accountId,
    transferAccountId,
    accountOptions,
    transferAccountOptions,
    categoryId,
    categoryOptions,
    targetType,
    targetTypeOptions,
    targetId,
    targetOptions,
    description,
    payee,
    reference,
    notes,
  ]);

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

  if (accounts.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🏦</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("finance_no_accounts")}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {t("finance_no_accounts_hint")}
          </Text>
          <BigButton
            label={t("finance_add_first_account")}
            onPress={() => navigation.navigate("FinanceAccountForm", {})}
            style={styles.emptyCta}
          />
        </View>
      </Screen>
    );
  }

  const submitLabel =
    mode === "create"
      ? t("finance_transaction_create")
      : t("finance_transaction_update");

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
    gap: spacing.md,
  },
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  emptySub: { ...typography.body, textAlign: "center" },
  emptyCta: { marginTop: spacing.lg, alignSelf: "stretch" },
  typeGrid: {
    gap: spacing.md,
  },
  typeEmoji: { fontSize: 36 },
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
