import type {
  CropActivityType,
  CropCategory,
  CycleStatus,
  PlantingMethod,
} from "../db";

/**
 * Display helpers for crops, cycles, and activities.
 *
 * Pure lookups — not React hooks. Names deliberately do not start with "use"
 * so the react-hooks ESLint plugin never mistakes them for hooks.
 */

export const iconForCategory = (category: CropCategory): string => {
  switch (category) {
    case "cereal":
      return "🌾";
    case "legume":
      return "🫘";
    case "vegetable":
      return "🥬";
    case "fruit":
      return "🍎";
    case "root":
      return "🥔";
    case "cash":
      return "💵";
    case "fodder":
      return "🌿";
    case "other":
    default:
      return "🌱";
  }
};

export const keyForCategory = (category: CropCategory): string =>
  `cat_${category}`;

export const iconForStatus = (status: CycleStatus): string => {
  switch (status) {
    case "planned":
      return "📋";
    case "active":
      return "🌱";
    case "harvested":
      return "🌾";
    case "abandoned":
      return "❌";
    default:
      return "❓";
  }
};

export const keyForStatus = (status: CycleStatus): string => `status_${status}`;

export const keyForMethod = (method: PlantingMethod): string =>
  `method_${method}`;

export const iconForActivityType = (type: CropActivityType): string => {
  switch (type) {
    case "land_prep":
      return "🚜";
    case "planting":
      return "🌱";
    case "fertilizer":
      return "💩";
    case "pesticide":
      return "🧪";
    case "herbicide":
      return "🌿";
    case "irrigation":
      return "💧";
    case "scouting":
      return "🔍";
    case "weeding":
      return "🪴";
    case "thinning":
      return "✂️";
    case "harvest":
      return "🌾";
    case "post_harvest":
      return "📦";
    case "other":
    default:
      return "📝";
  }
};

export const keyForActivityType = (type: CropActivityType): string =>
  `act_${type}`;

export const CATEGORY_VALUES: readonly CropCategory[] = [
  "cereal",
  "legume",
  "vegetable",
  "fruit",
  "root",
  "cash",
  "fodder",
  "other",
];

export const STATUS_VALUES: readonly CycleStatus[] = [
  "planned",
  "active",
  "harvested",
  "abandoned",
];

export const METHOD_VALUES: readonly PlantingMethod[] = [
  "direct_sowing",
  "transplanting",
  "broadcasting",
  "other",
];

export const ACTIVITY_TYPE_VALUES: readonly CropActivityType[] = [
  "land_prep",
  "planting",
  "fertilizer",
  "pesticide",
  "herbicide",
  "irrigation",
  "scouting",
  "weeding",
  "thinning",
  "harvest",
  "post_harvest",
  "other",
];
