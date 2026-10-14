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
import { financeAccountRepo } from "./financeAccounts";
import { financeCategoryRepo } from "./financeCategories";
import { financeTransactionRepo } from "./financeTransactions";
import { reportsRepo, windowForPeriod } from "./reports";
import type { DateWindow } from "./reports";
import { backupRepo } from "./backup";
import { exportRepo } from "./export";
import { customerRepo } from "./customers";
import { saleRepo } from "./sales";

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
  // Finance must be cleaned before farms (FK: finance_* → farms).
  // Order within finance matters: transactions reference accounts and
  // categories, so delete transactions first, then categories, then accounts.
  await db.runAsync(
    `DELETE FROM finance_transactions
       WHERE farm_id IN (SELECT id FROM farms WHERE name LIKE ?)`,
    [`${TEST_PREFIX}%`],
  );
  await db.runAsync(`DELETE FROM finance_categories WHERE name LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
  await db.runAsync(`DELETE FROM finance_accounts WHERE name LIKE ?`, [
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

  // ============================================================
  // 12b. Finance module smoke test
  // ============================================================

  // 1. Cash account with 5000 opening balance
  const cashAccount = await financeAccountRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}Cash box`,
    accountType: "cash",
    openingBalance: 5000,
    currency: "KES",
  });

  // 2. Seed default categories — must be idempotent
  const seeded1 = await financeCategoryRepo.seedDefaults(ctx, farm.id);
  if (seeded1 < 10) {
    throw new Error(`expected at least 10 seed categories, got ${seeded1}`);
  }
  const seeded2 = await financeCategoryRepo.seedDefaults(ctx, farm.id);
  if (seeded2 !== 0) {
    throw new Error(
      `seedDefaults should be idempotent, got ${seeded2} on second run`,
    );
  }

  // 3. Find the "Crop sales" income category and "Seeds" expense category
  const incomeCats = await financeCategoryRepo.listByType(
    ctx,
    farm.id,
    "income",
  );
  const cropSales = incomeCats.find((c) => c.name === "Crop sales");
  if (!cropSales) throw new Error("Crop sales category missing");

  const expenseCats = await financeCategoryRepo.listByType(
    ctx,
    farm.id,
    "expense",
  );
  const seedsCat = expenseCats.find((c) => c.name === "Seeds");
  if (!seedsCat) throw new Error("Seeds category missing");

  // 4. Income: sold 8000 KES of maize, tagged to the plot
  await financeTransactionRepo.create(ctx, {
    farmId: farm.id,
    accountId: cashAccount.id,
    categoryId: cropSales.id,
    transactionType: "income",
    transactionDate: "2026-04-15T00:00:00.000Z",
    amount: 8000,
    currency: "KES",
    description: `${TEST_PREFIX}maize sale`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });

  // 5. Expense: bought 2000 KES of seeds, tagged to the same plot
  await financeTransactionRepo.create(ctx, {
    farmId: farm.id,
    accountId: cashAccount.id,
    categoryId: seedsCat.id,
    transactionType: "expense",
    transactionDate: "2026-04-05T00:00:00.000Z",
    amount: 2000,
    currency: "KES",
    description: `${TEST_PREFIX}seed purchase`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });

  // 6. Balance check: 5000 + 8000 - 2000 = 11000
  const balance = await financeAccountRepo.getBalance(ctx, cashAccount.id);
  if (balance !== 11000) {
    throw new Error(`expected balance 11000, got ${balance}`);
  }

  // 7. Second account for transfer test
  const bankAccount = await financeAccountRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}Bank`,
    accountType: "bank",
    openingBalance: 0,
    currency: "KES",
  });

  // 8. Transfer 3000 from cash to bank
  await financeTransactionRepo.create(ctx, {
    farmId: farm.id,
    accountId: cashAccount.id,
    transferAccountId: bankAccount.id,
    transactionType: "transfer",
    transactionDate: "2026-04-16T00:00:00.000Z",
    amount: 3000,
    currency: "KES",
    description: `${TEST_PREFIX}cash to bank`,
  });

  const cashAfter = await financeAccountRepo.getBalance(ctx, cashAccount.id);
  if (cashAfter !== 8000) {
    throw new Error(`expected cash 8000 after transfer, got ${cashAfter}`);
  }

  const bankAfter = await financeAccountRepo.getBalance(ctx, bankAccount.id);
  if (bankAfter !== 3000) {
    throw new Error(`expected bank 3000 after transfer, got ${bankAfter}`);
  }

  // 9. Balances for the whole farm in one query
  const allBalances = await financeAccountRepo.getBalances(ctx, farm.id);
  if (allBalances.length !== 2) {
    throw new Error(`expected 2 balances, got ${allBalances.length}`);
  }
  const cashBalance = allBalances.find((b) => b.accountId === cashAccount.id);
  if (!cashBalance || cashBalance.balance !== 8000) {
    throw new Error(
      `expected 8000 cash from getBalances, got ${cashBalance?.balance ?? "missing"}`,
    );
  }

  // 10. Totals by category for April
  const incomeTotals = await financeTransactionRepo.totalsByCategory(
    ctx,
    farm.id,
    "income",
    "2026-04-01T00:00:00.000Z",
    "2026-04-30T23:59:59.999Z",
  );
  if (incomeTotals.length !== 1 || incomeTotals[0].total !== 8000) {
    throw new Error(
      `expected one income category totaling 8000, got ${JSON.stringify(incomeTotals)}`,
    );
  }

  // 11. Totals by target — the profit-per-plot primitive
  const targetTotals = await financeTransactionRepo.totalsByTarget(
    ctx,
    farm.id,
    "2026-04-01T00:00:00.000Z",
    "2026-04-30T23:59:59.999Z",
  );
  const plotTotal = targetTotals.find(
    (t) => t.targetType === "plot" && t.targetId === plot.id,
  );
  if (!plotTotal) throw new Error("plot target total missing");
  if (
    plotTotal.income !== 8000 ||
    plotTotal.expense !== 2000 ||
    plotTotal.net !== 6000
  ) {
    throw new Error(
      `expected plot income/expense/net 8000/2000/6000, got ${plotTotal.income}/${plotTotal.expense}/${plotTotal.net}`,
    );
  }

  // 12. Validation: transfer without a destination is rejected
  let rejectedTransfer = false;
  try {
    await financeTransactionRepo.create(ctx, {
      farmId: farm.id,
      accountId: cashAccount.id,
      transactionType: "transfer",
      transactionDate: "2026-04-17T00:00:00.000Z",
      amount: 100,
    });
  } catch {
    rejectedTransfer = true;
  }
  if (!rejectedTransfer) {
    throw new Error("transfer without destination should have been rejected");
  }

  // 13. Validation: same-account transfer is rejected
  let rejectedSameAccount = false;
  try {
    await financeTransactionRepo.create(ctx, {
      farmId: farm.id,
      accountId: cashAccount.id,
      transferAccountId: cashAccount.id,
      transactionType: "transfer",
      transactionDate: "2026-04-17T00:00:00.000Z",
      amount: 100,
    });
  } catch {
    rejectedSameAccount = true;
  }
  if (!rejectedSameAccount) {
    throw new Error("transfer to same account should have been rejected");
  }

  // 14. Validation: negative amount is rejected
  let rejectedNegative = false;
  try {
    await financeTransactionRepo.create(ctx, {
      farmId: farm.id,
      accountId: cashAccount.id,
      transactionType: "expense",
      transactionDate: "2026-04-17T00:00:00.000Z",
      amount: -500,
    });
  } catch {
    rejectedNegative = true;
  }
  if (!rejectedNegative) {
    throw new Error("negative amount should have been rejected");
  }

  // 15. Soft-delete an income, balance drops accordingly
  const lastIncome = await financeTransactionRepo.listByCategory(
    ctx,
    cropSales.id,
  );
  if (lastIncome.length !== 1) {
    throw new Error(`expected 1 income row, got ${lastIncome.length}`);
  }
  await financeTransactionRepo.softDelete(ctx, lastIncome[0].id);
  const balanceAfterDelete = await financeAccountRepo.getBalance(
    ctx,
    cashAccount.id,
  );
  if (balanceAfterDelete !== 0) {
    throw new Error(
      `expected 0 balance after removing income, got ${balanceAfterDelete}`,
    );
  }

  // 16. Restore the income, balance returns
  await financeTransactionRepo.restore(ctx, lastIncome[0].id);
  const balanceAfterRestore = await financeAccountRepo.getBalance(
    ctx,
    cashAccount.id,
  );
  if (balanceAfterRestore !== 8000) {
    throw new Error(
      `expected 8000 after restoring income, got ${balanceAfterRestore}`,
    );
  }

  // 17. Category seeding stayed idempotent across a third call
  const seeded3 = await financeCategoryRepo.seedDefaults(ctx, farm.id);
  if (seeded3 !== 0) {
    throw new Error(`seedDefaults should stay idempotent, got ${seeded3}`);
  }

  // ============================================================
  // 12c. Reports module smoke test
  // ============================================================

  // Fresh farm + accounts so 12b's April transactions cannot leak into
  // report totals. All numbers below are computed against this isolated set.
  const reportFarm = await farmRepo.create(ctx, {
    name: `${TEST_PREFIX}report farm`,
    size: 3,
    farmType: "crops",
  });
  await farmRepo.update(ctx, reportFarm.id, { isActive: false });

  const reportCash = await financeAccountRepo.create(ctx, {
    farmId: reportFarm.id,
    name: `${TEST_PREFIX}report cash`,
    accountType: "cash",
    openingBalance: 0,
    currency: "KES",
  });

  const reportBank = await financeAccountRepo.create(ctx, {
    farmId: reportFarm.id,
    name: `${TEST_PREFIX}report bank`,
    accountType: "bank",
    openingBalance: 0,
    currency: "KES",
  });

  const reportCat = await financeCategoryRepo.create(ctx, {
    farmId: reportFarm.id,
    name: `${TEST_PREFIX}report income`,
    categoryType: "income",
  });

  const reportWindow: DateWindow = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-12-31T23:59:59.999Z",
  };

  // Six income/expense transactions plus one transfer.
  //   Jan 15  income  10,000  (target=plot)
  //   Feb 20  expense  4,000  (target=plot)
  //   Mar 10  income   6,000  (no target)
  //   Mar 15  transfer 1,000  ← must be excluded from every summary
  //   Apr 05  expense  1,500  (target=plot)
  //   May 12  income   2,500  (target=plot)
  //   Jun 30  expense  3,000  (no target)
  //
  // Expected totals:
  //   period:  income 18,500 · expense 8,500 · net 10,000
  //   plot:    income 12,500 · expense 5,500 · net  7,000
  //   monthly: six points, Jan through Jun
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    categoryId: reportCat.id,
    transactionType: "income",
    transactionDate: "2026-01-15T00:00:00.000Z",
    amount: 10000,
    currency: "KES",
    description: `${TEST_PREFIX}report jan income`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    transactionType: "expense",
    transactionDate: "2026-02-20T00:00:00.000Z",
    amount: 4000,
    currency: "KES",
    description: `${TEST_PREFIX}report feb expense`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    categoryId: reportCat.id,
    transactionType: "income",
    transactionDate: "2026-03-10T00:00:00.000Z",
    amount: 6000,
    currency: "KES",
    description: `${TEST_PREFIX}report mar income`,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    transferAccountId: reportBank.id,
    transactionType: "transfer",
    transactionDate: "2026-03-15T00:00:00.000Z",
    amount: 1000,
    currency: "KES",
    description: `${TEST_PREFIX}report transfer`,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    transactionType: "expense",
    transactionDate: "2026-04-05T00:00:00.000Z",
    amount: 1500,
    currency: "KES",
    description: `${TEST_PREFIX}report apr expense`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    categoryId: reportCat.id,
    transactionType: "income",
    transactionDate: "2026-05-12T00:00:00.000Z",
    amount: 2500,
    currency: "KES",
    description: `${TEST_PREFIX}report may income`,
    targetType: "plot",
    targetId: plot.id,
    targetLabel: plot.name,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    transactionType: "expense",
    transactionDate: "2026-06-30T00:00:00.000Z",
    amount: 3000,
    currency: "KES",
    description: `${TEST_PREFIX}report jun expense`,
  });

  // --- getPeriodSummary: transfers must be excluded
  const summary = await reportsRepo.getPeriodSummary(
    ctx,
    reportFarm.id,
    reportWindow,
  );
  if (
    summary.income !== 18500 ||
    summary.expense !== 8500 ||
    summary.net !== 10000
  ) {
    throw new Error(
      `expected summary 18500/8500/10000, got ${summary.income}/${summary.expense}/${summary.net}`,
    );
  }

  // --- getProfitByTarget: only transactions with target_type='plot' counted
  const profits = await reportsRepo.getProfitByTarget(
    ctx,
    reportFarm.id,
    "plot",
    reportWindow,
  );
  if (profits.length !== 1) {
    throw new Error(`expected 1 plot profit row, got ${profits.length}`);
  }
  const plotProfit = profits[0];
  if (
    plotProfit.income !== 12500 ||
    plotProfit.expense !== 5500 ||
    plotProfit.net !== 7000
  ) {
    throw new Error(
      `expected plot profit 12500/5500/7000, got ${plotProfit.income}/${plotProfit.expense}/${plotProfit.net}`,
    );
  }

  // --- getMonthlySeries: one point per calendar month present
  const monthly = await reportsRepo.getMonthlySeries(
    ctx,
    reportFarm.id,
    reportWindow,
  );
  if (monthly.length !== 6) {
    throw new Error(`expected 6 monthly points, got ${monthly.length}`);
  }
  const expectedMonths = [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
  ];
  const actualMonths = monthly.map((p) => p.month);
  if (JSON.stringify(actualMonths) !== JSON.stringify(expectedMonths)) {
    throw new Error(
      `expected months ${expectedMonths.join(",")}, got ${actualMonths.join(",")}`,
    );
  }
  const jan = monthly.find((p) => p.month === "2026-01");
  if (!jan || jan.income !== 10000 || jan.expense !== 0 || jan.net !== 10000) {
    throw new Error(`expected Jan 10000/0/10000, got ${JSON.stringify(jan)}`);
  }
  const mar = monthly.find((p) => p.month === "2026-03");
  if (!mar || mar.income !== 6000 || mar.expense !== 0 || mar.net !== 6000) {
    throw new Error(
      `expected Mar 6000/0/6000 (transfer excluded), got ${JSON.stringify(mar)}`,
    );
  }

  // --- getForecast: a future-dated transaction must surface
  const futureDate = new Date();
  futureDate.setUTCMonth(futureDate.getUTCMonth() + 2);
  futureDate.setUTCDate(15);
  futureDate.setUTCHours(0, 0, 0, 0);
  const futureIso = futureDate.toISOString();
  const futureMonthKey = futureIso.slice(0, 7);

  await financeTransactionRepo.create(ctx, {
    farmId: reportFarm.id,
    accountId: reportCash.id,
    categoryId: reportCat.id,
    transactionType: "income",
    transactionDate: futureIso,
    amount: 5000,
    currency: "KES",
    description: `${TEST_PREFIX}report future income`,
  });

  const forecast = await reportsRepo.getForecast(ctx, reportFarm.id, 12);
  const forecastPoint = forecast.find((p) => p.month === futureMonthKey);
  if (!forecastPoint || forecastPoint.income !== 5000) {
    throw new Error(
      `expected forecast ${futureMonthKey} income 5000, got ${JSON.stringify(forecastPoint ?? null)}`,
    );
  }

  // --- windowForPeriod: this_year must start with the current UTC year
  const tw = windowForPeriod("this_year");
  const currentYear = String(new Date().getUTCFullYear());
  if (!tw.from.startsWith(currentYear)) {
    throw new Error(
      `windowForPeriod(this_year).from should start with ${currentYear}, got ${tw.from}`,
    );
  }

  // --- windowForPeriod: this_month must enclose a plausible "now"
  const tm = windowForPeriod("this_month");
  const nowCheck = new Date().toISOString();
  if (!(tm.from <= nowCheck && tm.to >= nowCheck)) {
    throw new Error(
      `this_month window ${tm.from}..${tm.to} does not enclose now`,
    );
  }

  // ============================================================
  // 12d. Economics reports (cost-per-unit) smoke test
  // ============================================================

  // Fresh farm so 12c's transactions cannot leak into these numbers.
  const econFarm = await farmRepo.create(ctx, {
    name: `${TEST_PREFIX}econ farm`,
    size: 3,
    farmType: "mixed",
  });
  await farmRepo.update(ctx, econFarm.id, { isActive: false });

  const econAccount = await financeAccountRepo.create(ctx, {
    farmId: econFarm.id,
    name: `${TEST_PREFIX}econ cash`,
    accountType: "cash",
    openingBalance: 0,
    currency: "KES",
  });

  // ---- Crop cycle economics -------------------------------------------------

  const econPlot = await plotRepo.create(ctx, {
    farmId: econFarm.id,
    name: `${TEST_PREFIX}econ plot`,
    size: 2,
  });
  const econCrop = await cropRepo.create(ctx, {
    farmId: econFarm.id,
    name: `${TEST_PREFIX}econ maize`,
    category: "cereal",
  });
  const econCycle = await cropCycleRepo.create(ctx, {
    farmId: econFarm.id,
    plotId: econPlot.id,
    cropId: econCrop.id,
    plantingDate: "2026-01-01T00:00:00.000Z",
    status: "harvested",
  });

  // Two expenses totalling 15,000 KES, both tagged to the cycle.
  await financeTransactionRepo.create(ctx, {
    farmId: econFarm.id,
    accountId: econAccount.id,
    transactionType: "expense",
    transactionDate: "2026-03-01T00:00:00.000Z",
    amount: 10000,
    currency: "KES",
    description: `${TEST_PREFIX}econ seed cost`,
    targetType: "crop_cycle",
    targetId: econCycle.id,
    targetLabel: `${TEST_PREFIX}econ cycle`,
  });
  await financeTransactionRepo.create(ctx, {
    farmId: econFarm.id,
    accountId: econAccount.id,
    transactionType: "expense",
    transactionDate: "2026-04-01T00:00:00.000Z",
    amount: 5000,
    currency: "KES",
    description: `${TEST_PREFIX}econ fertilizer cost`,
    targetType: "crop_cycle",
    targetId: econCycle.id,
    targetLabel: `${TEST_PREFIX}econ cycle`,
  });

  // Two harvests, both in kg → 500 kg total, single unit.
  //   15000 / 500 = 30 KES per kg
  await cropActivityRepo.create(ctx, {
    farmId: econFarm.id,
    cycleId: econCycle.id,
    activityType: "harvest",
    activityDate: "2026-06-01T00:00:00.000Z",
    description: `${TEST_PREFIX}econ harvest 1`,
    quantity: 300,
    quantityUnit: "kg",
  });
  await cropActivityRepo.create(ctx, {
    farmId: econFarm.id,
    cycleId: econCycle.id,
    activityType: "harvest",
    activityDate: "2026-06-15T00:00:00.000Z",
    description: `${TEST_PREFIX}econ harvest 2`,
    quantity: 200,
    quantityUnit: "kg",
  });

  const econWindow: DateWindow = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-12-31T23:59:59.999Z",
  };

  const cycleEcon = await reportsRepo.getCycleEconomics(
    ctx,
    econFarm.id,
    econCycle.id,
    econWindow,
  );
  if (cycleEcon.cost !== 15000) {
    throw new Error(`expected cycle cost 15000, got ${cycleEcon.cost}`);
  }
  if (cycleEcon.yieldQty !== 500) {
    throw new Error(`expected yield 500, got ${cycleEcon.yieldQty}`);
  }
  if (cycleEcon.yieldUnit !== "kg") {
    throw new Error(`expected yieldUnit 'kg', got ${cycleEcon.yieldUnit}`);
  }
  if (cycleEcon.yieldUnitsMixed) {
    throw new Error("expected single unit, got mixed");
  }
  if (cycleEcon.costPerUnit !== 30) {
    throw new Error(`expected costPerUnit 30, got ${cycleEcon.costPerUnit}`);
  }

  // Add a harvest recorded in tonnes → mixed units → costPerUnit must
  // become null rather than silently producing a meaningless average.
  await cropActivityRepo.create(ctx, {
    farmId: econFarm.id,
    cycleId: econCycle.id,
    activityType: "harvest",
    activityDate: "2026-06-20T00:00:00.000Z",
    description: `${TEST_PREFIX}econ harvest mixed`,
    quantity: 1,
    quantityUnit: "tonnes",
  });

  const cycleEconMixed = await reportsRepo.getCycleEconomics(
    ctx,
    econFarm.id,
    econCycle.id,
    econWindow,
  );
  if (!cycleEconMixed.yieldUnitsMixed) {
    throw new Error("expected mixed units after adding a tonnes harvest");
  }
  if (cycleEconMixed.costPerUnit !== null) {
    throw new Error(
      `expected null costPerUnit on mixed units, got ${cycleEconMixed.costPerUnit}`,
    );
  }

  // ---- Animal economics -----------------------------------------------------

  const econHerd = await herdRepo.create(ctx, {
    farmId: econFarm.id,
    name: `${TEST_PREFIX}econ herd`,
    species: "cattle",
    purpose: "dairy",
  });
  const econCow = await animalRepo.create(ctx, {
    farmId: econFarm.id,
    herdId: econHerd.id,
    tagId: `${TEST_PREFIX}ECON-COW`,
    sex: "female",
    status: "alive",
  });

  // Two milk records, both in litres → 100 L total.
  //   8000 / 100 = 80 KES per litre
  await animalProductionRepo.create(ctx, {
    farmId: econFarm.id,
    animalId: econCow.id,
    recordDate: "2026-05-01T00:00:00.000Z",
    productionType: "milk",
    quantity: 60,
    quantityUnit: "L",
    notes: `${TEST_PREFIX}econ milk 1`,
  });
  await animalProductionRepo.create(ctx, {
    farmId: econFarm.id,
    animalId: econCow.id,
    recordDate: "2026-05-02T00:00:00.000Z",
    productionType: "milk",
    quantity: 40,
    quantityUnit: "L",
    notes: `${TEST_PREFIX}econ milk 2`,
  });

  await financeTransactionRepo.create(ctx, {
    farmId: econFarm.id,
    accountId: econAccount.id,
    transactionType: "expense",
    transactionDate: "2026-05-10T00:00:00.000Z",
    amount: 8000,
    currency: "KES",
    description: `${TEST_PREFIX}econ cow costs`,
    targetType: "animal",
    targetId: econCow.id,
    targetLabel: econCow.tagId,
  });

  const animalEcon = await reportsRepo.getAnimalEconomics(
    ctx,
    econFarm.id,
    econCow.id,
    "milk",
    econWindow,
  );
  if (animalEcon.cost !== 8000) {
    throw new Error(`expected animal cost 8000, got ${animalEcon.cost}`);
  }
  if (animalEcon.yieldQty !== 100) {
    throw new Error(`expected milk yield 100, got ${animalEcon.yieldQty}`);
  }
  if (animalEcon.yieldUnit !== "L") {
    throw new Error(`expected yieldUnit 'L', got ${animalEcon.yieldUnit}`);
  }
  if (animalEcon.costPerUnit !== 80) {
    throw new Error(
      `expected animal costPerUnit 80, got ${animalEcon.costPerUnit}`,
    );
  }

  // ============================================================
  // 12e. Backup smoke test
  // ============================================================

  // Snapshot current backups before creating a new one — prior dev runs
  // may have left orphan files, and we want to verify the delta.
  const backupsBefore = await backupRepo.listBackups();

  const createdBackup = await backupRepo.createBackup(ctx);
  if (!createdBackup.uri) {
    throw new Error("backup has no uri");
  }
  if (createdBackup.size < 100) {
    throw new Error(`backup file too small: ${createdBackup.size} bytes`);
  }

  const backupsAfter = await backupRepo.listBackups();
  if (backupsAfter.length !== backupsBefore.length + 1) {
    throw new Error(
      `expected backups to grow by 1, got ${backupsBefore.length} → ${backupsAfter.length}`,
    );
  }
  if (backupsAfter[0].uri !== createdBackup.uri) {
    throw new Error("newest backup should sort first");
  }

  const validation = await backupRepo.validateBackup(createdBackup.uri);
  if (!validation.ok) {
    throw new Error(`backup validation failed: ${validation.reason}`);
  }
  if (validation.userVersion <= 0) {
    throw new Error(`expected user_version > 0, got ${validation.userVersion}`);
  }

  await backupRepo.deleteBackup(createdBackup.uri);
  const backupsAfterDelete = await backupRepo.listBackups();
  if (backupsAfterDelete.length !== backupsBefore.length) {
    throw new Error(
      `expected backups back to ${backupsBefore.length}, got ${backupsAfterDelete.length}`,
    );
  }

  // ============================================================
  // 12f. CSV export smoke test
  // ============================================================

  // Reuse econFarm — it already has a plot, an animal, transactions,
  // and production records. No need to build another fixture.
  const exportWindow: DateWindow = {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-12-31T23:59:59.999Z",
  };

  // --- Transactions CSV: header + at least 3 rows (2 cycle expenses + 1 cow)
  const txnCsv = await exportRepo.exportTransactionsCsv(
    ctx,
    econFarm.id,
    exportWindow,
  );
  const txnLines = txnCsv.split("\r\n");
  if (txnLines.length < 4) {
    throw new Error(
      `expected at least 4 CSV lines (header + 3 rows), got ${txnLines.length}`,
    );
  }
  if (!txnLines[0].startsWith("Date,Type,Amount,Currency")) {
    throw new Error(`unexpected transactions header: ${txnLines[0]}`);
  }
  // Description containing a comma must be quoted.
  // "econ seed cost" has no comma; make sure plain values stay unquoted
  // and verify the format by finding our known amount.
  const hasSeedCost = txnCsv.indexOf("econ seed cost") !== -1;
  if (!hasSeedCost) {
    throw new Error("transactions CSV missing econ seed cost row");
  }
  const has15000 = txnCsv.indexOf("10000.00") !== -1;
  if (!has15000) {
    throw new Error("transactions CSV missing 10000.00 formatted amount");
  }

  // --- CSV escaping edge case: insert a transaction whose description
  // contains a comma, a double quote, and a newline. Then confirm all
  // three are correctly escaped in the output.
  const trickyCat = await financeCategoryRepo.create(ctx, {
    farmId: econFarm.id,
    name: `${TEST_PREFIX}tricky cat`,
    categoryType: "expense",
  });
  await financeTransactionRepo.create(ctx, {
    farmId: econFarm.id,
    accountId: econAccount.id,
    categoryId: trickyCat.id,
    transactionType: "expense",
    transactionDate: "2026-07-01T00:00:00.000Z",
    amount: 123.45,
    currency: "KES",
    description: `${TEST_PREFIX}has,comma"and"quote\nand newline`,
  });

  const txnCsv2 = await exportRepo.exportTransactionsCsv(
    ctx,
    econFarm.id,
    exportWindow,
  );
  // The description must be wrapped in quotes with internal quotes doubled.
  const escapedNeedle = 'has,comma""and""quote\nand newline';
  if (txnCsv2.indexOf(escapedNeedle) === -1) {
    throw new Error(
      "CSV escaping failed: expected doubled quotes and preserved newline",
    );
  }
  // That same description must also be wrapped in outer quotes.
  if (txnCsv2.indexOf(`"${escapedNeedle}"`) === -1) {
    throw new Error("CSV escaping failed: field not wrapped in outer quotes");
  }

  // --- Plot profit CSV: header + at least one plot row
  const profitCsv = await exportRepo.exportPlotProfitCsv(
    ctx,
    econFarm.id,
    exportWindow,
  );
  const profitLines = profitCsv.split("\r\n");
  if (profitLines[0] !== "Plot,Income,Expense,Net") {
    throw new Error(`unexpected plot profit header: ${profitLines[0]}`);
  }
  if (profitLines.length < 2) {
    throw new Error(
      `expected at least one plot row, got ${profitLines.length} lines`,
    );
  }
  // The econ plot has no income/expense tagged with target_type='plot',
  // so its row will not appear here. The report only lists targets that
  // have at least one matching transaction. This is correct behavior.

  // --- Animal production CSV: header + at least 2 milk rows
  const prodCsv = await exportRepo.exportAnimalProductionCsv(
    ctx,
    econFarm.id,
    exportWindow,
  );
  const prodLines = prodCsv.split("\r\n");
  if (
    prodLines[0] !==
    "Date,Animal Tag,Animal Name,Herd,Production Type,Quantity,Unit,Quality,Weight (kg),Notes"
  ) {
    throw new Error(`unexpected production header: ${prodLines[0]}`);
  }
  if (prodLines.length < 3) {
    throw new Error(
      `expected at least 3 CSV lines (header + 2 milk rows), got ${prodLines.length}`,
    );
  }
  const cowTagNeedle = `${TEST_PREFIX}ECON-COW`;
  if (prodCsv.indexOf(cowTagNeedle) === -1) {
    throw new Error("production CSV missing cow tag");
  }
  if (prodCsv.indexOf(",milk,") === -1) {
    throw new Error("production CSV missing milk production type");
  }

  // ============================================================
  // 12g. Sales module smoke test
  // ============================================================

  const salesFarm = await farmRepo.create(ctx, {
    name: `${TEST_PREFIX}sales farm`,
    size: 3,
    farmType: "mixed",
  });
  await farmRepo.update(ctx, salesFarm.id, { isActive: false });

  // --- Customers -------------------------------------------------

  const customerA = await customerRepo.create(ctx, {
    farmId: salesFarm.id,
    name: `${TEST_PREFIX}Mama Njeri`,
    phone: "+254700000001",
  });
  if (!customerA.isActive) {
    throw new Error("new customer should be active");
  }

  const customerB = await customerRepo.create(ctx, {
    farmId: salesFarm.id,
    name: `${TEST_PREFIX}Karanja Stores`,
  });
  if (customerB.name !== `${TEST_PREFIX}Karanja Stores`) {
    throw new Error("customerB name not persisted");
  }

  const customersList = await customerRepo.listByFarm(ctx, salesFarm.id);
  if (customersList.length !== 2) {
    throw new Error(`expected 2 customers, got ${customersList.length}`);
  }

  const updatedCustomer = await customerRepo.update(ctx, customerA.id, {
    notes: `${TEST_PREFIX}prefers SMS`,
  });
  if (updatedCustomer.notes !== `${TEST_PREFIX}prefers SMS`) {
    throw new Error("customer update did not persist notes");
  }

  let rejectedEmptyName = false;
  try {
    await customerRepo.create(ctx, {
      farmId: salesFarm.id,
      name: "   ",
    });
  } catch {
    rejectedEmptyName = true;
  }
  if (!rejectedEmptyName) {
    throw new Error("customer with blank name should be rejected");
  }

  // --- Sales: create with items ----------------------------------

  const sale1 = await saleRepo.create(ctx, {
    farmId: salesFarm.id,
    customerId: customerA.id,
    saleDate: "2026-05-01T00:00:00.000Z",
    dueDate: "2026-05-15T00:00:00.000Z",
    reference: `${TEST_PREFIX}INV-001`,
    items: [
      {
        description: `${TEST_PREFIX}Maize 90kg bag`,
        quantity: 5,
        unit: "bag",
        unitPrice: 3500,
      },
      {
        description: `${TEST_PREFIX}Milk 1L`,
        quantity: 10,
        unit: "L",
        unitPrice: 60,
      },
    ],
  });

  // 5 * 3500 = 17500; 10 * 60 = 600; total = 18100
  if (sale1.total !== 18100) {
    throw new Error(`expected sale total 18100, got ${sale1.total}`);
  }
  if (sale1.status !== "draft") {
    throw new Error(`expected initial status draft, got ${sale1.status}`);
  }
  if (sale1.amountPaid !== 0) {
    throw new Error(`expected amountPaid 0, got ${sale1.amountPaid}`);
  }

  const sale1Items = await saleRepo.listItems(ctx, sale1.id);
  if (sale1Items.length !== 2) {
    throw new Error(`expected 2 sale items, got ${sale1Items.length}`);
  }
  const maizeLine = sale1Items.find((i) =>
    i.description.endsWith("Maize 90kg bag"),
  );
  if (!maizeLine || maizeLine.lineTotal !== 17500) {
    throw new Error(
      `expected maize line 17500, got ${maizeLine?.lineTotal ?? "missing"}`,
    );
  }

  // --- Sales: update status and payment --------------------------

  const paidSale = await saleRepo.update(ctx, sale1.id, {
    status: "paid",
    amountPaid: 18100,
  });
  if (paidSale.status !== "paid" || paidSale.amountPaid !== 18100) {
    throw new Error("sale update to paid did not persist");
  }

  // --- Sales: replace items --------------------------------------

  const repricedSale = await saleRepo.update(ctx, sale1.id, {
    items: [
      {
        description: `${TEST_PREFIX}Maize 90kg bag`,
        quantity: 5,
        unit: "bag",
        unitPrice: 4000,
      },
    ],
  });
  // 5 * 4000 = 20000
  if (repricedSale.total !== 20000) {
    throw new Error(`expected repriced total 20000, got ${repricedSale.total}`);
  }
  const repricedItems = await saleRepo.listItems(ctx, sale1.id);
  if (repricedItems.length !== 1) {
    throw new Error(
      `expected 1 item after replace, got ${repricedItems.length}`,
    );
  }

  // --- Sales: listByCustomer -------------------------------------

  const customerSales = await saleRepo.listByCustomer(ctx, customerA.id);
  if (customerSales.length !== 1) {
    throw new Error(
      `expected 1 sale for customer, got ${customerSales.length}`,
    );
  }

  // --- Validation: negative quantity is rejected -----------------

  let rejectedNegativeQty = false;
  try {
    await saleRepo.create(ctx, {
      farmId: salesFarm.id,
      saleDate: "2026-05-02T00:00:00.000Z",
      items: [
        {
          description: `${TEST_PREFIX}bad qty`,
          quantity: -1,
          unitPrice: 100,
        },
      ],
    });
  } catch {
    rejectedNegativeQty = true;
  }
  if (!rejectedNegativeQty) {
    throw new Error("negative sale item quantity should be rejected");
  }

  // --- Soft delete cascades to items -----------------------------

  const sale2 = await saleRepo.create(ctx, {
    farmId: salesFarm.id,
    saleDate: "2026-05-03T00:00:00.000Z",
    items: [
      {
        description: `${TEST_PREFIX}for deletion`,
        quantity: 1,
        unitPrice: 999,
      },
    ],
  });

  await saleRepo.softDelete(ctx, sale2.id);
  const afterDelete = await saleRepo.getById(ctx, sale2.id);
  if (afterDelete !== null) {
    throw new Error("sale should be hidden after soft delete");
  }
  const itemsAfterDelete = await saleRepo.listItems(ctx, sale2.id);
  if (itemsAfterDelete.length !== 0) {
    throw new Error(
      `expected 0 items after cascade delete, got ${itemsAfterDelete.length}`,
    );
  }

  // --- Restore brings back sale and its cascaded items -----------

  await saleRepo.restore(ctx, sale2.id);
  const afterRestore = await saleRepo.getById(ctx, sale2.id);
  if (!afterRestore) {
    throw new Error("sale should be restorable");
  }
  const itemsAfterRestore = await saleRepo.listItems(ctx, sale2.id);
  if (itemsAfterRestore.length !== 1) {
    throw new Error(
      `expected 1 item restored, got ${itemsAfterRestore.length}`,
    );
  }

  // --- countByFarm reflects live sales ---------------------------

  const saleCount = await saleRepo.countByFarm(ctx, salesFarm.id);
  if (saleCount !== 2) {
    throw new Error(`expected 2 live sales, got ${saleCount}`);
  }

  // 13. Cleanup
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
