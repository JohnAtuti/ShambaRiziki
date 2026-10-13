import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";

type LangCode = "en" | "sw";

const LANGS: readonly { code: LangCode; label: string; a11y: string }[] = [
  { code: "en", label: "EN", a11y: "English" },
  { code: "sw", label: "SW", a11y: "Kiswahili" },
];

export const LanguageToggle: React.FC = () => {
  const { i18n } = useTranslation();
  const { colors } = useTheme();
  const current: LangCode = i18n.language?.startsWith("sw") ? "sw" : "en";

  const setLanguage = useCallback(
    async (code: LangCode): Promise<void> => {
      if (code === current) return;
      Haptics.selectionAsync().catch(() => {});
      try {
        await i18n.changeLanguage(code);
        await AsyncStorage.setItem("lang", code);
      } catch (error) {
        if (__DEV__) {
          console.warn("[LanguageToggle] changeLanguage failed", error);
        }
      }
    },
    [current, i18n],
  );

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
      ]}
    >
      {LANGS.map(({ code, label, a11y }) => {
        const active = current === code;
        return (
          <Pressable
            key={code}
            onPress={() => void setLanguage(code)}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityState={{ selected: active }}
            style={[styles.item, active && { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.text,
                { color: active ? colors.onPrimary : colors.textMuted },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    padding: 3,
    gap: 3,
  },
  item: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...typography.label,
    letterSpacing: 1,
  },
});
