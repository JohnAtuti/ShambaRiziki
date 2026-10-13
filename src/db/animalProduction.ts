import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import {
  mapAnimalProductionRow,
  type AnimalProductionRecord,
  type AnimalProductionRecordRow,
  type ProductionType,
} from "./types";

export interface CreateProductionRecordInput {
  farmId: string;
  animalId?: string | null;
  herdId?: string | null;
  recordDate: string;
  productionType: ProductionType;
  quantity?: number | null;
  quantityUnit?: string | null;
  quality?: string | null;
  weightKg?: number | null;
  bodyConditionScore?: number | null;
  notes?: string | null;
}

export interface UpdateProductionRecordInput {
  animalId?: string | null;
  herdId?: string | null;
  recordDate?: string;
  productionType?: ProductionType;
  quantity?: number | null;
  quantityUnit?: string | null;
  quality?: string | null;
  weightKg?: number | null;
  bodyConditionScore?: number | null;
  notes?: string | null;
}

export interface AnimalProductionRepo {
  listByAnimal(
    ctx: RepoContext,
    animalId: string,
  ): Promise<AnimalProductionRecord[]>;
  listByHerd(
    ctx: RepoContext,
    herdId: string,
  ): Promise<AnimalProductionRecord[]>;
  listByFarm(
    ctx: RepoContext,
    farmId: string,
  ): Promise<AnimalProductionRecord[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: ProductionType,
  ): Promise<AnimalProductionRecord[]>;
  getById(ctx: RepoContext, id: string): Promise<AnimalProductionRecord | null>;
  create(
    ctx: RepoContext,
    input: CreateProductionRecordInput,
  ): Promise<AnimalProductionRecord>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateProductionRecordInput,
  ): Promise<AnimalProductionRecord>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<AnimalProductionRecord>;
}

const validateDate = (iso: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError("Record date is required");
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Record date must be a valid date");
  }
  return trimmed;
};

const validateNonNegative = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value == null) return;
  if (value < 0) throw new ValidationError(`${field} must be non-negative`);
};

const validateBcs = (value: number | null | undefined): void => {
  if (value == null) return;
  if (value < 1 || value > 5) {
    throw new ValidationError("Body condition score must be between 1 and 5");
  }
};

const validateTarget = (
  animalId: string | null | undefined,
  herdId: string | null | undefined,
): void => {
  if (!animalId && !herdId) {
    throw new ValidationError("Either an animal or a herd is required");
  }
};

export const animalProductionRepo: AnimalProductionRepo = {
  async listByAnimal(ctx, animalId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalProductionRecordRow>(
        `SELECT * FROM animal_production_records
          WHERE animal_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [animalId],
      );
      return rows.map(mapAnimalProductionRow);
    } catch (error) {
      throw wrapDbError("animalProductionRepo.listByAnimal", error);
    }
  },

  async listByHerd(ctx, herdId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalProductionRecordRow>(
        `SELECT * FROM animal_production_records
          WHERE herd_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [herdId],
      );
      return rows.map(mapAnimalProductionRow);
    } catch (error) {
      throw wrapDbError("animalProductionRepo.listByHerd", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalProductionRecordRow>(
        `SELECT * FROM animal_production_records
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapAnimalProductionRow);
    } catch (error) {
      throw wrapDbError("animalProductionRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalProductionRecordRow>(
        `SELECT * FROM animal_production_records
          WHERE farm_id = ? AND production_type = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId, type],
      );
      return rows.map(mapAnimalProductionRow);
    } catch (error) {
      throw wrapDbError("animalProductionRepo.listByType", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalProductionRecordRow>(
        `SELECT * FROM animal_production_records
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAnimalProductionRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalProductionRepo.getById", error);
    }
  },

  async create(ctx, input) {
    const recordDate = validateDate(input.recordDate);
    validateNonNegative(input.quantity, "Quantity");
    validateNonNegative(input.weightKg, "Weight");
    validateBcs(input.bodyConditionScore);
    validateTarget(input.animalId, input.herdId);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO animal_production_records (
            id, farm_id, animal_id, herd_id, record_date,
            production_type, quantity, quantity_unit, quality,
            weight_kg, body_condition_score, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.animalId ?? null,
            input.herdId ?? null,
            recordDate,
            input.productionType,
            input.quantity ?? null,
            input.quantityUnit ?? null,
            input.quality ?? null,
            input.weightKg ?? null,
            input.bodyConditionScore ?? null,
            input.notes ?? null,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );
        await writeAudit(ctx, {
          entityType: "animal_production_record",
          entityId: base.id,
          action: "create",
          changes: {
            productionType: [null, input.productionType],
            target: [
              null,
              input.animalId
                ? `animal:${input.animalId}`
                : `herd:${input.herdId}`,
            ],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("animalProductionRepo.create", error);
    }

    const created = await animalProductionRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("animal_production_record", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await animalProductionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_production_record", id);

    if (patch.recordDate !== undefined) validateDate(patch.recordDate);
    validateNonNegative(patch.quantity, "Quantity");
    validateNonNegative(patch.weightKg, "Weight");
    validateBcs(patch.bodyConditionScore);

    const nextAnimalId =
      patch.animalId !== undefined ? patch.animalId : existing.animalId;
    const nextHerdId =
      patch.herdId !== undefined ? patch.herdId : existing.herdId;
    validateTarget(nextAnimalId, nextHerdId);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof AnimalProductionRecord,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.animalId !== undefined && patch.animalId !== existing.animalId) {
      put("animal_id", patch.animalId, "animalId", patch.animalId);
    }
    if (patch.herdId !== undefined && patch.herdId !== existing.herdId) {
      put("herd_id", patch.herdId, "herdId", patch.herdId);
    }
    if (
      patch.recordDate !== undefined &&
      patch.recordDate !== existing.recordDate
    ) {
      put("record_date", patch.recordDate, "recordDate", patch.recordDate);
    }
    if (
      patch.productionType !== undefined &&
      patch.productionType !== existing.productionType
    ) {
      put(
        "production_type",
        patch.productionType,
        "productionType",
        patch.productionType,
      );
    }
    if (patch.quantity !== undefined && patch.quantity !== existing.quantity) {
      put("quantity", patch.quantity, "quantity", patch.quantity);
    }
    if (
      patch.quantityUnit !== undefined &&
      patch.quantityUnit !== existing.quantityUnit
    ) {
      put(
        "quantity_unit",
        patch.quantityUnit,
        "quantityUnit",
        patch.quantityUnit,
      );
    }
    if (patch.quality !== undefined && patch.quality !== existing.quality) {
      put("quality", patch.quality, "quality", patch.quality);
    }
    if (patch.weightKg !== undefined && patch.weightKg !== existing.weightKg) {
      put("weight_kg", patch.weightKg, "weightKg", patch.weightKg);
    }
    if (
      patch.bodyConditionScore !== undefined &&
      patch.bodyConditionScore !== existing.bodyConditionScore
    ) {
      put(
        "body_condition_score",
        patch.bodyConditionScore,
        "bodyConditionScore",
        patch.bodyConditionScore,
      );
    }
    if (patch.notes !== undefined && patch.notes !== existing.notes) {
      put("notes", patch.notes, "notes", patch.notes);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_production_records SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "animal_production_record",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("animalProductionRepo.update", error);
    }

    const updated = await animalProductionRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("animal_production_record", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await animalProductionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_production_record", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_production_records
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_production_record",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalProductionRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_production_records
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_production_record",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalProductionRepo.restore", error);
    }

    const restored = await animalProductionRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("animal_production_record", id);
    return restored;
  },
};
