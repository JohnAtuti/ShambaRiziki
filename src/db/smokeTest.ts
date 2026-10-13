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
import { taskTemplateRepo } from "./taskTemplates";
import { taskRepo } from "./tasks";
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
  await db.runAsync(`DELETE FROM tasks WHERE title LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM task_templates WHERE name LIKE ?`, [
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

  // 2. Plot + crop + cycle (light coverage — full CRUD covered in earlier smoke)
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

  // 3. Herd + animal + records
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

  // 4. Inventory — items + transaction
  const warehouse = await warehouseRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}store`,
  });
  const item = await inventoryItemRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}DAP`,
    category: "fertilizer",
    unit: "kg",
    reorderLevel: 20,
  });
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
    supplier: "AgroVet",
    batchNumber: "BATCH-A",
    expiryDate: "2026-12-31T00:00:00.000Z",
    notes: `${TEST_PREFIX}purchase`,
  });
  await inventoryTransactionRepo.create(ctx, {
    farmId: farm.id,
    itemId: item.id,
    warehouseId: warehouse.id,
    transactionType: "issue",
    transactionDate: "2026-04-10T00:00:00.000Z",
    quantity: 30,
    quantityUnit: "kg",
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
    notes: `${TEST_PREFIX}issue`,
  });
  const stock = await inventoryItemRepo.getStockForItem(ctx, item.id);
  if (stock !== 70) {
    throw new Error(`expected stock 70, got ${stock}`);
  }

  // 5. Task template
  const template = await taskTemplateRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}weekly weeding`,
    taskType: "field_work",
    defaultPriority: "normal",
    defaultRecurrenceType: "weekly",
    defaultDueOffsetDays: 0,
    defaultTargetType: "plot",
    estimatedHours: 2,
  });

  const templates = await taskTemplateRepo.listByFarm(ctx, farm.id);
  if (templates.length !== 1) {
    throw new Error(`expected 1 template, got ${templates.length}`);
  }

  const activeTemplates = await taskTemplateRepo.listActiveByFarm(ctx, farm.id);
  if (activeTemplates.length !== 1) {
    throw new Error(
      `expected 1 active template, got ${activeTemplates.length}`,
    );
  }

  // 6. One-off task — non-recurring
  const oneOff = await taskRepo.create(ctx, {
    farmId: farm.id,
    title: `${TEST_PREFIX}buy vaccines`,
    taskType: "inventory_check",
    priority: "high",
    dueDate: "2026-04-20T09:00:00.000Z",
    targetType: "item",
    targetId: item.id,
    targetLabel: item.name,
  });

  if (oneOff.recurrenceType !== "none") {
    throw new Error("one-off task should have recurrenceType 'none'");
  }
  if (oneOff.recurrenceParentId !== null) {
    throw new Error("one-off task should not have a recurrence parent");
  }

  // 7. Weekly recurring task — should pre-generate ~13 occurrences within 90 days
  const recurring = await taskRepo.create(ctx, {
    farmId: farm.id,
    templateId: template.id,
    title: `${TEST_PREFIX}weekly weeding`,
    taskType: "field_work",
    priority: "normal",
    dueDate: "2026-04-06T08:00:00.000Z",
    recurrenceType: "weekly",
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });

  if (recurring.recurrenceParentId !== null) {
    throw new Error("parent task should not reference a parent");
  }

  const childCount = await taskRepo.countByRecurrenceParent(ctx, recurring.id);
  if (childCount < 12) {
    throw new Error(`expected at least 12 children, got ${childCount}`);
  }

  const seriesTasks = await taskRepo.listByTarget(ctx, "plot", plot.id);
  // Both the one-off (target=item) and the series (target=plot) exist, but
  // only the series matches target=plot.
  if (seriesTasks.length !== childCount + 1) {
    throw new Error(
      `expected ${childCount + 1} tasks for plot, got ${seriesTasks.length}`,
    );
  }

  // 8. Complete one child
  const firstChild = seriesTasks.find((t) => t.recurrenceParentId !== null);
  if (!firstChild) {
    throw new Error("expected at least one child occurrence");
  }

  const completed = await taskRepo.complete(ctx, firstChild.id, {
    actualHours: 1.5,
  });
  if (completed.status !== "completed") {
    throw new Error("complete should set status to completed");
  }
  if (completed.completedAt === null) {
    throw new Error("complete should set completedAt");
  }
  if (completed.actualHours !== 1.5) {
    throw new Error(`expected actualHours 1.5, got ${completed.actualHours}`);
  }

  const completedCount = await taskRepo.countByStatus(
    ctx,
    farm.id,
    "completed",
  );
  if (completedCount !== 1) {
    throw new Error(`expected 1 completed task, got ${completedCount}`);
  }

  // 9. listBetween returns the full series within a wide window
  const series = await taskRepo.listBetween(
    ctx,
    farm.id,
    "2026-01-01T00:00:00.000Z",
    "2026-12-31T23:59:59.999Z",
  );
  if (series.length < childCount + 2) {
    // +2 accounts for the parent row and the one-off task.
    throw new Error(
      `expected at least ${childCount + 2} tasks in window, got ${series.length}`,
    );
  }

  // 10. Delete the whole series
  const affected = await taskRepo.softDeleteSeries(ctx, recurring.id);
  if (affected < childCount + 1) {
    throw new Error(
      `expected to delete at least ${childCount + 1} tasks, got ${affected}`,
    );
  }

  const afterSeriesDelete = await taskRepo.getById(ctx, recurring.id);
  if (afterSeriesDelete !== null) {
    throw new Error("parent should be hidden after series delete");
  }

  // One-off task should still be visible
  const stillVisible = await taskRepo.getById(ctx, oneOff.id);
  if (!stillVisible) {
    throw new Error("unrelated task should not be affected by series delete");
  }

  // 11. Restore the parent — children stay deleted
  await taskRepo.restore(ctx, recurring.id);
  const restoredParent = await taskRepo.getById(ctx, recurring.id);
  if (!restoredParent) {
    throw new Error("parent should be restorable");
  }

  // 12. Full sweep on unrelated tables to catch schema drift
  const photo = await attachmentRepo.create(ctx, {
    farmId: farm.id,
    entityType: "task",
    entityId: oneOff.id,
    kind: "photo",
    localPath: `/tmp/${TEST_PREFIX}task.jpg`,
    caption: `${TEST_PREFIX}task photo`,
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

  // 13. Cleanup
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
