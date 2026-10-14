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
  financeAccountRepo,
  ValidationError,
  type FinanceAccountType,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

const TYPE_OPTIONS: readonly {
  value: FinanceAccountType;
  key: string;
  icon: string;
}[] = [
  { value: "cash", key: "finance_account_type_cash", icon: "💵" },
  { value: "bank", key: "finance_account_type_bank", icon: "🏦" },
  {
    value: "mobile_money",
    key: "finance_account_type_mobile_money",
    icon: "📱",
  },
  { value: "savings", key: "finance_account_type_savings", icon: "🐷" },
  { value: "credit", key: "finance_account_type_credit", icon: "💳" },
  { value: "other", key: "finance_account_type_other", icon: "💼" },
];

export const FinanceAccountFormScreen: React.FC<
  RootStackScreenProps<"FinanceAccountForm">
> = ({ route, navigation }) => {
  const { accountId } = route.params ?? {};
  const mode: Mode = accountId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<FinanceAccountType>("cash");
  const [openingBalance, setOpeningBalance] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !accountId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await financeAccountRepo.getById(ctx, accountId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setAccountType(existing.accountType);
        setOpeningBalance(String(existing.openingBalance));
        setAccountNumber(existing.accountNumber ?? "");
        setInstitutionName(existing.institutionName ?? "");
        setNotes(existing.notes ?? "");
        setIsActive(existing.isActive);
      } catch (err) {
        if (__DEV__) console.warn("[FinanceAccountForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, accountId]);

  const typeOptions = useMemo(
    () =>
      TYPE_OPTIONS.map((o) => ({
        value: o.value,
        label: t(o.key),
        icon: o.icon,
      })),
    [t],
  );

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    const parsedBalance = openingBalance.trim()
      ? Number(openingBalance.replace(",", "."))
      : 0;

    try {
      if (mode === "create" && activeFarm) {
        await financeAccountRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          accountType,
          openingBalance: parsedBalance,
          currency: activeFarm.currency,
          accountNumber: accountNumber.trim() || null,
          institutionName: institutionName.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && accountId) {
        await financeAccountRepo.update(ctx, accountId, {
          name: name.trim(),
          accountType,
          openingBalance: parsedBalance,
          accountNumber: accountNumber.trim() || null,
          institutionName: institutionName.trim() || null,
          notes: notes.trim() || null,
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
                ? "finance_create_account_error"
                : "finance_update_account_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[FinanceAccountForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    accountId,
    name,
    accountType,
    openingBalance,
    accountNumber,
    institutionName,
    notes,
    isActive,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !accountId) return;
    Alert.alert(
      t("finance_delete_account_title"),
      t("finance_delete_account_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await financeAccountRepo.softDelete(ctx, accountId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__)
                  console.warn("[FinanceAccountForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, accountId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "finance_step_account_identity",
        hintKey: "finance_step_account_identity_hint",
        icon: "🏦",
        validate: () => name.trim().length > 0,
        render: () => (
          <>
            <FormField
              label={t("finance_account_name")}
              hint={t("finance_account_name_hint")}
              value={name}
              onChangeText={setName}
              required
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
            />
            <SelectField<FinanceAccountType>
              label={t("finance_account_type")}
              value={accountType}
              onChange={setAccountType}
              options={typeOptions}
            />
            <FormField
              label={t("finance_account_opening_balance")}
              hint={t("finance_account_opening_balance_hint")}
              value={openingBalance}
              onChangeText={setOpeningBalance}
              keyboardType="decimal-pad"
              maxLength={14}
              returnKeyType="done"
            />
          </>
        ),
      },
      {
        id: "extras",
        titleKey: "finance_step_account_extras",
        hintKey: "finance_step_account_extras_hint",
        icon: "📝",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("finance_account_number")}
              hint={t("finance_account_number_hint")}
              value={accountNumber}
              onChangeText={setAccountNumber}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              returnKeyType="next"
            />
            <FormField
              label={t("finance_account_institution")}
              hint={t("finance_account_institution_hint")}
              value={institutionName}
              onChangeText={setInstitutionName}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
            />
            <FormField
              label={t("finance_account_notes")}
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
      accountType,
      typeOptions,
      openingBalance,
      accountNumber,
      institutionName,
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

  const submitLabel =
    mode === "create"
      ? t("finance_create_account")
      : t("finance_update_account");

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
  deleteRow: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: { alignSelf: "stretch" },
});
