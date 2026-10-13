import type {
  InventoryTargetType,
  InventoryTransactionType,
  ItemCategory,
} from "../db";

// Pure lookups. No `use` prefix.

export const iconForItemCategory = (category: ItemCategory): string => {
  switch (category) {
    case "seed":
      return "🌱";
    case "fertilizer":
      return "💩";
    case "pesticide":
      return "🧪";
    case "herbicide":
      return "🌿";
    case "feed":
      return "🌾";
    case "veterinary_drug":
      return "💊";
    case "fuel":
      return "⛽";
    case "tool":
      return "🔧";
    case "packaging":
      return "📦";
    case "other":
    default:
      return "📦";
  }
};

export const keyForItemCategory = (category: ItemCategory): string =>
  `inv_cat_${category}`;

export const iconForTransactionType = (
  type: InventoryTransactionType,
): string => {
  switch (type) {
    case "purchase":
      return "🛒";
    case "issue":
      return "📤";
    case "return":
      return "↩️";
    case "adjustment_in":
      return "➕";
    case "adjustment_out":
      return "➖";
    case "stocktake":
      return "📋";
    default:
      return "📝";
  }
};

export const keyForTransactionType = (type: InventoryTransactionType): string =>
  `tx_${type}`;

export const keyForTargetType = (type: InventoryTargetType): string => {
  switch (type) {
    case "plot":
      return "transaction_target_plot";
    case "animal":
      return "transaction_target_animal";
    case "herd":
      return "transaction_target_herd";
    case "crop_cycle":
      return "transaction_target_cycle";
    case "worker":
      return "transaction_target_worker";
    case "other":
    default:
      return "transaction_target_other";
  }
};

// Sign for display and stock math. Never used in the DB layer — that's
// handled by SQL fragments inside the repos.
export const signForTransactionType = (
  type: InventoryTransactionType,
): 1 | -1 => {
  switch (type) {
    case "purchase":
    case "return":
    case "adjustment_in":
    case "stocktake":
      return 1;
    case "issue":
    case "adjustment_out":
      return -1;
    default:
      return 1;
  }
};

export const ITEM_CATEGORY_VALUES: readonly ItemCategory[] = [
  "seed",
  "fertilizer",
  "pesticide",
  "herbicide",
  "feed",
  "veterinary_drug",
  "fuel",
  "tool",
  "packaging",
  "other",
];

export const TRANSACTION_TYPE_VALUES: readonly InventoryTransactionType[] = [
  "purchase",
  "issue",
  "return",
  "adjustment_in",
  "adjustment_out",
  "stocktake",
];

export const TARGET_TYPE_VALUES: readonly InventoryTargetType[] = [
  "plot",
  "animal",
  "herd",
  "crop_cycle",
  "worker",
  "other",
];
