import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";

import { useTheme } from "../theme/ThemeContext";
import { radius, spacing, TOUCH_TARGET } from "../theme/colors";
import { typography } from "../theme/typography";

type Props = {
  label: string;
  value: string; // ISO date "YYYY-MM-DD", or "" when unset
  onChange: (iso: string) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
  clearable?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const isoToDate = (iso: string): Date => {
  if (!iso) return new Date();
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  // Build at UTC noon so DST shifts never push it to a different day.
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0),
  );
};

const dateToIso = (d: Date): string => {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
};

const formatDisplay = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  return `${day} ${MONTHS[monthIdx]} ${m[1]}`;
};

export const DateField: React.FC<Props> = ({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  clearable = true,
  minimumDate,
  maximumDate,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => isoToDate(value));

  const hasValue = value.length > 0;
  const hasError = Boolean(error);

  const open = useCallback(() => {
    setTempDate(isoToDate(value));
    setPickerOpen(true);
  }, [value]);

  const close = useCallback(() => setPickerOpen(false), []);

  const onPickerChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") {
        setPickerOpen(false);
        if (event.type === "set" && selected) {
          onChange(dateToIso(selected));
        }
        return;
      }
      if (selected) setTempDate(selected);
    },
    [onChange],
  );

  const confirmIos = useCallback(() => {
    onChange(dateToIso(tempDate));
    setPickerOpen(false);
  }, [onChange, tempDate]);

  const clear = useCallback(() => {
    onChange("");
    setPickerOpen(false);
  }, [onChange]);

  const display = useMemo(() => formatDisplay(value), [value]);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text }]}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      </View>

      {hint ? (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}

      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: display || t("date_not_set") }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.surface,
            borderColor: hasError ? colors.danger : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.triggerIcon}>📅</Text>
        <Text
          style={[
            styles.triggerText,
            { color: hasValue ? colors.text : colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {hasValue ? display : t("date_choose")}
        </Text>
        {clearable && hasValue ? (
          <Pressable
            onPress={clear}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("delete")}
            style={styles.clearBtn}
          >
            <Text style={[styles.clearText, { color: colors.textMuted }]}>
              ✕
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      {hasError ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : null}

      {pickerOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          display="default"
          onChange={onPickerChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="slide"
          onRequestClose={close}
        >
          <Pressable style={styles.backdrop} onPress={close} />
          <View style={[styles.iosSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.iosHeader}>
              <Pressable onPress={close} hitSlop={12}>
                <Text style={[styles.iosBtn, { color: colors.textMuted }]}>
                  {t("cancel")}
                </Text>
              </Pressable>
              <Text style={[styles.iosTitle, { color: colors.text }]}>
                {label}
              </Text>
              <Pressable onPress={confirmIos} hitSlop={12}>
                <Text style={[styles.iosBtn, { color: colors.primary }]}>
                  {t("yes")}
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              onChange={onPickerChange}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              textColor={colors.text}
            />
          </View>
        </Modal>
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
  label: { ...typography.label },
  hint: { ...typography.caption, marginBottom: spacing.sm },
  trigger: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  triggerIcon: { fontSize: 22 },
  triggerText: { ...typography.body, flex: 1 },
  clearBtn: { paddingHorizontal: spacing.sm },
  clearText: { fontSize: 20, fontWeight: "700" },
  error: { ...typography.caption, marginTop: spacing.xs },

  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  iosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  iosTitle: { ...typography.h3 },
  iosBtn: { ...typography.bodyBold },
});
