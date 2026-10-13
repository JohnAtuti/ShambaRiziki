import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { plotRepo, type Plot } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

const keyForUse = (use: Plot["currentUse"]): string => {
  switch (use) {
    case "crops":
      return "use_crops";
    case "livestock":
      return "use_livestock";
    case "fallow":
      return "use_fallow";
    case "mixed":
      return "use_mixed";
    case "none":
    default:
      return "use_none";
  }
};

const soilKeyFor = (soil: Plot["soilType"]): string => {
  if (!soil) return "soil_none";
  return `soil_${soil}`;
};

const fertKeyFor = (fert: Plot["fertility"]): string => {
  if (!fert) return "not_set";
  return `fert_${fert}`;
};

const slopeKeyFor = (slope: Plot["slope"]): string => {
  if (!slope) return "not_set";
  return `slope_${slope}`;
};

const tenureKeyFor = (tenure: Plot["tenureType"]): string => {
  return `tenure_${tenure}`;
};

const DetailRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
};

export const PlotDetailScreen: React.FC<RootStackScreenProps<"PlotDetail">> = ({
  route,
  navigation,
}) => {
  const { plotId } = route.params;
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx } = useAppState();

  const [plot, setPlot] = useState<Plot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    try {
      const row = await plotRepo.getById(ctx, plotId);
      if (!row) {
        setNotFound(true);
        setPlot(null);
      } else {
        setPlot(row);
        setNotFound(false);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn("[PlotDetail] load failed", err);
      }
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [ctx, plotId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onEdit = useCallback((): void => {
    navigation.navigate("PlotForm", { plotId });
  }, [navigation, plotId]);

  const onDelete = useCallback((): void => {
    if (!ctx) return;
    Alert.alert(
      t("delete_plot_title"),
      t("delete_plot_message"),
      [
        { text: t("no"), style: "cancel" },
        {
          text: t("yes"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await plotRepo.softDelete(ctx, plotId);
                navigation.goBack();
              } catch (err) {
                if (__DEV__) {
                  console.warn("[PlotDetail] delete failed", err);
                }
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }, [ctx, navigation, plotId, t]);

  if (loading) {
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

  if (notFound || !plot) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.bigIcon}>❓</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {t("plot_not_found")}
          </Text>
          <BigButton
            label={t("back")}
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.stretch}
          />
        </View>
      </Screen>
    );
  }

  const sizeValue =
    plot.size != null ? `${plot.size} ${t(plot.sizeUnit)}` : t("not_set");
  const phValue = plot.soilPh != null ? plot.soilPh.toFixed(1) : t("not_set");

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          <BigButton
            label={t("edit")}
            onPress={onEdit}
            variant="primary"
            style={styles.footerButton}
          />
          <BigButton
            label={t("delete")}
            onPress={onDelete}
            variant="danger"
            style={styles.footerButton}
          />
        </View>
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{plot.name}</Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <DetailRow label={t("detail_size")} value={sizeValue} />
        <DetailRow
          label={t("detail_location")}
          value={plot.locationText ?? t("not_set")}
        />
        <DetailRow
          label={t("detail_soil")}
          value={t(soilKeyFor(plot.soilType))}
        />
        <DetailRow label={t("detail_ph")} value={phValue} />
        <DetailRow
          label={t("detail_fertility")}
          value={t(fertKeyFor(plot.fertility))}
        />
        <DetailRow
          label={t("detail_slope")}
          value={t(slopeKeyFor(plot.slope))}
        />
        <DetailRow
          label={t("detail_tenure")}
          value={t(tenureKeyFor(plot.tenureType))}
        />
        <DetailRow
          label={t("detail_use")}
          value={t(keyForUse(plot.currentUse))}
        />
        {plot.notes ? (
          <DetailRow label={t("detail_notes")} value={plot.notes} />
        ) : null}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: { ...typography.body },
  bigIcon: { fontSize: 64 },
  emptyTitle: { ...typography.h2, textAlign: "center" },
  stretch: { alignSelf: "stretch", marginTop: spacing.lg },

  header: { marginBottom: spacing.lg },
  title: { ...typography.h1 },

  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  rowLabel: { ...typography.caption },
  rowValue: { ...typography.body },

  footerRow: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
