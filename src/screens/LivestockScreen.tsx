import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { Screen } from "../components/Screen";
import { BigButton } from "../components/BigButton";
import { useAppState } from "../state/AppStateContext";
import { useTheme } from "../theme/ThemeContext";
import { radius, spacing } from "../theme/colors";
import { typography } from "../theme/typography";
import { animalRepo, herdRepo } from "../db";
import type { RootStackScreenProps } from "../navigation/types";

type Counts = {
  herds: number;
  animals: number;
  alive: number;
};

export const LivestockScreen: React.FC<RootStackScreenProps<"Livestock">> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { ctx, activeFarm } = useAppState();

  const [counts, setCounts] = useState<Counts>({
    herds: 0,
    animals: 0,
    alive: 0,
  });

  const load = useCallback(async (): Promise<void> => {
    if (!ctx || !activeFarm) return;
    try {
      const [herdCount, animalCount, aliveCount] = await Promise.all([
        herdRepo.countByFarm(ctx, activeFarm.id),
        animalRepo.countByFarm(ctx, activeFarm.id),
        animalRepo.countAliveByFarm(ctx, activeFarm.id),
      ]);
      setCounts({ herds: herdCount, animals: animalCount, alive: aliveCount });
    } catch (err) {
      if (__DEV__) {
        console.warn("[Livestock] counts failed", err);
      }
    }
  }, [ctx, activeFarm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("livestock")}
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          {counts.alive} {t("animal_status_alive").toLowerCase()} ·{" "}
          {counts.herds} {t("herds").toLowerCase()}
        </Text>
      </View>

      <BigButton
        layout="column"
        variant="secondary"
        label={t("herds")}
        onPress={() => navigation.navigate("Herds")}
        style={styles.tile}
        icon={
          <View style={[styles.iconBubble, { backgroundColor: "#8D6E6322" }]}>
            <Text style={styles.iconEmoji}>🏠</Text>
          </View>
        }
      />

      <BigButton
        layout="column"
        variant="secondary"
        label={t("animals")}
        onPress={() => navigation.navigate("Animals", {})}
        style={styles.tile}
        icon={
          <View style={[styles.iconBubble, { backgroundColor: "#43A04722" }]}>
            <Text style={styles.iconEmoji}>🐄</Text>
          </View>
        }
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  title: { ...typography.h1 },
  sub: { ...typography.body },
  tile: { minHeight: 140, marginBottom: spacing.md },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: { fontSize: 34 },
});
