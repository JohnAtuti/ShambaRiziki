import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Layout = "row" | "column";

type Props = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: Variant;
  layout?: Layout;
  disabled?: boolean;
  loading?: boolean;
  haptic?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

export const BigButton: React.FC<Props> = ({
  label,
  onPress,
  icon,
  variant = "primary",
  layout = "row",
  disabled = false,
  loading = false,
  haptic = true,
  style,
  accessibilityHint,
}) => {
  const { colors } = useTheme();

  const palette = {
    primary: {
      bg: colors.primary,
      fg: colors.onPrimary,
      border: "transparent",
    },
    secondary: {
      bg: colors.surface,
      fg: colors.text,
      border: colors.border,
    },
    danger: {
      bg: colors.danger,
      fg: colors.onDanger,
      border: "transparent",
    },
    ghost: {
      bg: "transparent",
      fg: colors.text,
      border: colors.border,
    },
  }[variant];

  const isInactive = disabled || loading;

  const handlePress = (): void => {
    if (isInactive) return;
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Haptics unavailable (simulator, web). Non-fatal.
      });
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        layout === "column" ? styles.column : styles.row,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed && !isInactive ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="large" />
      ) : (
        <>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
          <Text
            style={[
              typography.bodyBold,
              layout === "column" && styles.labelColumn,
              { color: palette.fg },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
  },
  column: {
    flexDirection: "column",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  labelColumn: {
    textAlign: "center",
  },
});
