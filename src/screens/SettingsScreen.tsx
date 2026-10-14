import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { LanguageToggle } from "../components/LanguageToggle";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  backupRepo,
  exportFilename,
  exportRepo,
  settingsRepo,
  windowForPeriod,
} from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type ExportKind = "transactions" | "plot_profit" | "production";

const LAST_BACKUP_KEY = "backup_last_at";

const relativeTime = (
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string => {
  if (!iso) return t("settings_never_backed_up");
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t("settings_never_backed_up");
  const diffMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("settings_backup_just_now");
  if (minutes < 60) return t("settings_backup_minutes_ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("settings_backup_hours_ago", { n: hours });
  const days = Math.floor(hours / 24);
  return t("settings_backup_days_ago", { n: days });
};

export const SettingsScreen: React.FC<
  RootStackScreenProps<"Settings">
> = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm, reload } = useAppState();

  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const value = await settingsRepo.get<string>(ctx, LAST_BACKUP_KEY);
      setLastBackupAt(typeof value === "string" ? value : null);
    } catch (err) {
      if (__DEV__) console.warn("[Settings] load failed", err);
    }
  }, [ctx]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onBackup = useCallback(async (): Promise<void> => {
    if (!ctx || backingUp) return;
    setBackingUp(true);
    try {
      const created = await backupRepo.createBackup(ctx);
      setLastBackupAt(created.createdAt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      const available = await Sharing.isAvailableAsync();
      if (available) {
        void Sharing.shareAsync(created.uri).catch(() => {});
      } else {
        Alert.alert(
          t("settings_backup_done_title"),
          t("settings_backup_done_message", { name: created.name }),
        );
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      Alert.alert(t("settings_backup_error_title"), t("settings_backup_error"));
      if (__DEV__) console.warn("[Settings] backup failed", err);
    } finally {
      setBackingUp(false);
    }
  }, [ctx, backingUp, t]);

  const runExport = useCallback(
    async (kind: ExportKind): Promise<void> => {
      if (!ctx || !activeFarm || exporting !== null) return;
      setExporting(kind);
      try {
        const window = windowForPeriod("all_time");
        let csv: string;
        if (kind === "transactions") {
          csv = await exportRepo.exportTransactionsCsv(
            ctx,
            activeFarm.id,
            window,
          );
        } else if (kind === "plot_profit") {
          csv = await exportRepo.exportPlotProfitCsv(
            ctx,
            activeFarm.id,
            window,
          );
        } else {
          csv = await exportRepo.exportAnimalProductionCsv(
            ctx,
            activeFarm.id,
            window,
          );
        }

        const filename = exportFilename(kind, "csv");
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        file.write(csv);

        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(file.uri);
        } else {
          Alert.alert(
            t("settings_export_ready_title"),
            t("settings_export_ready_message", { name: filename }),
          );
        }
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      } catch (err) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => {},
        );
        Alert.alert(
          t("settings_export_error_title"),
          t("settings_export_error"),
        );
        if (__DEV__) console.warn("[Settings] export failed", err);
      } finally {
        setExporting(null);
      }
    },
    [ctx, activeFarm, exporting, t],
  );

  const performRestore = useCallback(
    async (uri: string): Promise<void> => {
      if (!ctx) return;
      setRestoring(true);
      try {
        await backupRepo.restoreBackup(ctx, uri);
        // The live connection was closed by restoreBackup. reload() will
        // reopen it via getDb() and re-fetch app state. Migrations run
        // automatically if the backup is from an older app version.
        await reload();
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        Alert.alert(
          t("settings_restore_done_title"),
          t("settings_restore_done_message"),
        );
      } catch (err) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => {},
        );
        const message =
          err instanceof Error ? err.message : t("settings_restore_error");
        Alert.alert(t("settings_restore_error_title"), message);
        if (__DEV__) console.warn("[Settings] restore failed", err);
      } finally {
        setRestoring(false);
      }
    },
    [ctx, reload, t],
  );

  const onRestore = useCallback(async (): Promise<void> => {
    if (restoring) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const validation = await backupRepo.validateBackup(asset.uri);
      if (!validation.ok) {
        Alert.alert(
          t("settings_restore_invalid_title"),
          t("settings_restore_invalid_message"),
        );
        return;
      }

      Alert.alert(
        t("settings_restore_confirm_title"),
        t("settings_restore_confirm_message"),
        [
          { text: t("no"), style: "cancel" },
          {
            text: t("yes"),
            style: "destructive",
            onPress: () => {
              void performRestore(asset.uri);
            },
          },
        ],
        { cancelable: true },
      );
    } catch (err) {
      Alert.alert(
        t("settings_restore_error_title"),
        t("settings_restore_error"),
      );
      if (__DEV__) console.warn("[Settings] picker failed", err);
    }
  }, [restoring, performRestore, t]);

  return (
    <Screen>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        {t("settings_subtitle")}
      </Text>

      <Text style={[styles.sectionHeading, { color: colors.text }]}>
        {t("settings_appearance_section")}
      </Text>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          {t("theme")}
        </Text>
        <View style={styles.rowAction}>
          <ThemeToggle />
        </View>
      </View>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          {t("language")}
        </Text>
        <View style={styles.rowAction}>
          <LanguageToggle />
        </View>
      </View>

      <Text style={[styles.sectionHeading, { color: colors.text }]}>
        {t("settings_backup_section")}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardHint, { color: colors.textMuted }]}>
          {t("settings_backup_hint")}
        </Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
            {t("settings_backup_last")}
          </Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {relativeTime(lastBackupAt, t)}
          </Text>
        </View>
      </View>
      <BigButton
        label={
          backingUp ? t("settings_backup_working") : t("settings_backup_now")
        }
        onPress={() => void onBackup()}
        disabled={backingUp}
        variant="primary"
        style={styles.actionBtn}
      />
      <BigButton
        label={
          restoring ? t("settings_restore_working") : t("settings_restore")
        }
        onPress={() => void onRestore()}
        disabled={restoring}
        variant="secondary"
        style={styles.actionBtn}
      />
      <Text style={[styles.warningText, { color: colors.danger }]}>
        {t("settings_restore_warning")}
      </Text>

      <Text
        style={[
          styles.sectionHeading,
          { color: colors.text, marginTop: spacing.xl },
        ]}
      >
        {t("settings_export_section")}
      </Text>
      <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
        {t("settings_export_hint")}
      </Text>

      <BigButton
        label={
          exporting === "transactions"
            ? t("settings_export_working")
            : t("settings_export_transactions")
        }
        onPress={() => void runExport("transactions")}
        disabled={exporting !== null}
        variant="secondary"
        style={styles.exportBtn}
      />
      <BigButton
        label={
          exporting === "plot_profit"
            ? t("settings_export_working")
            : t("settings_export_plot_profit")
        }
        onPress={() => void runExport("plot_profit")}
        disabled={exporting !== null}
        variant="secondary"
        style={styles.exportBtn}
      />
      <BigButton
        label={
          exporting === "production"
            ? t("settings_export_working")
            : t("settings_export_production")
        }
        onPress={() => void runExport("production")}
        disabled={exporting !== null}
        variant="secondary"
        style={styles.exportBtn}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  subtitle: {
    ...typography.body,
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  sectionHint: {
    ...typography.caption,
    marginBottom: spacing.md,
  },

  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardHint: { ...typography.caption },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  infoLabel: { ...typography.body },
  infoValue: { ...typography.bodyBold },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowLabel: { ...typography.body },
  rowAction: { flexDirection: "row", alignItems: "center" },

  actionBtn: { marginBottom: spacing.sm, alignSelf: "stretch" },
  exportBtn: { marginBottom: spacing.sm, alignSelf: "stretch" },
  warningText: {
    ...typography.caption,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
});
