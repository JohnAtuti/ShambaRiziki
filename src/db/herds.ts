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
  mapHerdRow,
  type Herd,
  type HerdPurpose,
  type HerdRow,
  type Species,
} from "./types";

export interface CreateHerdInput {
  farmId: string;
  name: string;
  species?: Species;
  breed?: string | null;
  purpose?: HerdPurpose;
  notes?: string | null;
}

export interface UpdateHerdInput {
  name?: string;
  species?: Species;
  breed?: string | null;
  purpose?: HerdPurpose;
  notes?: string | null;
}

export interface HerdRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Herd[]>;
  getById(ctx: RepoContext, id: string): Promise<Herd | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateHerdInput): Promise<Herd>;
  update(ctx: RepoContext, id: string, patch: UpdateHerdInput): Promise<Herd>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Herd>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Herd name is required");
  if (trimmed.length > 100) throw new ValidationError("Herd name is too long");
  return trimmed;
};

export const herdRepo: HerdRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<HerdRow>(
        `SELECT * FROM herds
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapHerdRow);
    } catch (error) {
      throw wrapDbError("herdRepo.listByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<HerdRow>(
        `SELECT * FROM herds WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapHerdRow(row) : null;
    } catch (error) {
      throw wrapDbError("herdRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM herds
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("herdRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO herds (
            id, farm_id, name, species, breed, purpose, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.species ?? "cattle",
            input.breed ?? null,
            input.purpose ?? "mixed",
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
          entityType: "herd",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("herdRepo.create", error);
    }

    const created = await herdRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("herd", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await herdRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("herd", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Herd,
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
    if (patch.species !== undefined && patch.species !== existing.species) {
      put("species", patch.species, "species", patch.species);
    }
    if (patch.breed !== undefined && patch.breed !== existing.breed) {
      put("breed", patch.breed, "breed", patch.breed);
    }
    if (patch.purpose !== undefined && patch.purpose !== existing.purpose) {
      put("purpose", patch.purpose, "purpose", patch.purpose);
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
          `UPDATE herds SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "herd",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("herdRepo.update", error);
    }

    const updated = await herdRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("herd", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await herdRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("herd", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE herds
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "herd",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("herdRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE herds
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "herd",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("herdRepo.restore", error);
    }

    const restored = await herdRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("herd", id);
    return restored;
  },
};
