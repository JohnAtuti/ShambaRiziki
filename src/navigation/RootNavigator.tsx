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
import { useTheme } from "../theme/ThemeContext";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    const onBackPress = (): boolean => {
      // Case 1: mid-stack → go back one screen
      if (navigationRef.isReady() && navigationRef.canGoBack()) {
        navigationRef.goBack();
        return true;
      }

      // Case 2: at Home → confirm exit rather than dropping the user silently
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

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontWeight: "800" },
          headerTintColor: colors.primary,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Placeholder"
          component={PlaceholderScreen}
          options={({ route }) => ({ title: t(route.params.titleKey) })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
