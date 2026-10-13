import React, { useCallback, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  icon?: string;
};

type Props<T extends string> = {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  icon?: React.ReactNode;
  hint?: string;
  required?: boolean;
  placeholder?: string;
};

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  hint,
  required,
  placeholder,
}: Props<T>): React.ReactElement {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);

  const handleOpen = useCallback((): void => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(true);
  }, []);

  const handlePick = useCallback(
    (next: T): void => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

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

      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder ?? "" }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.triggerContent}>
          {selected?.icon ? (
            <Text style={styles.triggerIcon}>{selected.icon}</Text>
          ) : null}
          <Text
            style={[
              styles.triggerText,
              { color: selected ? colors.text : colors.textMuted },
            ]}
            numberOfLines={1}
          >
            {selected?.label ?? placeholder ?? ""}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          onPress={() => setOpen(false)}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {label}
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => handlePick(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: isSelected
                        ? colors.primary
                        : pressed
                          ? colors.surfaceAlt
                          : "transparent",
                    },
                  ]}
                >
                  {opt.icon ? (
                    <Text style={styles.optionIcon}>{opt.icon}</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.optionLabel,
                      {
                        color: isSelected ? colors.onPrimary : colors.text,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isSelected ? (
                    <Text style={[styles.check, { color: colors.onPrimary }]}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

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
  trigger: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  triggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  triggerIcon: { fontSize: 24 },
  triggerText: { ...typography.body, flex: 1 },
  chevron: { fontSize: 20, paddingHorizontal: spacing.sm },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.h2,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  scroll: { maxHeight: 480 },
  scrollContent: { paddingVertical: spacing.sm },
  option: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.sm,
  },
  optionIcon: { fontSize: 32 },
  optionLabel: { ...typography.body, flex: 1 },
  check: { fontSize: 24, fontWeight: "800" },
});
