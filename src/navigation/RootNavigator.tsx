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
import { LivestockScreen } from "../screens/LivestockScreen";
import { HerdsListScreen } from "../screens/HerdsListScreen";
import { HerdFormScreen } from "../screens/HerdFormScreen";
import { HerdDetailScreen } from "../screens/HerdDetailScreen";
import { AnimalsListScreen } from "../screens/AnimalsListScreen";
import { AnimalFormScreen } from "../screens/AnimalFormScreen";
import { AnimalDetailScreen } from "../screens/AnimalDetailScreen";
import { AnimalHealthFormScreen } from "../screens/AnimalHealthFormScreen";
import { AnimalBreedingFormScreen } from "../screens/AnimalBreedingFormScreen";
import { AnimalFeedFormScreen } from "../screens/AnimalFeedFormScreen";
import { AnimalProductionFormScreen } from "../screens/AnimalProductionFormScreen";
import { InventoryScreen } from "../screens/InventoryScreen";
import { WarehousesListScreen } from "../screens/WarehousesListScreen";
import { WarehouseFormScreen } from "../screens/WarehouseFormScreen";
import { ItemsListScreen } from "../screens/ItemsListScreen";
import { ItemFormScreen } from "../screens/ItemFormScreen";
import { ItemDetailScreen } from "../screens/ItemDetailScreen";
import { TransactionFormScreen } from "../screens/TransactionFormScreen";
import { TasksScreen } from "../screens/TasksScreen";
import { TaskFormScreen } from "../screens/TaskFormScreen";
import { TaskDetailScreen } from "../screens/TaskDetailScreen";
import { TaskTemplatesScreen } from "../screens/TaskTemplatesScreen";
import { TaskTemplateFormScreen } from "../screens/TaskTemplateFormScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { FinanceScreen } from "../screens/FinanceScreen";
import { FinanceAccountsScreen } from "../screens/FinanceAccountsScreen";
import { FinanceAccountFormScreen } from "../screens/FinanceAccountFormScreen";
import { FinanceCategoriesScreen } from "../screens/FinanceCategoriesScreen";
import { FinanceCategoryFormScreen } from "../screens/FinanceCategoryFormScreen";
import { FinanceTransactionsScreen } from "../screens/FinanceTransactionsScreen";
import { FinanceTransactionFormScreen } from "../screens/FinanceTransactionFormScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { SalesScreen } from "../screens/SalesScreen";
import { CustomersScreen } from "../screens/CustomersScreen";
import { CustomerFormScreen } from "../screens/CustomerFormScreen";
import { InvoicesScreen } from "../screens/InvoicesScreen";
import { SaleFormScreen } from "../screens/SaleFormScreen";
import { SaleDetailScreen } from "../screens/SaleDetailScreen";
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

            {/* Plots */}
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

            {/* Crops */}
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

            {/* Livestock */}
            <Stack.Screen
              name="Livestock"
              component={LivestockScreen}
              options={{ title: t("livestock") }}
            />
            <Stack.Screen
              name="Herds"
              component={HerdsListScreen}
              options={{ title: t("herds") }}
            />
            <Stack.Screen
              name="HerdForm"
              component={HerdFormScreen}
              options={({ route }) => ({
                title: route.params?.herdId ? t("edit_herd") : t("new_herd"),
              })}
            />
            <Stack.Screen
              name="HerdDetail"
              component={HerdDetailScreen}
              options={{ title: t("herd_details") }}
            />
            <Stack.Screen
              name="Animals"
              component={AnimalsListScreen}
              options={({ route }) => ({
                title: route.params?.herdId ? t("herd_members") : t("animals"),
              })}
            />
            <Stack.Screen
              name="AnimalForm"
              component={AnimalFormScreen}
              options={({ route }) => ({
                title: route.params?.animalId
                  ? t("edit_animal")
                  : t("new_animal"),
              })}
            />
            <Stack.Screen
              name="AnimalDetail"
              component={AnimalDetailScreen}
              options={{ title: t("animal_details") }}
            />
            <Stack.Screen
              name="AnimalHealthForm"
              component={AnimalHealthFormScreen}
              options={({ route }) => ({
                title: route.params?.recordId
                  ? t("edit_health_record")
                  : t("new_health_record"),
              })}
            />
            <Stack.Screen
              name="AnimalBreedingForm"
              component={AnimalBreedingFormScreen}
              options={({ route }) => ({
                title: route.params?.recordId
                  ? t("edit_breeding_record")
                  : t("new_breeding_record"),
              })}
            />
            <Stack.Screen
              name="AnimalFeedForm"
              component={AnimalFeedFormScreen}
              options={({ route }) => ({
                title: route.params?.recordId
                  ? t("edit_feed_record")
                  : t("new_feed_record"),
              })}
            />
            <Stack.Screen
              name="AnimalProductionForm"
              component={AnimalProductionFormScreen}
              options={({ route }) => ({
                title: route.params?.recordId
                  ? t("edit_production_record")
                  : t("new_production_record"),
              })}
            />

            {/* Inventory */}
            <Stack.Screen
              name="Inventory"
              component={InventoryScreen}
              options={{ title: t("inventory_title") }}
            />
            <Stack.Screen
              name="Warehouses"
              component={WarehousesListScreen}
              options={{ title: t("warehouses") }}
            />
            <Stack.Screen
              name="WarehouseForm"
              component={WarehouseFormScreen}
              options={({ route }) => ({
                title: route.params?.warehouseId
                  ? t("edit_warehouse")
                  : t("new_warehouse"),
              })}
            />
            <Stack.Screen
              name="Items"
              component={ItemsListScreen}
              options={{ title: t("items") }}
            />
            <Stack.Screen
              name="ItemForm"
              component={ItemFormScreen}
              options={({ route }) => ({
                title: route.params?.itemId ? t("edit_item") : t("new_item"),
              })}
            />
            <Stack.Screen
              name="ItemDetail"
              component={ItemDetailScreen}
              options={{ title: t("item_details") }}
            />
            <Stack.Screen
              name="TransactionForm"
              component={TransactionFormScreen}
              options={({ route }) => ({
                title: route.params.transactionId
                  ? t("edit_transaction")
                  : t("new_transaction"),
              })}
            />

            {/* Tasks */}
            <Stack.Screen
              name="Tasks"
              component={TasksScreen}
              options={{ title: t("tasks_title") }}
            />
            <Stack.Screen
              name="TaskForm"
              component={TaskFormScreen}
              options={({ route }) => ({
                title: route.params?.taskId ? t("edit_task") : t("new_task"),
              })}
            />
            <Stack.Screen
              name="TaskDetail"
              component={TaskDetailScreen}
              options={{ title: t("task_details") }}
            />
            <Stack.Screen
              name="TaskTemplates"
              component={TaskTemplatesScreen}
              options={{ title: t("task_templates") }}
            />
            <Stack.Screen
              name="TaskTemplateForm"
              component={TaskTemplateFormScreen}
              options={({ route }) => ({
                title: route.params?.templateId
                  ? t("edit_template")
                  : t("new_template"),
              })}
            />
            <Stack.Screen
              name="Calendar"
              component={CalendarScreen}
              options={{ title: t("calendar_title") }}
            />

            {/* Finance */}
            <Stack.Screen
              name="Finance"
              component={FinanceScreen}
              options={{ title: t("money") }}
            />
            <Stack.Screen
              name="FinanceAccounts"
              component={FinanceAccountsScreen}
              options={{ title: t("finance_accounts") }}
            />
            <Stack.Screen
              name="FinanceAccountForm"
              component={FinanceAccountFormScreen}
              options={({ route }) => ({
                title: route.params?.accountId
                  ? t("finance_edit_account")
                  : t("finance_new_account"),
              })}
            />
            <Stack.Screen
              name="FinanceCategories"
              component={FinanceCategoriesScreen}
              options={{ title: t("finance_categories") }}
            />
            <Stack.Screen
              name="FinanceCategoryForm"
              component={FinanceCategoryFormScreen}
              options={({ route }) => ({
                title: route.params?.categoryId
                  ? t("finance_edit_category")
                  : t("finance_new_category"),
              })}
            />
            <Stack.Screen
              name="FinanceTransactions"
              component={FinanceTransactionsScreen}
              options={{ title: t("finance_transactions") }}
            />
            <Stack.Screen
              name="FinanceTransactionForm"
              component={FinanceTransactionFormScreen}
              options={({ route }) => ({
                title: route.params?.transactionId
                  ? t("finance_edit_transaction")
                  : t("finance_new_transaction"),
              })}
            />

            {/* Dashboard */}
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: t("dashboard_title") }}
            />

            {/* Settings */}
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: t("settings") }}
            />

            {/* Sales */}
            <Stack.Screen
              name="Sales"
              component={SalesScreen}
              options={{ title: t("sales_title") }}
            />
            <Stack.Screen
              name="Customers"
              component={CustomersScreen}
              options={{ title: t("sales_customers_title") }}
            />
            <Stack.Screen
              name="CustomerForm"
              component={CustomerFormScreen}
              options={({ route }) => ({
                title: route.params?.customerId
                  ? t("edit_customer")
                  : t("new_customer"),
              })}
            />
            <Stack.Screen
              name="Invoices"
              component={InvoicesScreen}
              options={{ title: t("sales_invoices_title") }}
            />
            <Stack.Screen
              name="SaleForm"
              component={SaleFormScreen}
              options={({ route }) => ({
                title: route.params?.saleId ? t("edit_sale") : t("new_sale"),
              })}
            />
            <Stack.Screen
              name="SaleDetail"
              component={SaleDetailScreen}
              options={{ title: t("sale_details") }}
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
