import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, TOUCH_TARGET } from "../theme/colors";

export const ThemeToggle: React.FC = () => {
  const { effective, toggle, colors } = useTheme();

  const onPress = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    toggle();
  }, [toggle]);

  const nextLabel = effective === "dark" ? "Light mode" : "Dark mode";

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={nextLabel}
      style={[
        styles.button,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
      ]}
    >
      <Text style={styles.emoji}>{effective === "dark" ? "☀️" : "🌙"}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: TOUCH_TARGET - 4,
    height: TOUCH_TARGET - 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 28 },
});
