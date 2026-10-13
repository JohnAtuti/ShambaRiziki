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
  TransactionForm: {
    itemId?: string;
    transactionId?: string;
  };

  // Placeholder
  Placeholder: { titleKey: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
