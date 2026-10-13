import React, { useEffect } from "react";
import { Alert, BackHandler } from "react-native";
import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import type { RootStackParamList } from "./types";
import { HomeScreen } from "../screens/HomeScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { FarmSetupScreen } from "../screens/FarmSetupScreen";
import { BootScreen } from "../screens/BootScreen";
import { PlotsListScreen } from "../screens/PlotsListScreen";
import { PlotDetailScreen } from "../screens/PlotDetailScreen";
import { PlotFormScreen } from "../screens/PlotFormScreen";
import { CropsListScreen } from "../screens/CropsListScreen";
import { CropFormScreen } from "../screens/CropFormScreen";
import { PlotCyclesScreen } from "../screens/PlotCyclesScreen";
import { CycleFormScreen } from "../screens/CycleFormScreen";
import { CycleDetailScreen } from "../screens/CycleDetailScreen";
import { ActivityFormScreen } from "../screens/ActivityFormScreen";
import { useTheme } from "../theme/ThemeContext";
import { useAppState } from "../state/AppStateContext";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { status, error, activeFarm, reload } = useAppState();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    const onBackPress = (): boolean => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }
      Alert.alert(
        t("exit_title"),
        t("exit_message"),
        [
          { text: t("no"), style: "cancel" },
          { text: t("yes"), onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true },
      );
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [navigationRef, t]);

  if (status === "loading") {
    return <BootScreen status="loading" />;
  }

  if (status === "error") {
    return (
      <BootScreen status="error" error={error} onRetry={() => void reload()} />
    );
  }

  const needsOnboarding = !activeFarm;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={needsOnboarding ? "FarmSetup" : "Home"}
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontWeight: "800" },
          headerTintColor: colors.primary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {needsOnboarding ? (
          <Stack.Screen
            name="FarmSetup"
            component={FarmSetupScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Plots"
              component={PlotsListScreen}
              options={{ title: t("plots") }}
            />
            <Stack.Screen
              name="PlotDetail"
              component={PlotDetailScreen}
              options={{ title: t("plot_details") }}
            />
            <Stack.Screen
              name="PlotForm"
              component={PlotFormScreen}
              options={({ route }) => ({
                title: route.params?.plotId ? t("edit_plot") : t("new_plot"),
              })}
            />
            <Stack.Screen
              name="Crops"
              component={CropsListScreen}
              options={{ title: t("crops") }}
            />
            <Stack.Screen
              name="CropForm"
              component={CropFormScreen}
              options={({ route }) => ({
                title: route.params?.cropId ? t("edit_crop") : t("new_crop"),
              })}
            />
            <Stack.Screen
              name="PlotCycles"
              component={PlotCyclesScreen}
              options={{ title: t("cycles") }}
            />
            <Stack.Screen
              name="CycleForm"
              component={CycleFormScreen}
              options={({ route }) => ({
                title: route.params?.cycleId ? t("edit_cycle") : t("new_cycle"),
              })}
            />
            <Stack.Screen
              name="CycleDetail"
              component={CycleDetailScreen}
              options={{ title: t("cycle_details") }}
            />
            <Stack.Screen
              name="ActivityForm"
              component={ActivityFormScreen}
              options={({ route }) => ({
                title: route.params?.activityId
                  ? t("edit_activity")
                  : t("new_activity"),
              })}
            />
            <Stack.Screen
              name="Placeholder"
              component={PlaceholderScreen}
              options={({ route }) => ({ title: t(route.params.titleKey) })}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
