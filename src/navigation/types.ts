import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  FarmSetup: undefined;
  Home: undefined;
  Placeholder: { titleKey: string };
  Plots: undefined;
  PlotDetail: { plotId: string };
  PlotForm: { plotId?: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
