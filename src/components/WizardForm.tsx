import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

export type WizardStep = {
  id: string;
  titleKey: string;
  hintKey?: string;
  icon: string;
  render: () => React.ReactNode;
  /** Return true when this step can advance. Called on every render. */
  validate: () => boolean;
  /** True when there are no required fields — Continue is always enabled. */
  isOptional?: boolean;
};

type Props = {
  steps: readonly WizardStep[];
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  submitLabel: string;
  /** Called when the user backs out of the wizard entirely. */
  onCancel?: () => void;
  /** Optional error message shown above the footer buttons. */
  errorMessage?: string | null;
};

export const WizardForm: React.FC<Props> = ({
  steps,
  onSubmit,
  submitting,
  submitLabel,
  errorMessage,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [stepIndex, setStepIndex] = useState(0);
  const total = steps.length;
  const step = steps[stepIndex];
  const isLast = stepIndex === total - 1;

  // Validation is cheap — reading local state — so re-run on every render.
  const stepIsValid = useMemo(() => step.validate(), [step]);

  const goNext = useCallback(() => {
    if (!stepIsValid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStepIndex((i) => Math.min(i + 1, total - 1));
  }, [stepIsValid, total]);

  const goBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!stepIsValid) return;
    // Validate every step before submitting. If an earlier step broke,
    // jump to it so the user can see what needs fixing.
    for (let i = 0; i < total; i++) {
      if (!steps[i].validate()) {
        setStepIndex(i);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
        return;
      }
    }
    void onSubmit();
  }, [stepIsValid, steps, total, onSubmit]);

  return (
    <View style={styles.wrap}>
      {/* ---- Progress dots ---- */}
      <View
        style={styles.dotsRow}
        accessibilityRole="progressbar"
        accessibilityLabel={`${stepIndex + 1} / ${total}`}
      >
        {steps.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <View
              key={s.id}
              style={[
                styles.dot,
                {
                  backgroundColor: active
                    ? colors.primary
                    : done
                      ? colors.primary
                      : colors.border,
                  opacity: done ? 0.55 : 1,
                  transform: [{ scale: active ? 1.25 : 1 }],
                },
              ]}
            />
          );
        })}
      </View>

      {/* ---- Step header ---- */}
      <View style={styles.header}>
        <Text style={styles.stepIcon}>{step.icon}</Text>
        <Text style={[styles.stepTitle, { color: colors.text }]}>
          {t(step.titleKey)}
        </Text>
        {step.hintKey ? (
          <Text style={[styles.stepHint, { color: colors.textMuted }]}>
            {t(step.hintKey)}
          </Text>
        ) : null}
      </View>

      {/* ---- Fields ---- */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {step.render()}
      </ScrollView>

      {/* ---- Footer navigation ---- */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        {errorMessage ? (
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {errorMessage}
          </Text>
        ) : null}

        <View style={styles.footerRow}>
          {stepIndex > 0 ? (
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t("back")}
              style={({ pressed }) => [
                styles.backBtn,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.backBtnText, { color: colors.text }]}>
                ← {t("back")}
              </Text>
            </Pressable>
          ) : null}

          {!isLast ? (
            <Pressable
              onPress={goNext}
              disabled={!stepIsValid}
              accessibilityRole="button"
              accessibilityState={{ disabled: !stepIsValid }}
              accessibilityLabel={t("continue")}
              style={({ pressed }) => [
                styles.nextBtn,
                {
                  backgroundColor: stepIsValid ? colors.primary : colors.border,
                  opacity: pressed && stepIsValid ? 0.85 : 1,
                  flex: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.nextBtnText,
                  { color: stepIsValid ? colors.onPrimary : colors.textMuted },
                ]}
              >
                {t("continue")} →
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={!stepIsValid || submitting}
              accessibilityRole="button"
              accessibilityState={{
                disabled: !stepIsValid || submitting,
                busy: submitting,
              }}
              accessibilityLabel={submitLabel}
              style={({ pressed }) => [
                styles.nextBtn,
                {
                  backgroundColor:
                    stepIsValid && !submitting ? colors.primary : colors.border,
                  opacity: pressed && stepIsValid && !submitting ? 0.85 : 1,
                  flex: 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.nextBtnText,
                  {
                    color:
                      stepIsValid && !submitting
                        ? colors.onPrimary
                        : colors.textMuted,
                  },
                ]}
              >
                {submitting ? "…" : submitLabel}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  stepIcon: { fontSize: 56 },
  stepTitle: { ...typography.h2, textAlign: "center" },
  stepHint: { ...typography.body, textAlign: "center" },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  backBtn: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: { ...typography.bodyBold },
  nextBtn: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  nextBtnText: { ...typography.bodyBold, fontSize: 20 },
});
