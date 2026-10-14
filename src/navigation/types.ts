import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  // Onboarding
  FarmSetup: undefined;

  // Home
  Home: undefined;

  // Plots
  Plots: undefined;
  PlotDetail: { plotId: string };
  PlotForm: { plotId?: string };

  // Crops
  Crops: undefined;
  CropDetail: { cropId: string };
  CropForm: { cropId?: string };

  // Crop cycles
  PlotCycles: { plotId: string };
  CycleDetail: { cycleId: string };
  CycleForm: { plotId?: string; cycleId?: string };

  // Crop activities
  ActivityForm: { cycleId: string; activityId?: string };

  // Livestock
  Livestock: undefined;
  Herds: undefined;
  HerdForm: { herdId?: string };
  HerdDetail: { herdId: string };
  Animals: { herdId?: string };
  AnimalForm: { animalId?: string; defaultHerdId?: string };
  AnimalDetail: { animalId: string };
  AnimalHealthForm: { animalId: string; recordId?: string };
  AnimalBreedingForm: { animalId: string; recordId?: string };
  AnimalFeedForm: { animalId?: string; herdId?: string; recordId?: string };
  AnimalProductionForm: {
    animalId?: string;
    herdId?: string;
    recordId?: string;
  };

  // Inventory
  Inventory: undefined;
  Warehouses: undefined;
  WarehouseForm: { warehouseId?: string };
  Items: undefined;
  ItemForm: { itemId?: string };
  ItemDetail: { itemId: string };
  TransactionForm: { itemId?: string; transactionId?: string };

  // Tasks
  Tasks: undefined;
  TaskForm: {
    taskId?: string;
    templateId?: string;
    defaultTargetType?: string;
    defaultTargetId?: string;
    defaultTargetLabel?: string;
  };
  TaskDetail: { taskId: string };
  TaskTemplates: undefined;
  TaskTemplateForm: { templateId?: string };
  Calendar: undefined;

  // Finance (Phase 8)
  Finance: undefined;
  FinanceAccounts: undefined;
  FinanceAccountForm: { accountId?: string };
  FinanceCategories: undefined;
  FinanceCategoryForm: { categoryId?: string };
  FinanceTransactions: {
    accountId?: string;
    categoryId?: string;
    targetType?: string;
    targetId?: string;
  };
  FinanceTransactionForm: {
    transactionId?: string;
    defaultAccountId?: string;
    defaultCategoryId?: string;
    defaultType?: "income" | "expense" | "transfer";
    defaultTargetType?: string;
    defaultTargetId?: string;
    defaultTargetLabel?: string;
  };

  // Dashboard (Phase 9)
  Dashboard: undefined;

  // Settings (Phase 10)
  Settings: undefined;

  // Sales (Phase 11)
  Sales: undefined;
  Customers: undefined;
  CustomerForm: { customerId?: string };
  CustomerDetail: { customerId: string };
  Invoices: undefined;
  SaleForm: {
    saleId?: string;
    defaultCustomerId?: string;
  };
  SaleDetail: { saleId: string };

  // Placeholder
  Placeholder: { titleKey: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
