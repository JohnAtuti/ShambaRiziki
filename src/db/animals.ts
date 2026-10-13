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
  mapAnimalRow,
  type Animal,
  type AnimalOrigin,
  type AnimalRow,
  type AnimalSex,
  type AnimalStatus,
  type Species,
} from "./types";

export interface CreateAnimalInput {
  farmId: string;
  herdId?: string | null;
  tagId: string;
  name?: string | null;
  species?: Species;
  breed?: string | null;
  sex?: AnimalSex;
  dateOfBirth?: string | null;
  origin?: AnimalOrigin;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  motherId?: string | null;
  fatherId?: string | null;
  status?: AnimalStatus;
  bodyConditionScore?: number | null;
  notes?: string | null;
}

export interface UpdateAnimalInput {
  herdId?: string | null;
  tagId?: string;
  name?: string | null;
  species?: Species;
  breed?: string | null;
  sex?: AnimalSex;
  dateOfBirth?: string | null;
  origin?: AnimalOrigin;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  motherId?: string | null;
  fatherId?: string | null;
  status?: AnimalStatus;
  bodyConditionScore?: number | null;
  notes?: string | null;
}

export interface AnimalRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Animal[]>;
  listByHerd(ctx: RepoContext, herdId: string): Promise<Animal[]>;
  listAliveByFarm(ctx: RepoContext, farmId: string): Promise<Animal[]>;
  getById(ctx: RepoContext, id: string): Promise<Animal | null>;
  getByTag(
    ctx: RepoContext,
    farmId: string,
    tagId: string,
  ): Promise<Animal | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  countAliveByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateAnimalInput): Promise<Animal>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateAnimalInput,
  ): Promise<Animal>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Animal>;
}

const requireTag = (tag: string): string => {
  const trimmed = tag.trim();
  if (!trimmed) throw new ValidationError("Animal tag ID is required");
  if (trimmed.length > 50) throw new ValidationError("Tag ID is too long");
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

export const animalRepo: AnimalRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalRow>(
        `SELECT * FROM animals
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY tag_id ASC`,
        [farmId],
      );
      return rows.map(mapAnimalRow);
    } catch (error) {
      throw wrapDbError("animalRepo.listByFarm", error);
    }
  },

  async listByHerd(ctx, herdId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalRow>(
        `SELECT * FROM animals
          WHERE herd_id = ? AND deleted_at IS NULL
          ORDER BY tag_id ASC`,
        [herdId],
      );
      return rows.map(mapAnimalRow);
    } catch (error) {
      throw wrapDbError("animalRepo.listByHerd", error);
    }
  },

  async listAliveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalRow>(
        `SELECT * FROM animals
          WHERE farm_id = ? AND status = 'alive' AND deleted_at IS NULL
          ORDER BY tag_id ASC`,
        [farmId],
      );
      return rows.map(mapAnimalRow);
    } catch (error) {
      throw wrapDbError("animalRepo.listAliveByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalRow>(
        `SELECT * FROM animals WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAnimalRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalRepo.getById", error);
    }
  },

  async getByTag(ctx, farmId, tagId) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalRow>(
        `SELECT * FROM animals
          WHERE farm_id = ? AND tag_id = ? AND deleted_at IS NULL`,
        [farmId, tagId],
      );
      return row ? mapAnimalRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalRepo.getByTag", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM animals
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("animalRepo.countByFarm", error);
    }
  },

  async countAliveByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM animals
          WHERE farm_id = ? AND status = 'alive' AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("animalRepo.countAliveByFarm", error);
    }
  },

  async create(ctx, input) {
    const tagId = requireTag(input.tagId);
    validateNonNegative(input.purchasePrice, "Purchase price");
    validateBcs(input.bodyConditionScore);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO animals (
            id, farm_id, herd_id, tag_id, name, species, breed, sex,
            date_of_birth, origin, purchase_date, purchase_price,
            mother_id, father_id, status, body_condition_score, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.herdId ?? null,
            tagId,
            input.name ?? null,
            input.species ?? "cattle",
            input.breed ?? null,
            input.sex ?? "unknown",
            input.dateOfBirth ?? null,
            input.origin ?? "unknown",
            input.purchaseDate ?? null,
            input.purchasePrice ?? null,
            input.motherId ?? null,
            input.fatherId ?? null,
            input.status ?? "alive",
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
          entityType: "animal",
          entityId: base.id,
          action: "create",
          changes: { tagId: [null, tagId], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("animalRepo.create", error);
    }

    const created = await animalRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("animal", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await animalRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal", id);

    validateNonNegative(patch.purchasePrice, "Purchase price");
    validateBcs(patch.bodyConditionScore);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Animal,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.herdId !== undefined && patch.herdId !== existing.herdId) {
      put("herd_id", patch.herdId, "herdId", patch.herdId);
    }
    if (patch.tagId !== undefined) {
      const next = requireTag(patch.tagId);
      if (next !== existing.tagId) put("tag_id", next, "tagId", next);
    }
    if (patch.name !== undefined && patch.name !== existing.name) {
      put("name", patch.name, "name", patch.name);
    }
    if (patch.species !== undefined && patch.species !== existing.species) {
      put("species", patch.species, "species", patch.species);
    }
    if (patch.breed !== undefined && patch.breed !== existing.breed) {
      put("breed", patch.breed, "breed", patch.breed);
    }
    if (patch.sex !== undefined && patch.sex !== existing.sex) {
      put("sex", patch.sex, "sex", patch.sex);
    }
    if (
      patch.dateOfBirth !== undefined &&
      patch.dateOfBirth !== existing.dateOfBirth
    ) {
      put("date_of_birth", patch.dateOfBirth, "dateOfBirth", patch.dateOfBirth);
    }
    if (patch.origin !== undefined && patch.origin !== existing.origin) {
      put("origin", patch.origin, "origin", patch.origin);
    }
    if (
      patch.purchaseDate !== undefined &&
      patch.purchaseDate !== existing.purchaseDate
    ) {
      put(
        "purchase_date",
        patch.purchaseDate,
        "purchaseDate",
        patch.purchaseDate,
      );
    }
    if (
      patch.purchasePrice !== undefined &&
      patch.purchasePrice !== existing.purchasePrice
    ) {
      put(
        "purchase_price",
        patch.purchasePrice,
        "purchasePrice",
        patch.purchasePrice,
      );
    }
    if (patch.motherId !== undefined && patch.motherId !== existing.motherId) {
      put("mother_id", patch.motherId, "motherId", patch.motherId);
    }
    if (patch.fatherId !== undefined && patch.fatherId !== existing.fatherId) {
      put("father_id", patch.fatherId, "fatherId", patch.fatherId);
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      put("status", patch.status, "status", patch.status);
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
          `UPDATE animals SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "animal",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("animalRepo.update", error);
    }

    const updated = await animalRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("animal", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await animalRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animals
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animals
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalRepo.restore", error);
    }

    const restored = await animalRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("animal", id);
    return restored;
  },
};
