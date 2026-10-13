/**
 * Runtime verification of the data layer.
 *
 * Runs in __DEV__ only. Creates temporary entities across every table,
 * exercises every CRUD path, then hard-deletes the test rows via raw SQL
 * (the app code cannot do a hard delete — this file is the one exception,
 * dev-only).
 *
 * The test farm is created and immediately set to is_active=0 so that a
 * concurrently-running AppStateProvider query for the active farm can
 * never pick it up.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { getDb } from "./client";
import { farmRepo } from "./farms";
import { plotRepo } from "./plots";
import { cropRepo } from "./crops";
import { cropCycleRepo } from "./cropCycles";
import { cropActivityRepo } from "./cropActivities";
import { attachmentRepo } from "./attachments";
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

  // 1. Farm lifecycle --------------------------------------------------------
  const farm = await farmRepo.create(ctx, {
    name: `${TEST_PREFIX}farm`,
    size: 5,
    sizeUnit: "acre",
    farmType: "crops",
  });
  await farmRepo.update(ctx, farm.id, { isActive: false });

  const updatedFarm = await farmRepo.update(ctx, farm.id, {
    name: `${TEST_PREFIX}farm-updated`,
    size: 7,
  });
  if (updatedFarm.size !== 7)
    throw new Error("farm.update did not persist size");

  // 2. Plot lifecycle --------------------------------------------------------
  const plot = await plotRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}plot`,
    size: 2,
    sizeUnit: "acre",
    soilType: "loam",
    soilPh: 6.5,
    fertility: "medium",
    slope: "flat",
    tenureType: "owned",
    currentUse: "crops",
  });

  const plotsInFarm = await plotRepo.listByFarm(ctx, farm.id);
  if (plotsInFarm.length !== 1) {
    throw new Error(`expected 1 plot, got ${plotsInFarm.length}`);
  }

  // 3. Crop catalog ----------------------------------------------------------
  const crop = await cropRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}maize`,
    variety: "H614D",
    category: "cereal",
    daysToHarvest: 120,
  });

  const cropsInFarm = await cropRepo.listByFarm(ctx, farm.id);
  if (cropsInFarm.length !== 1) {
    throw new Error(`expected 1 crop, got ${cropsInFarm.length}`);
  }

  const cereals = await cropRepo.listByCategory(ctx, farm.id, "cereal");
  if (cereals.length !== 1) {
    throw new Error(`expected 1 cereal, got ${cereals.length}`);
  }

  // 4. Crop cycle ------------------------------------------------------------
  const cycle = await cropCycleRepo.create(ctx, {
    farmId: farm.id,
    plotId: plot.id,
    cropId: crop.id,
    cycleName: `${TEST_PREFIX}cycle`,
    plantingDate: "2026-03-15T00:00:00.000Z",
    plantingMethod: "direct_sowing",
    expectedHarvestDate: "2026-07-15T00:00:00.000Z",
    status: "active",
    seedSource: "Local agrovet",
    seedQuantity: 25,
    seedUnit: "kg",
    expectedYield: 3000,
    expectedYieldUnit: "kg",
  });

  const cyclesByPlot = await cropCycleRepo.listByPlot(ctx, plot.id);
  if (cyclesByPlot.length !== 1) {
    throw new Error(`expected 1 cycle, got ${cyclesByPlot.length}`);
  }

  const activeCycles = await cropCycleRepo.listActiveByFarm(ctx, farm.id);
  if (activeCycles.length !== 1) {
    throw new Error(`expected 1 active cycle, got ${activeCycles.length}`);
  }

  // 5. Crop activity ---------------------------------------------------------
  const activity = await cropActivityRepo.create(ctx, {
    farmId: farm.id,
    cycleId: cycle.id,
    activityType: "fertilizer",
    activityDate: "2026-04-01T00:00:00.000Z",
    description: `${TEST_PREFIX}applied DAP`,
    quantity: 50,
    quantityUnit: "kg",
    cost: 4500,
    costCurrency: "KES",
  });

  const activitiesByCycle = await cropActivityRepo.listByCycle(ctx, cycle.id);
  if (activitiesByCycle.length !== 1) {
    throw new Error(`expected 1 activity, got ${activitiesByCycle.length}`);
  }

  const fertilizerActivities = await cropActivityRepo.listByType(
    ctx,
    farm.id,
    "fertilizer",
  );
  if (fertilizerActivities.length !== 1) {
    throw new Error(
      `expected 1 fertilizer activity, got ${fertilizerActivities.length}`,
    );
  }

  const activityCount = await cropActivityRepo.countByCycle(ctx, cycle.id);
  if (activityCount !== 1) {
    throw new Error(`expected activity count 1, got ${activityCount}`);
  }

  // 6. Attachment ------------------------------------------------------------
  const photo = await attachmentRepo.create(ctx, {
    farmId: farm.id,
    entityType: "crop_activity",
    entityId: activity.id,
    kind: "photo",
    localPath: `/tmp/${TEST_PREFIX}photo.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 245760,
    caption: `${TEST_PREFIX}leaf damage photo`,
  });

  const voice = await attachmentRepo.create(ctx, {
    farmId: farm.id,
    entityType: "crop_activity",
    entityId: activity.id,
    kind: "voice",
    localPath: `/tmp/${TEST_PREFIX}note.m4a`,
    mimeType: "audio/m4a",
    durationMs: 12300,
    caption: `${TEST_PREFIX}voice note about the plot`,
  });

  const attachments = await attachmentRepo.listByEntity(
    ctx,
    "crop_activity",
    activity.id,
  );
  if (attachments.length !== 2) {
    throw new Error(`expected 2 attachments, got ${attachments.length}`);
  }

  const photosOnly = await attachmentRepo.listByEntityAndKind(
    ctx,
    "crop_activity",
    activity.id,
    "photo",
  );
  if (photosOnly.length !== 1) {
    throw new Error(`expected 1 photo, got ${photosOnly.length}`);
  }

  if (photo.sizeBytes !== 245760) {
    throw new Error("photo attachment size did not persist");
  }
  if (voice.durationMs !== 12300) {
    throw new Error("voice attachment duration did not persist");
  }

  // 7. Soft delete + restore cascade check ----------------------------------
  await attachmentRepo.softDelete(ctx, photo.id);
  const afterPhotoDelete = await attachmentRepo.getById(ctx, photo.id);
  if (afterPhotoDelete !== null) {
    throw new Error("attachment.softDelete did not hide row");
  }
  await attachmentRepo.restore(ctx, photo.id);
  const afterPhotoRestore = await attachmentRepo.getById(ctx, photo.id);
  if (!afterPhotoRestore) {
    throw new Error("attachment.restore did not bring row back");
  }

  // 8. User lifecycle + PIN --------------------------------------------------
  const user = await userRepo.create(ctx, {
    name: `${TEST_PREFIX}user`,
    role: "owner",
    pin: "1234",
  });
  const pinOk = await userRepo.verifyPin(ctx, user.id, "1234");
  if (!pinOk) throw new Error("userRepo.verifyPin failed for correct PIN");
  const pinBad = await userRepo.verifyPin(ctx, user.id, "0000");
  if (pinBad) throw new Error("userRepo.verifyPin accepted wrong PIN");

  // 9. Settings --------------------------------------------------------------
  await settingsRepo.set(ctx, `${TEST_PREFIX}flag`, { a: 1, b: "x" });
  const flag = await settingsRepo.get<{ a: number; b: string }>(
    ctx,
    `${TEST_PREFIX}flag`,
  );
  if (!flag || flag.a !== 1 || flag.b !== "x") {
    throw new Error("settingsRepo round-trip failed");
  }
  await settingsRepo.remove(ctx, `${TEST_PREFIX}flag`);

  // 10. Audit log ------------------------------------------------------------
  const farmAudit = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [farm.id],
  );
  if (!farmAudit || farmAudit.count < 3) {
    throw new Error(
      `expected >= 3 audit rows for farm, got ${farmAudit?.count ?? 0}`,
    );
  }

  const cropAudit = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [crop.id],
  );
  if (!cropAudit || cropAudit.count < 1) {
    throw new Error(
      `expected audit row for crop, got ${cropAudit?.count ?? 0}`,
    );
  }

  const cycleAudit = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [cycle.id],
  );
  if (!cycleAudit || cycleAudit.count < 1) {
    throw new Error(
      `expected audit row for cycle, got ${cycleAudit?.count ?? 0}`,
    );
  }

  // 11. Cleanup --------------------------------------------------------------
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
