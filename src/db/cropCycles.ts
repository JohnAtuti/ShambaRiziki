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
  mapCropCycleRow,
  type CropCycle,
  type CropCycleRow,
  type CycleStatus,
  type PlantingMethod,
} from "./types";

export interface CreateCropCycleInput {
  farmId: string;
  plotId: string;
  cropId: string;
  cycleName?: string | null;
  plantingDate: string;
  plantingMethod?: PlantingMethod;
  expectedHarvestDate?: string | null;
  status?: CycleStatus;
  seedSource?: string | null;
  seedQuantity?: number | null;
  seedUnit?: string | null;
  expectedYield?: number | null;
  expectedYieldUnit?: string | null;
  notes?: string | null;
}

export interface UpdateCropCycleInput {
  cycleName?: string | null;
  plantingDate?: string;
  plantingMethod?: PlantingMethod;
  expectedHarvestDate?: string | null;
  actualHarvestDate?: string | null;
  status?: CycleStatus;
  seedSource?: string | null;
  seedQuantity?: number | null;
  seedUnit?: string | null;
  expectedYield?: number | null;
  expectedYieldUnit?: string | null;
  notes?: string | null;
}

export interface CropCycleRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<CropCycle[]>;
  listByPlot(ctx: RepoContext, plotId: string): Promise<CropCycle[]>;
  listByCrop(ctx: RepoContext, cropId: string): Promise<CropCycle[]>;
  listActiveByFarm(ctx: RepoContext, farmId: string): Promise<CropCycle[]>;
  getById(ctx: RepoContext, id: string): Promise<CropCycle | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateCropCycleInput): Promise<CropCycle>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateCropCycleInput,
  ): Promise<CropCycle>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<CropCycle>;
}

