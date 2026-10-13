/**
 * Runtime verification of the data layer.
 *
 * Runs in __DEV__ only. Creates a temporary farm + user + plot, exercises
 * every CRUD path, then hard-deletes the test rows via raw SQL (the app
 * code cannot do a hard delete — this file is the one exception, dev-only).
 *
 * The test farm is created and immediately set to is_active=0 so that a
 * concurrently-running AppStateProvider query for the active farm can
 * never pick it up.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { getDb } from "./client";
import { farmRepo } from "./farms";
import { plotRepo } from "./plots";
import { userRepo } from "./users";
import { settingsRepo } from "./settings";
import type { RepoContext } from "./repository";

const TEST_PREFIX = "__smoke__";

const cleanPriorRuns = async (db: SQLiteDatabase): Promise<void> => {
  await db.runAsync(`DELETE FROM audit_log WHERE entity_id LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
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
  // Deactivate so AppStateProvider can never pick this up as active.
  await farmRepo.update(ctx, farm.id, { isActive: false });

  const updatedFarm = await farmRepo.update(ctx, farm.id, {
    name: `${TEST_PREFIX}farm-updated`,
    size: 7,
  });
  if (updatedFarm.size !== 7)
    throw new Error("farm.update did not persist size");

  await farmRepo.softDelete(ctx, farm.id);
  const afterFarmDelete = await farmRepo.getById(ctx, farm.id);
  if (afterFarmDelete !== null)
    throw new Error("farm.softDelete did not hide row");

  await farmRepo.restore(ctx, farm.id);
  const afterFarmRestore = await farmRepo.getById(ctx, farm.id);
  if (!afterFarmRestore) throw new Error("farm.restore did not bring row back");

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

  const updatedPlot = await plotRepo.update(ctx, plot.id, {
    name: `${TEST_PREFIX}plot-updated`,
    size: 3,
    soilPh: 6.8,
  });
  if (updatedPlot.size !== 3)
    throw new Error("plot.update did not persist size");
  if (updatedPlot.soilPh !== 6.8) {
    throw new Error("plot.update did not persist soilPh");
  }
  if (updatedPlot.version !== 2)
    throw new Error("plot.update did not bump version");

  await plotRepo.softDelete(ctx, plot.id);
  const afterPlotDelete = await plotRepo.getById(ctx, plot.id);
  if (afterPlotDelete !== null)
    throw new Error("plot.softDelete did not hide row");

  const countAfterDelete = await plotRepo.countByFarm(ctx, farm.id);
  if (countAfterDelete !== 0) {
    throw new Error(`expected 0 plots after delete, got ${countAfterDelete}`);
  }

  await plotRepo.restore(ctx, plot.id);
  const afterPlotRestore = await plotRepo.getById(ctx, plot.id);
  if (!afterPlotRestore) throw new Error("plot.restore did not bring row back");

  // 3. User lifecycle + PIN --------------------------------------------------
  const user = await userRepo.create(ctx, {
    name: `${TEST_PREFIX}user`,
    role: "owner",
    pin: "1234",
  });
  const pinOk = await userRepo.verifyPin(ctx, user.id, "1234");
  if (!pinOk) throw new Error("userRepo.verifyPin failed for correct PIN");
  const pinBad = await userRepo.verifyPin(ctx, user.id, "0000");
  if (pinBad) throw new Error("userRepo.verifyPin accepted wrong PIN");

  // 4. Settings --------------------------------------------------------------
  await settingsRepo.set(ctx, `${TEST_PREFIX}flag`, { a: 1, b: "x" });
  const flag = await settingsRepo.get<{ a: number; b: string }>(
    ctx,
    `${TEST_PREFIX}flag`,
  );
  if (!flag || flag.a !== 1 || flag.b !== "x") {
    throw new Error("settingsRepo round-trip failed");
  }
  await settingsRepo.remove(ctx, `${TEST_PREFIX}flag`);

  // 5. Audit log -------------------------------------------------------------
  const farmAudit = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [farm.id],
  );
  if (!farmAudit || farmAudit.count < 5) {
    throw new Error(
      `expected >= 5 audit rows for farm, got ${farmAudit?.count ?? 0}`,
    );
  }

  const plotAudit = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [plot.id],
  );
  if (!plotAudit || plotAudit.count < 4) {
    throw new Error(
      `expected >= 4 audit rows for plot, got ${plotAudit?.count ?? 0}`,
    );
  }

  // 6. Cleanup ---------------------------------------------------------------
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
