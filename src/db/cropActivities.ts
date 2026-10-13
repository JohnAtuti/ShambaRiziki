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
  mapCropActivityRow,
  type CropActivity,
  type CropActivityRow,
  type CropActivityType,
} from "./types";

export interface CreateCropActivityInput {
  farmId: string;
  cycleId: string;
  activityType: CropActivityType;
  activityDate: string;
  description?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  notes?: string | null;
}

export interface UpdateCropActivityInput {
  activityType?: CropActivityType;
  activityDate?: string;
  description?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  notes?: string | null;
}

export interface CropActivityRepo {
  listByCycle(ctx: RepoContext, cycleId: string): Promise<CropActivity[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<CropActivity[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: CropActivityType,
  ): Promise<CropActivity[]>;
  getById(ctx: RepoContext, id: string): Promise<CropActivity | null>;
  countByCycle(ctx: RepoContext, cycleId: string): Promise<number>;
  create(
    ctx: RepoContext,
    input: CreateCropActivityInput,
  ): Promise<CropActivity>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateCropActivityInput,
  ): Promise<CropActivity>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<CropActivity>;
}

const validateDate = (iso: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError("Activity date is required");
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Activity date must be a valid date");
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

export const cropActivityRepo: CropActivityRepo = {
  async listByCycle(ctx, cycleId) {
    try {
      const rows = await ctx.db.getAllAsync<CropActivityRow>(
        `SELECT * FROM crop_activities
          WHERE cycle_id = ? AND deleted_at IS NULL
          ORDER BY activity_date DESC, created_at DESC`,
        [cycleId],
      );
      return rows.map(mapCropActivityRow);
    } catch (error) {
      throw wrapDbError("cropActivityRepo.listByCycle", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CropActivityRow>(
        `SELECT * FROM crop_activities
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY activity_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapCropActivityRow);
    } catch (error) {
      throw wrapDbError("cropActivityRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<CropActivityRow>(
        `SELECT * FROM crop_activities
          WHERE farm_id = ? AND activity_type = ? AND deleted_at IS NULL
          ORDER BY activity_date DESC, created_at DESC`,
        [farmId, type],
      );
      return rows.map(mapCropActivityRow);
    } catch (error) {
      throw wrapDbError("cropActivityRepo.listByType", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<CropActivityRow>(
        `SELECT * FROM crop_activities WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapCropActivityRow(row) : null;
    } catch (error) {
      throw wrapDbError("cropActivityRepo.getById", error);
    }
  },

  async countByCycle(ctx, cycleId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM crop_activities
          WHERE cycle_id = ? AND deleted_at IS NULL`,
        [cycleId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("cropActivityRepo.countByCycle", error);
    }
  },

  async create(ctx, input) {
    const activityDate = validateDate(input.activityDate);
    validateNonNegative(input.quantity, "Quantity");
    validateNonNegative(input.cost, "Cost");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO crop_activities (
            id, farm_id, cycle_id, activity_type, activity_date,
            description, quantity, quantity_unit, cost, cost_currency, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.cycleId,
            input.activityType,
            activityDate,
            input.description ?? null,
            input.quantity ?? null,
            input.quantityUnit ?? null,
            input.cost ?? null,
            input.costCurrency ?? null,
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
          entityType: "crop_activity",
          entityId: base.id,
          action: "create",
          changes: {
            farmId: [null, input.farmId],
            cycleId: [null, input.cycleId],
            activityType: [null, input.activityType],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("cropActivityRepo.create", error);
    }

    const created = await cropActivityRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("crop_activity", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await cropActivityRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop_activity", id);

    if (patch.activityDate !== undefined) {
      validateDate(patch.activityDate);
    }
    validateNonNegative(patch.quantity, "Quantity");
    validateNonNegative(patch.cost, "Cost");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof CropActivity,
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
      patch.activityType !== undefined &&
      patch.activityType !== existing.activityType
    ) {
      put(
        "activity_type",
        patch.activityType,
        "activityType",
        patch.activityType,
      );
    }
    if (
      patch.activityDate !== undefined &&
      patch.activityDate !== existing.activityDate
    ) {
      put(
        "activity_date",
        patch.activityDate,
        "activityDate",
        patch.activityDate,
      );
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      put("description", patch.description, "description", patch.description);
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
    if (patch.cost !== undefined && patch.cost !== existing.cost) {
      put("cost", patch.cost, "cost", patch.cost);
    }
    if (
      patch.costCurrency !== undefined &&
      patch.costCurrency !== existing.costCurrency
    ) {
      put(
        "cost_currency",
        patch.costCurrency,
        "costCurrency",
        patch.costCurrency,
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
          `UPDATE crop_activities SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "crop_activity",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("cropActivityRepo.update", error);
    }

    const updated = await cropActivityRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("crop_activity", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await cropActivityRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("crop_activity", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crop_activities
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop_activity",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropActivityRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE crop_activities
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "crop_activity",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("cropActivityRepo.restore", error);
    }

    const restored = await cropActivityRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("crop_activity", id);
    return restored;
  },
};
