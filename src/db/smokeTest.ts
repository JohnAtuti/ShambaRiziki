/**
 * Runtime verification of the data layer. Runs in __DEV__ only.
 *
 * The test farm is created and immediately set to is_active=0 so a
 * concurrently-running AppStateProvider query cannot pick it up.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { getDb } from "./client";
import { farmRepo } from "./farms";
import { plotRepo } from "./plots";
import { cropRepo } from "./crops";
import { cropCycleRepo } from "./cropCycles";
import { cropActivityRepo } from "./cropActivities";
import { attachmentRepo } from "./attachments";
import { herdRepo } from "./herds";
import { animalRepo } from "./animals";
import { animalHealthRepo } from "./animalHealth";
import { animalBreedingRepo } from "./animalBreeding";
import { animalFeedingRepo } from "./animalFeeding";
import { animalProductionRepo } from "./animalProduction";
import { warehouseRepo } from "./warehouses";
import { inventoryItemRepo } from "./inventoryItems";
import { inventoryTransactionRepo } from "./inventoryTransactions";
import { userRepo } from "./users";
import { settingsRepo } from "./settings";
import type { RepoContext } from "./repository";

const TEST_PREFIX = "__smoke__";

const cleanPriorRuns = async (db: SQLiteDatabase): Promise<void> => {
  await db.runAsync(`DELETE FROM audit_log WHERE entity_id LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM attachments WHERE caption LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM inventory_transactions WHERE notes LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM inventory_items WHERE name LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM warehouses WHERE name LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(
    `DELETE FROM animal_production_records WHERE notes LIKE ?`,
    [`${TEST_PREFIX}%`],
  );
  await db.runAsync(`DELETE FROM animal_feed_records WHERE notes LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM animal_breeding_records WHERE notes LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM animal_health_records WHERE notes LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM animals WHERE tag_id LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM herds WHERE name LIKE ?`, [`${TEST_PREFIX}%`]);
  await db.runAsync(`DELETE FROM crop_activities WHERE description LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM crop_cycles WHERE cycle_name LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM crops WHERE name LIKE ?`, [`${TEST_PREFIX}%`]);
  await db.runAsync(`DELETE FROM plots WHERE name LIKE ?`, [`${TEST_PREFIX}%`]);
  await db.runAsync(`DELETE FROM farms WHERE name LIKE ?`, [`${TEST_PREFIX}%`]);
  await db.runAsync(`DELETE FROM users WHERE name LIKE ?`, [`${TEST_PREFIX}%`]);
  await db.runAsync(`DELETE FROM app_settings WHERE key LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
};

export const runSmokeTest = async (): Promise<void> => {
  if (!__DEV__) return;

  const db = await getDb();
  const ctx: RepoContext = { db, currentUserId: null };

  await cleanPriorRuns(db);

  // 1. Farm
  const farm = await farmRepo.create(ctx, {
    name: `${TEST_PREFIX}farm`,
    size: 5,
    farmType: "mixed",
  });
  await farmRepo.update(ctx, farm.id, { isActive: false });

  // 2. Warehouse
  const warehouse = await warehouseRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}store`,
    location: "Behind the house",
  });

  const warehouses = await warehouseRepo.listByFarm(ctx, farm.id);
  if (warehouses.length !== 1) {
    throw new Error(`expected 1 warehouse, got ${warehouses.length}`);
  }

  // 3. Inventory item
  const item = await inventoryItemRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}DAP fertilizer`,
    sku: "FERT-DAP-50",
    category: "fertilizer",
    unit: "kg",
    reorderLevel: 20,
    reorderQuantity: 100,
    defaultCost: 65,
    defaultCostCurrency: "KES",
  });

  const items = await inventoryItemRepo.listByFarm(ctx, farm.id);
  if (items.length !== 1)
    throw new Error(`expected 1 item, got ${items.length}`);

  const ferts = await inventoryItemRepo.listByCategory(
    ctx,
    farm.id,
    "fertilizer",
  );
  if (ferts.length !== 1)
    throw new Error(`expected 1 fertilizer, got ${ferts.length}`);

  // 4. Stock ledger — purchase 100 kg
  await inventoryTransactionRepo.create(ctx, {
    farmId: farm.id,
    itemId: item.id,
    warehouseId: warehouse.id,
    transactionType: "purchase",
    transactionDate: "2026-04-01T00:00:00.000Z",
    quantity: 100,
    quantityUnit: "kg",
    unitCost: 65,
    totalCost: 6500,
    costCurrency: "KES",
    supplier: "AgroVet Ltd",
    batchNumber: "BATCH-A",
    expiryDate: "2026-12-31T00:00:00.000Z",
    notes: `${TEST_PREFIX}purchase`,
  });

  // Issue 30 kg to a plot
  await inventoryTransactionRepo.create(ctx, {
    farmId: farm.id,
    itemId: item.id,
    warehouseId: warehouse.id,
    transactionType: "issue",
    transactionDate: "2026-04-10T00:00:00.000Z",
    quantity: 30,
    quantityUnit: "kg",
    targetType: "plot",
    targetId: "some-plot-id",
    targetLabel: `${TEST_PREFIX}North field`,
    notes: `${TEST_PREFIX}issue to plot`,
  });

  // Stocktake correction: -2 (found 2 kg less than ledger)
  await inventoryTransactionRepo.create(ctx, {
    farmId: farm.id,
    itemId: item.id,
    warehouseId: warehouse.id,
    transactionType: "stocktake",
    transactionDate: "2026-04-15T00:00:00.000Z",
    quantity: -2,
    quantityUnit: "kg",
    notes: `${TEST_PREFIX}stocktake correction`,
  });

  // 5. Assert stock = 100 - 30 - 2 = 68
  const stock = await inventoryItemRepo.getStockForItem(ctx, item.id);
  if (stock !== 68) {
    throw new Error(`expected stock 68, got ${stock}`);
  }

  const stockLevels = await inventoryItemRepo.getStockLevels(ctx, farm.id);
  if (stockLevels.length !== 1) {
    throw new Error(`expected 1 item in stock map, got ${stockLevels.length}`);
  }
  if (stockLevels[0].quantity !== 68) {
    throw new Error(
      `expected stock map value 68, got ${stockLevels[0].quantity}`,
    );
  }

  // 6. Transaction listing
  const itemTx = await inventoryTransactionRepo.listByItem(ctx, item.id);
  if (itemTx.length !== 3) {
    throw new Error(`expected 3 transactions, got ${itemTx.length}`);
  }

  const purchaseTx = await inventoryTransactionRepo.listByType(
    ctx,
    farm.id,
    "purchase",
  );
  if (purchaseTx.length !== 1) {
    throw new Error(`expected 1 purchase, got ${purchaseTx.length}`);
  }

  const warehouseTx = await inventoryTransactionRepo.listByWarehouse(
    ctx,
    warehouse.id,
  );
  if (warehouseTx.length !== 3) {
    throw new Error(`expected 3 warehouse tx, got ${warehouseTx.length}`);
  }

  const targetTx = await inventoryTransactionRepo.listByTarget(
    ctx,
    "plot",
    "some-plot-id",
  );
  if (targetTx.length !== 1) {
    throw new Error(`expected 1 target tx, got ${targetTx.length}`);
  }

  // 7. Expiring batches (BATCH-A expires 2026-12-31, well within 400 days)
  const expiring = await inventoryTransactionRepo.listExpiring(
    ctx,
    farm.id,
    400,
  );
  if (expiring.length !== 1) {
    throw new Error(`expected 1 expiring batch, got ${expiring.length}`);
  }
  if (expiring[0].batchNumber !== "BATCH-A") {
    throw new Error(
      `expected BATCH-A, got ${expiring[0].batchNumber ?? "null"}`,
    );
  }

  // 8. Soft delete + restore a transaction, then re-check stock
  const extra = await inventoryTransactionRepo.create(ctx, {
    farmId: farm.id,
    itemId: item.id,
    transactionType: "adjustment_out",
    transactionDate: "2026-04-20T00:00:00.000Z",
    quantity: 10,
    quantityUnit: "kg",
    notes: `${TEST_PREFIX}spoilage`,
  });

  const stockAfterExtra = await inventoryItemRepo.getStockForItem(ctx, item.id);
  if (stockAfterExtra !== 58) {
    throw new Error(`expected stock 58 after extra, got ${stockAfterExtra}`);
  }

  await inventoryTransactionRepo.softDelete(ctx, extra.id);
  const stockAfterDelete = await inventoryItemRepo.getStockForItem(
    ctx,
    item.id,
  );
  if (stockAfterDelete !== 68) {
    throw new Error(`expected stock 68 after delete, got ${stockAfterDelete}`);
  }

  await inventoryTransactionRepo.restore(ctx, extra.id);
  const stockAfterRestore = await inventoryItemRepo.getStockForItem(
    ctx,
    item.id,
  );
  if (stockAfterRestore !== 58) {
    throw new Error(
      `expected stock 58 after restore, got ${stockAfterRestore}`,
    );
  }

  // 9. Repo CRUD lite for other entities — same shape as before, so this
  //    is a fast smoke screen, not exhaustive.
  const plot = await plotRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}plot`,
    size: 2,
  });
  const crop = await cropRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}maize`,
    category: "cereal",
  });
  const cycle = await cropCycleRepo.create(ctx, {
    farmId: farm.id,
    plotId: plot.id,
    cropId: crop.id,
    plantingDate: "2026-03-15T00:00:00.000Z",
    status: "active",
  });
  await cropActivityRepo.create(ctx, {
    farmId: farm.id,
    cycleId: cycle.id,
    activityType: "fertilizer",
    activityDate: "2026-04-01T00:00:00.000Z",
    description: `${TEST_PREFIX}applied DAP`,
  });

  const herd = await herdRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}herd`,
    species: "cattle",
    purpose: "dairy",
  });
  const cow = await animalRepo.create(ctx, {
    farmId: farm.id,
    herdId: herd.id,
    tagId: `${TEST_PREFIX}COW-001`,
    sex: "female",
    status: "alive",
  });
  await animalHealthRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordType: "vaccination",
    recordDate: "2026-04-10T00:00:00.000Z",
    notes: `${TEST_PREFIX}vax`,
  });
  await animalBreedingRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordType: "birth",
    recordDate: "2026-02-01T00:00:00.000Z",
    notes: `${TEST_PREFIX}birth`,
  });
  await animalFeedingRepo.create(ctx, {
    farmId: farm.id,
    herdId: herd.id,
    recordDate: "2026-04-12T00:00:00.000Z",
    feedType: "hay",
    quantity: 50,
    notes: `${TEST_PREFIX}hay`,
  });
  await animalProductionRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordDate: "2026-04-12T00:00:00.000Z",
    productionType: "milk",
    quantity: 8.5,
    notes: `${TEST_PREFIX}milk`,
  });

  const photo = await attachmentRepo.create(ctx, {
    farmId: farm.id,
    entityType: "crop_activity",
    entityId: cycle.id,
    kind: "photo",
    localPath: `/tmp/${TEST_PREFIX}photo.jpg`,
    caption: `${TEST_PREFIX}photo`,
  });
  await attachmentRepo.softDelete(ctx, photo.id);
  await attachmentRepo.restore(ctx, photo.id);

  const user = await userRepo.create(ctx, {
    name: `${TEST_PREFIX}user`,
    role: "owner",
    pin: "1234",
  });
  if (!(await userRepo.verifyPin(ctx, user.id, "1234"))) {
    throw new Error("userRepo.verifyPin failed");
  }

  await settingsRepo.set(ctx, `${TEST_PREFIX}flag`, { a: 1 });
  const flag = await settingsRepo.get<{ a: number }>(ctx, `${TEST_PREFIX}flag`);
  if (!flag || flag.a !== 1) throw new Error("settingsRepo round-trip failed");
  await settingsRepo.remove(ctx, `${TEST_PREFIX}flag`);

  // 10. Cleanup
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
