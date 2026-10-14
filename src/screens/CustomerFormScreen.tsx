import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { FormField } from "../components/FormField";
import { WizardForm, type WizardStep } from "../components/WizardForm";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { customerRepo, ValidationError } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Mode = "create" | "edit";

export const CustomerFormScreen: React.FC<
  RootStackScreenProps<"CustomerForm">
> = ({ route, navigation }) => {
  const { customerId } = route.params ?? {};
  const mode: Mode = customerId ? "edit" : "create";

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(mode === "edit");

  useEffect(() => {
    if (mode !== "edit" || !ctx || !customerId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await customerRepo.getById(ctx, customerId);
        if (cancelled || !existing) return;
        setName(existing.name);
        setPhone(existing.phone ?? "");
        setEmail(existing.email ?? "");
        setAddress(existing.address ?? "");
        setNotes(existing.notes ?? "");
      } catch (err) {
        if (__DEV__) console.warn("[CustomerForm] hydrate failed", err);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ctx, customerId]);

  const onSubmit = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (mode === "create" && !activeFarm) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "create" && activeFarm) {
        await customerRepo.create(ctx, {
          farmId: activeFarm.id,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
        });
      } else if (mode === "edit" && customerId) {
        await customerRepo.update(ctx, customerId, {
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
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
                ? "create_customer_error"
                : "update_customer_error",
            );
      setSubmitError(message);
      if (__DEV__) console.warn("[CustomerForm] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    ctx,
    mode,
    activeFarm,
    customerId,
    name,
    phone,
    email,
    address,
    notes,
    navigation,
    t,
  ]);

  const onDelete = useCallback((): void => {
    if (!ctx || !customerId) return;
    Alert.alert(
      t("delete_customer_title"),
      t("delete_customer_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await customerRepo.softDelete(ctx, customerId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) console.warn("[CustomerForm] delete failed", err);
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, customerId, navigation, t]);

  const steps = useMemo<readonly WizardStep[]>(
    () => [
      {
        id: "identity",
        titleKey: "customer_step_identity",
        hintKey: "customer_step_identity_hint",
        icon: "👤",
        validate: () => name.trim().length > 0,
        render: () => (
          <FormField
            label={t("customer_name")}
            hint={t("customer_name_hint")}
            value={name}
            onChangeText={setName}
            required
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={100}
            returnKeyType="next"
          />
        ),
      },
      {
        id: "contact",
        titleKey: "customer_step_contact",
        hintKey: "customer_step_contact_hint",
        icon: "📞",
        validate: () => true,
        isOptional: true,
        render: () => (
          <>
            <FormField
              label={t("customer_phone")}
              hint={t("customer_phone_hint")}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              returnKeyType="next"
            />
            <FormField
              label={t("customer_email")}
              hint={t("customer_email_hint")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              returnKeyType="next"
            />
            <FormField
              label={t("customer_address")}
              hint={t("customer_address_hint")}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="sentences"
              autoCorrect={false}
              maxLength={200}
              returnKeyType="next"
            />
            <FormField
              label={t("customer_notes")}
              hint={t("customer_notes_hint")}
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
    [t, name, phone, email, address, notes],
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
    mode === "create" ? t("create_customer") : t("update_customer");

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
