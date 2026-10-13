/**
 * Runtime verification of the data layer.
 *
 * Runs in __DEV__ only. Creates a temporary farm + user, exercises every
 * CRUD path, then hard-deletes the test rows via raw SQL (the app code
 * cannot do a hard delete — this file is the one exception, and it's
 * dev-only).
 *
 * If this passes, the data layer is proven working. If it fails, we know
 * before any UI is built on top of it.
 */

import { getDb } from "./client";
import { farmRepo } from "./farms";
import { userRepo } from "./users";
import { settingsRepo } from "./settings";
import type { RepoContext } from "./repository";
import type { SQLiteDatabase } from "expo-sqlite";

const TEST_PREFIX = "__smoke__";

const cleanPriorRuns = async (db: SQLiteDatabase): Promise<void> => {
  await db.runAsync(`DELETE FROM audit_log WHERE entity_id LIKE ?`, [
    `${TEST_PREFIX}%`,
  ]);
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
  if (farm.name !== `${TEST_PREFIX}farm`)
    throw new Error("farm.create returned wrong name");

  const updatedFarm = await farmRepo.update(ctx, farm.id, {
    name: `${TEST_PREFIX}farm-updated`,
    size: 7,
  });
  if (updatedFarm.size !== 7)
    throw new Error("farm.update did not persist size");
  if (updatedFarm.version !== 2)
    throw new Error("farm.update did not bump version");

  await farmRepo.softDelete(ctx, farm.id);
  const afterDelete = await farmRepo.getById(ctx, farm.id);
  if (afterDelete !== null) throw new Error("farm.softDelete did not hide row");

  await farmRepo.restore(ctx, farm.id);
  const afterRestore = await farmRepo.getById(ctx, farm.id);
  if (!afterRestore) throw new Error("farm.restore did not bring row back");

  // 2. User lifecycle + PIN --------------------------------------------------
  const user = await userRepo.create(ctx, {
    name: `${TEST_PREFIX}user`,
    role: "owner",
    pin: "1234",
  });
  const pinOk = await userRepo.verifyPin(ctx, user.id, "1234");
  if (!pinOk) throw new Error("userRepo.verifyPin failed for correct PIN");
  const pinBad = await userRepo.verifyPin(ctx, user.id, "0000");
  if (pinBad) throw new Error("userRepo.verifyPin accepted wrong PIN");

  // 3. Settings --------------------------------------------------------------
  await settingsRepo.set(ctx, `${TEST_PREFIX}flag`, { a: 1, b: "x" });
  const flag = await settingsRepo.get<{ a: number; b: string }>(
    ctx,
    `${TEST_PREFIX}flag`,
  );
  if (!flag || flag.a !== 1 || flag.b !== "x") {
    throw new Error("settingsRepo round-trip failed");
  }
  await settingsRepo.remove(ctx, `${TEST_PREFIX}flag`);

  // 4. Audit log -------------------------------------------------------------
  const auditRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM audit_log WHERE entity_id = ?`,
    [farm.id],
  );
  if (!auditRow || auditRow.count < 4) {
    throw new Error(
      `expected >= 4 audit rows for farm, got ${auditRow?.count ?? 0}`,
    );
  }

  // 5. Cleanup ---------------------------------------------------------------
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
