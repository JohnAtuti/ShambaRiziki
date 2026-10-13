import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  // Onboarding
  FarmSetup: undefined;

  // Home
  Home: undefined;

  // Plots (Phase 3)
  Plots: undefined;
  PlotDetail: { plotId: string };
  PlotForm: { plotId?: string };

  // Crops catalog (Phase 4)
  Crops: undefined;
  CropDetail: { cropId: string };
  CropForm: { cropId?: string };

  // Crop cycles (Phase 4)
  PlotCycles: { plotId: string };
  CycleDetail: { cycleId: string };
  CycleForm: { plotId?: string; cycleId?: string };

  // Crop activities (Phase 4)
  ActivityForm: { cycleId: string; activityId?: string };

  // Placeholder for modules not built yet
  Placeholder: { titleKey: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
