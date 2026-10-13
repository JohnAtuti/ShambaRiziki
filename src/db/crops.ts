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
  mapCropRow,
  type Crop,
  type CropCategory,
  type CropRow,
} from "./types";

export interface CreateCropInput {
  farmId: string;
  name: string;
  variety?: string | null;
  category?: CropCategory;
  daysToHarvest?: number | null;
  notes?: string | null;
}

export interface UpdateCropInput {
  name?: string;
  variety?: string | null;
  category?: CropCategory;
  daysToHarvest?: number | null;
  notes?: string | null;
}

export interface CropRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Crop[]>;
  listByCategory(
    ctx: RepoContext,
    farmId: string,
    category: CropCategory,
  ): Promise<Crop[]>;
  getById(ctx: RepoContext, id: string): Promise<Crop | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateCropInput): Promise<Crop>;
  update(ctx: RepoContext, id: string, patch: UpdateCropInput): Promise<Crop>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Crop>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Crop name is required");
  if (trimmed.length > 100) throw new ValidationError("Crop name is too long");
  return trimmed;
};

const validateDays = (days: number): void => {
  if (days < 0) throw new ValidationError("Days to harvest must be positive");
  if (days > 3650) throw new ValidationError("Days to harvest is unrealistic");
};

export const cropRepo: CropRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CropRow>(
        `SELECT * FROM crops
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapCropRow);
    } catch (error) {
      throw wrapDbError("cropRepo.listByFarm", error);
    }
  },

  async listByCategory(ctx, farmId, category) {
    try {
      const rows = await ctx.db.getAllAsync<CropRow>(
        `SELECT * FROM crops
          WHERE farm_id = ? AND category = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId, category],
      );
      return rows.map(mapCropRow);
    } catch (error) {
      throw wrapDbError("cropRepo.listByCategory", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<CropRow>(
        `SELECT * FROM crops WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapCropRow(row) : null;
    } catch (error) {
      throw wrapDbError("cropRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM crops
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("cropRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    if (input.daysToHarvest != null) validateDays(input.daysToHarvest);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO crops (
            id, farm_id, name, variety, category, days_to_harvest, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.variety ?? null,
            input.category ?? "other",
            input.daysToHarvest ?? null,
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
          entityType: "crop",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("cropRepo.create", error);
    }

    const created = await cropRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("crop", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await cropRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop", id);

    if (patch.daysToHarvest != null) validateDays(patch.daysToHarvest);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Crop,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.name !== undefined) {
      const next = requireName(patch.name);
      if (next !== existing.name) put("name", next, "name", next);
    }
    if (patch.variety !== undefined && patch.variety !== existing.variety) {
      put("variety", patch.variety, "variety", patch.variety);
    }
    if (patch.category !== undefined && patch.category !== existing.category) {
      put("category", patch.category, "category", patch.category);
    }
    if (
      patch.daysToHarvest !== undefined &&
      patch.daysToHarvest !== existing.daysToHarvest
    ) {
      put(
        "days_to_harvest",
        patch.daysToHarvest,
        "daysToHarvest",
        patch.daysToHarvest,
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
          `UPDATE crops SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "crop",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("cropRepo.update", error);
    }

    const updated = await cropRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("crop", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await cropRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crops
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crops
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropRepo.restore", error);
    }

    const restored = await cropRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("crop", id);
    return restored;
  },
};
