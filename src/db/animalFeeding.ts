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
  mapAnimalFeedRow,
  type AnimalFeedRecord,
  type AnimalFeedRecordRow,
  type FeedType,
} from "./types";

export interface CreateFeedRecordInput {
  farmId: string;
  animalId?: string | null;
  herdId?: string | null;
  recordDate: string;
  feedType: FeedType;
  quantity?: number | null;
  quantityUnit?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  notes?: string | null;
}

export interface UpdateFeedRecordInput {
  animalId?: string | null;
  herdId?: string | null;
  recordDate?: string;
  feedType?: FeedType;
  quantity?: number | null;
  quantityUnit?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  notes?: string | null;
}

export interface AnimalFeedingRepo {
  listByAnimal(ctx: RepoContext, animalId: string): Promise<AnimalFeedRecord[]>;
  listByHerd(ctx: RepoContext, herdId: string): Promise<AnimalFeedRecord[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<AnimalFeedRecord[]>;
  getById(ctx: RepoContext, id: string): Promise<AnimalFeedRecord | null>;
  create(
    ctx: RepoContext,
    input: CreateFeedRecordInput,
  ): Promise<AnimalFeedRecord>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateFeedRecordInput,
  ): Promise<AnimalFeedRecord>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<AnimalFeedRecord>;
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

const validateTarget = (
  animalId: string | null | undefined,
  herdId: string | null | undefined,
): void => {
  if (!animalId && !herdId) {
    throw new ValidationError("Either an animal or a herd is required");
  }
};

export const animalFeedingRepo: AnimalFeedingRepo = {
  async listByAnimal(ctx, animalId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalFeedRecordRow>(
        `SELECT * FROM animal_feed_records
          WHERE animal_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [animalId],
      );
      return rows.map(mapAnimalFeedRow);
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.listByAnimal", error);
    }
  },

  async listByHerd(ctx, herdId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalFeedRecordRow>(
        `SELECT * FROM animal_feed_records
          WHERE herd_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [herdId],
      );
      return rows.map(mapAnimalFeedRow);
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.listByHerd", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalFeedRecordRow>(
        `SELECT * FROM animal_feed_records
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapAnimalFeedRow);
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.listByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalFeedRecordRow>(
        `SELECT * FROM animal_feed_records
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAnimalFeedRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.getById", error);
    }
  },

  async create(ctx, input) {
    const recordDate = validateDate(input.recordDate);
    validateNonNegative(input.quantity, "Quantity");
    validateNonNegative(input.cost, "Cost");
    validateTarget(input.animalId, input.herdId);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO animal_feed_records (
            id, farm_id, animal_id, herd_id, record_date,
            feed_type, quantity, quantity_unit, cost, cost_currency, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.animalId ?? null,
            input.herdId ?? null,
            recordDate,
            input.feedType,
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
          entityType: "animal_feed_record",
          entityId: base.id,
          action: "create",
          changes: {
            feedType: [null, input.feedType],
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
      throw wrapDbError("animalFeedingRepo.create", error);
    }

    const created = await animalFeedingRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("animal_feed_record", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await animalFeedingRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_feed_record", id);

    if (patch.recordDate !== undefined) validateDate(patch.recordDate);
    validateNonNegative(patch.quantity, "Quantity");
    validateNonNegative(patch.cost, "Cost");

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
      domainKey: keyof AnimalFeedRecord,
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
    if (patch.feedType !== undefined && patch.feedType !== existing.feedType) {
      put("feed_type", patch.feedType, "feedType", patch.feedType);
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
          `UPDATE animal_feed_records SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "animal_feed_record",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.update", error);
    }

    const updated = await animalFeedingRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("animal_feed_record", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await animalFeedingRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_feed_record", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_feed_records
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_feed_record",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_feed_records
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_feed_record",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalFeedingRepo.restore", error);
    }

    const restored = await animalFeedingRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("animal_feed_record", id);
    return restored;
  },
};
