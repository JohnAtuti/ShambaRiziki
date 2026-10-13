/**
 * Runtime verification of the data layer.
 * Runs in __DEV__ only.
 *
 * The test farm is created and immediately set to is_active=0 so a
 * concurrently-running AppStateProvider query can never pick it up.
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
    sizeUnit: "acre",
    farmType: "mixed",
  });
  await farmRepo.update(ctx, farm.id, { isActive: false });

  // 2. Plot
  const plot = await plotRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}plot`,
    size: 2,
  });

  // 3. Crop + cycle + activity
  const crop = await cropRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}maize`,
    category: "cereal",
  });

  const cycle = await cropCycleRepo.create(ctx, {
    farmId: farm.id,
    plotId: plot.id,
    cropId: crop.id,
    cycleName: `${TEST_PREFIX}cycle`,
    plantingDate: "2026-03-15T00:00:00.000Z",
    status: "active",
  });

  const cropActivity = await cropActivityRepo.create(ctx, {
    farmId: farm.id,
    cycleId: cycle.id,
    activityType: "fertilizer",
    activityDate: "2026-04-01T00:00:00.000Z",
    description: `${TEST_PREFIX}applied DAP`,
  });

  const photo = await attachmentRepo.create(ctx, {
    farmId: farm.id,
    entityType: "crop_activity",
    entityId: cropActivity.id,
    kind: "photo",
    localPath: `/tmp/${TEST_PREFIX}photo.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 245760,
    caption: `${TEST_PREFIX}photo`,
  });

  await attachmentRepo.softDelete(ctx, photo.id);
  const afterPhotoDelete = await attachmentRepo.getById(ctx, photo.id);
  if (afterPhotoDelete !== null) {
    throw new Error("attachment.softDelete did not hide row");
  }
  await attachmentRepo.restore(ctx, photo.id);

  // 4. Herd
  const herd = await herdRepo.create(ctx, {
    farmId: farm.id,
    name: `${TEST_PREFIX}dairy-herd`,
    species: "cattle",
    purpose: "dairy",
  });

  const herdsInFarm = await herdRepo.listByFarm(ctx, farm.id);
  if (herdsInFarm.length !== 1) {
    throw new Error(`expected 1 herd, got ${herdsInFarm.length}`);
  }

  // 5. Animals — cow + calf with parentage
  const cow = await animalRepo.create(ctx, {
    farmId: farm.id,
    herdId: herd.id,
    tagId: `${TEST_PREFIX}COW-001`,
    name: `${TEST_PREFIX}Bessie`,
    species: "cattle",
    sex: "female",
    dateOfBirth: "2022-01-15T00:00:00.000Z",
    origin: "born_on_farm",
    status: "alive",
    bodyConditionScore: 3.5,
  });

  const calf = await animalRepo.create(ctx, {
    farmId: farm.id,
    herdId: herd.id,
    tagId: `${TEST_PREFIX}CALF-001`,
    species: "cattle",
    sex: "male",
    dateOfBirth: "2026-02-01T00:00:00.000Z",
    origin: "born_on_farm",
    motherId: cow.id,
    status: "alive",
  });

  if (calf.motherId !== cow.id) {
    throw new Error("calf.motherId did not persist");
  }

  const animalsInFarm = await animalRepo.listByFarm(ctx, farm.id);
  if (animalsInFarm.length !== 2) {
    throw new Error(`expected 2 animals, got ${animalsInFarm.length}`);
  }

  const aliveCount = await animalRepo.countAliveByFarm(ctx, farm.id);
  if (aliveCount !== 2) {
    throw new Error(`expected 2 alive, got ${aliveCount}`);
  }

  const byTag = await animalRepo.getByTag(
    ctx,
    farm.id,
    `${TEST_PREFIX}COW-001`,
  );
  if (!byTag || byTag.id !== cow.id) {
    throw new Error("animalRepo.getByTag failed");
  }

  // 6. Health record
  const health = await animalHealthRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordType: "vaccination",
    recordDate: "2026-04-10T00:00:00.000Z",
    productName: "FMD vaccine",
    dosage: 2,
    dosageUnit: "ml",
    cost: 500,
    costCurrency: "KES",
    withdrawalPeriodDays: 0,
  });

  const healthList = await animalHealthRepo.listByAnimal(ctx, cow.id);
  if (healthList.length !== 1) {
    throw new Error(`expected 1 health record, got ${healthList.length}`);
  }

  if (health.withdrawalPeriodDays !== 0) {
    throw new Error("health.withdrawalPeriodDays did not persist");
  }

  // 7. Breeding record
  await animalBreedingRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordType: "birth",
    recordDate: "2026-02-01T00:00:00.000Z",
    method: "natural",
    offspringCount: 1,
    notes: `${TEST_PREFIX}calf born`,
  });

  const breedingList = await animalBreedingRepo.listByAnimal(ctx, cow.id);
  if (breedingList.length !== 1) {
    throw new Error(`expected 1 breeding record, got ${breedingList.length}`);
  }

  // 8. Feed record (herd-level)
  await animalFeedingRepo.create(ctx, {
    farmId: farm.id,
    herdId: herd.id,
    recordDate: "2026-04-12T00:00:00.000Z",
    feedType: "hay",
    quantity: 50,
    quantityUnit: "kg",
    cost: 1500,
    costCurrency: "KES",
    notes: `${TEST_PREFIX}morning feed`,
  });

  const feedList = await animalFeedingRepo.listByHerd(ctx, herd.id);
  if (feedList.length !== 1) {
    throw new Error(`expected 1 feed record, got ${feedList.length}`);
  }

  // 9. Production record (milk)
  await animalProductionRepo.create(ctx, {
    farmId: farm.id,
    animalId: cow.id,
    recordDate: "2026-04-12T00:00:00.000Z",
    productionType: "milk",
    quantity: 8.5,
    quantityUnit: "L",
    quality: "good",
    notes: `${TEST_PREFIX}morning milking`,
  });

  const prodList = await animalProductionRepo.listByAnimal(ctx, cow.id);
  if (prodList.length !== 1) {
    throw new Error(`expected 1 production record, got ${prodList.length}`);
  }

  const milkList = await animalProductionRepo.listByType(ctx, farm.id, "milk");
  if (milkList.length !== 1) {
    throw new Error(`expected 1 milk record, got ${milkList.length}`);
  }

  // 10. User + PIN
  const user = await userRepo.create(ctx, {
    name: `${TEST_PREFIX}user`,
    role: "owner",
    pin: "1234",
  });
  const pinOk = await userRepo.verifyPin(ctx, user.id, "1234");
  if (!pinOk) throw new Error("userRepo.verifyPin failed for correct PIN");

  // 11. Settings
  await settingsRepo.set(ctx, `${TEST_PREFIX}flag`, { a: 1 });
  const flag = await settingsRepo.get<{ a: number }>(ctx, `${TEST_PREFIX}flag`);
  if (!flag || flag.a !== 1) throw new Error("settingsRepo round-trip failed");
  await settingsRepo.remove(ctx, `${TEST_PREFIX}flag`);

  // 12. Cleanup
  await cleanPriorRuns(db);

  console.log("[db] ✅ smoke test passed");
};