const validateDate = (iso: string, field: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
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

export const cropCycleRepo: CropCycleRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CropCycleRow>(
        `SELECT * FROM crop_cycles
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY planting_date DESC`,
        [farmId],
      );
      return rows.map(mapCropCycleRow);
    } catch (error) {
      throw wrapDbError("cropCycleRepo.listByFarm", error);
    }
  },

  async listByPlot(ctx, plotId) {
    try {
      const rows = await ctx.db.getAllAsync<CropCycleRow>(
        `SELECT * FROM crop_cycles
          WHERE plot_id = ? AND deleted_at IS NULL
          ORDER BY planting_date DESC`,
        [plotId],
      );
      return rows.map(mapCropCycleRow);
    } catch (error) {
      throw wrapDbError("cropCycleRepo.listByPlot", error);
    }
  },

  async listByCrop(ctx, cropId) {
    try {
      const rows = await ctx.db.getAllAsync<CropCycleRow>(
        `SELECT * FROM crop_cycles
          WHERE crop_id = ? AND deleted_at IS NULL
          ORDER BY planting_date DESC`,
        [cropId],
      );
      return rows.map(mapCropCycleRow);
    } catch (error) {
      throw wrapDbError("cropCycleRepo.listByCrop", error);
    }
  },

  async listActiveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CropCycleRow>(
        `SELECT * FROM crop_cycles
          WHERE farm_id = ? AND status = 'active' AND deleted_at IS NULL
          ORDER BY planting_date DESC`,
        [farmId],
      );
      return rows.map(mapCropCycleRow);
    } catch (error) {
      throw wrapDbError("cropCycleRepo.listActiveByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<CropCycleRow>(
        `SELECT * FROM crop_cycles WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapCropCycleRow(row) : null;
    } catch (error) {
      throw wrapDbError("cropCycleRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM crop_cycles
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("cropCycleRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const plantingDate = validateDate(input.plantingDate, "Planting date");
    validateNonNegative(input.seedQuantity, "Seed quantity");
    validateNonNegative(input.expectedYield, "Expected yield");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO crop_cycles (
            id, farm_id, plot_id, crop_id, cycle_name,
            planting_date, planting_method,
            expected_harvest_date, actual_harvest_date,
            status, seed_source, seed_quantity, seed_unit,
            expected_yield, expected_yield_unit, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.plotId,
            input.cropId,
            input.cycleName ?? null,
            plantingDate,
            input.plantingMethod ?? "direct_sowing",
            input.expectedHarvestDate ?? null,
            null,
            input.status ?? "planned",
            input.seedSource ?? null,
            input.seedQuantity ?? null,
            input.seedUnit ?? null,
            input.expectedYield ?? null,
            input.expectedYieldUnit ?? null,
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
          entityType: "crop_cycle",
          entityId: base.id,
          action: "create",
          changes: {
            farmId: [null, input.farmId],
            plotId: [null, input.plotId],
            cropId: [null, input.cropId],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("cropCycleRepo.create", error);
    }

    const created = await cropCycleRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("crop_cycle", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await cropCycleRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop_cycle", id);

    if (patch.plantingDate !== undefined) {
      validateDate(patch.plantingDate, "Planting date");
    }
    validateNonNegative(patch.seedQuantity, "Seed quantity");
    validateNonNegative(patch.expectedYield, "Expected yield");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof CropCycle,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (
      patch.cycleName !== undefined &&
      patch.cycleName !== existing.cycleName
    ) {
      put("cycle_name", patch.cycleName, "cycleName", patch.cycleName);
    }
    if (
      patch.plantingDate !== undefined &&
      patch.plantingDate !== existing.plantingDate
    ) {
      put(
        "planting_date",
        patch.plantingDate,
        "plantingDate",
        patch.plantingDate,
      );
    }
    if (
      patch.plantingMethod !== undefined &&
      patch.plantingMethod !== existing.plantingMethod
    ) {
      put(
        "planting_method",
        patch.plantingMethod,
        "plantingMethod",
        patch.plantingMethod,
      );
    }
    if (
      patch.expectedHarvestDate !== undefined &&
      patch.expectedHarvestDate !== existing.expectedHarvestDate
    ) {
      put(
        "expected_harvest_date",
        patch.expectedHarvestDate,
        "expectedHarvestDate",
        patch.expectedHarvestDate,
      );
    }
    if (
      patch.actualHarvestDate !== undefined &&
      patch.actualHarvestDate !== existing.actualHarvestDate
    ) {
      put(
        "actual_harvest_date",
        patch.actualHarvestDate,
        "actualHarvestDate",
        patch.actualHarvestDate,
      );
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      put("status", patch.status, "status", patch.status);
    }
    if (
      patch.seedSource !== undefined &&
      patch.seedSource !== existing.seedSource
    ) {
      put("seed_source", patch.seedSource, "seedSource", patch.seedSource);
    }
    if (
      patch.seedQuantity !== undefined &&
      patch.seedQuantity !== existing.seedQuantity
    ) {
      put(
        "seed_quantity",
        patch.seedQuantity,
        "seedQuantity",
        patch.seedQuantity,
      );
    }
    if (patch.seedUnit !== undefined && patch.seedUnit !== existing.seedUnit) {
      put("seed_unit", patch.seedUnit, "seedUnit", patch.seedUnit);
    }
    if (
      patch.expectedYield !== undefined &&
      patch.expectedYield !== existing.expectedYield
    ) {
      put(
        "expected_yield",
        patch.expectedYield,
        "expectedYield",
        patch.expectedYield,
      );
    }
    if (
      patch.expectedYieldUnit !== undefined &&
      patch.expectedYieldUnit !== existing.expectedYieldUnit
    ) {
      put(
        "expected_yield_unit",
        patch.expectedYieldUnit,
        "expectedYieldUnit",
        patch.expectedYieldUnit,
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
          `UPDATE crop_cycles SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "crop_cycle",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("cropCycleRepo.update", error);
    }

    const updated = await cropCycleRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("crop_cycle", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await cropCycleRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop_cycle", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crop_cycles
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop_cycle",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropCycleRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crop_cycles
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop_cycle",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropCycleRepo.restore", error);
    }

    const restored = await cropCycleRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("crop_cycle", id);
    return restored;
  },
};
