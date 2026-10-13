import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: React.ReactNode;
  hint?: string;
  error?: string | null;
  required?: boolean;
} & Pick<
  TextInputProps,
  | "placeholder"
  | "autoCapitalize"
  | "autoCorrect"
  | "maxLength"
  | "returnKeyType"
  | "onSubmitEditing"
  | "keyboardType"
  | "editable"
>;

export const FormField: React.FC<Props> = ({
  label,
  value,
  onChangeText,
  icon,
  hint,
  error,
  required,
  ...inputProps
}) => {
  const { colors } = useTheme();
  const hasError = Boolean(error);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        {icon ? <View style={styles.labelIcon}>{icon}</View> : null}
        <Text style={[styles.label, { color: colors.text }]}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      </View>

      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: hasError ? colors.danger : colors.border,
          },
        ]}
        {...inputProps}
      />

      {hasError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  labelIcon: { alignItems: "center", justifyContent: "center" },
  label: { ...typography.label },
  hint: { ...typography.caption, marginBottom: spacing.sm },
  input: {
    ...typography.body,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: { ...typography.caption, marginTop: spacing.xs },
});
