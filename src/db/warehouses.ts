import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import { mapWarehouseRow, type Warehouse, type WarehouseRow } from "./types";

export interface CreateWarehouseInput {
  farmId: string;
  name: string;
  location?: string | null;
  notes?: string | null;
}

export interface UpdateWarehouseInput {
  name?: string;
  location?: string | null;
  notes?: string | null;
}

export interface WarehouseRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Warehouse[]>;
  getById(ctx: RepoContext, id: string): Promise<Warehouse | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateWarehouseInput): Promise<Warehouse>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateWarehouseInput,
  ): Promise<Warehouse>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Warehouse>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Warehouse name is required");
  if (trimmed.length > 100) {
    throw new ValidationError("Warehouse name is too long");
  }
  return trimmed;
};

export const warehouseRepo: WarehouseRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<WarehouseRow>(
        `SELECT * FROM warehouses
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapWarehouseRow);
    } catch (error) {
      throw wrapDbError("warehouseRepo.listByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<WarehouseRow>(
        `SELECT * FROM warehouses WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapWarehouseRow(row) : null;
    } catch (error) {
      throw wrapDbError("warehouseRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM warehouses
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("warehouseRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO warehouses (
            id, farm_id, name, location, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.location ?? null,
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
          entityType: "warehouse",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("warehouseRepo.create", error);
    }

    const created = await warehouseRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("warehouse", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await warehouseRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("warehouse", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Warehouse,
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
    if (patch.location !== undefined && patch.location !== existing.location) {
      put("location", patch.location, "location", patch.location);
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
          `UPDATE warehouses SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "warehouse",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("warehouseRepo.update", error);
    }

    const updated = await warehouseRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("warehouse", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await warehouseRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("warehouse", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE warehouses
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "warehouse",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("warehouseRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE warehouses
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "warehouse",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("warehouseRepo.restore", error);
    }

    const restored = await warehouseRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("warehouse", id);
    return restored;
  },
};
