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
  mapAnimalBreedingRow,
  type AnimalBreedingRecord,
  type AnimalBreedingRecordRow,
  type BreedingMethod,
  type BreedingRecordType,
} from "./types";

export interface CreateBreedingRecordInput {
  farmId: string;
  animalId: string;
  recordType: BreedingRecordType;
  recordDate: string;
  sireId?: string | null;
  method?: BreedingMethod | null;
  pregnancyConfirmedDate?: string | null;
  expectedDueDate?: string | null;
  offspringCount?: number | null;
  notes?: string | null;
}

export interface UpdateBreedingRecordInput {
  recordType?: BreedingRecordType;
  recordDate?: string;
  sireId?: string | null;
  method?: BreedingMethod | null;
  pregnancyConfirmedDate?: string | null;
  expectedDueDate?: string | null;
  offspringCount?: number | null;
  notes?: string | null;
}

export interface AnimalBreedingRepo {
  listByAnimal(
    ctx: RepoContext,
    animalId: string,
  ): Promise<AnimalBreedingRecord[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<AnimalBreedingRecord[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: BreedingRecordType,
  ): Promise<AnimalBreedingRecord[]>;
  getById(ctx: RepoContext, id: string): Promise<AnimalBreedingRecord | null>;
  countByAnimal(ctx: RepoContext, animalId: string): Promise<number>;
  create(
    ctx: RepoContext,
    input: CreateBreedingRecordInput,
  ): Promise<AnimalBreedingRecord>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateBreedingRecordInput,
  ): Promise<AnimalBreedingRecord>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<AnimalBreedingRecord>;
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

export const animalBreedingRepo: AnimalBreedingRepo = {
  async listByAnimal(ctx, animalId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalBreedingRecordRow>(
        `SELECT * FROM animal_breeding_records
          WHERE animal_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [animalId],
      );
      return rows.map(mapAnimalBreedingRow);
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.listByAnimal", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalBreedingRecordRow>(
        `SELECT * FROM animal_breeding_records
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapAnimalBreedingRow);
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalBreedingRecordRow>(
        `SELECT * FROM animal_breeding_records
          WHERE farm_id = ? AND record_type = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId, type],
      );
      return rows.map(mapAnimalBreedingRow);
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.listByType", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalBreedingRecordRow>(
        `SELECT * FROM animal_breeding_records
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAnimalBreedingRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.getById", error);
    }
  },

  async countByAnimal(ctx, animalId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM animal_breeding_records
          WHERE animal_id = ? AND deleted_at IS NULL`,
        [animalId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.countByAnimal", error);
    }
  },

  async create(ctx, input) {
    const recordDate = validateDate(input.recordDate, "Record date");
    validateNonNegative(input.offspringCount, "Offspring count");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO animal_breeding_records (
            id, farm_id, animal_id, record_type, record_date,
            sire_id, method, pregnancy_confirmed_date, expected_due_date,
            offspring_count, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.animalId,
            input.recordType,
            recordDate,
            input.sireId ?? null,
            input.method ?? null,
            input.pregnancyConfirmedDate ?? null,
            input.expectedDueDate ?? null,
            input.offspringCount ?? null,
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
          entityType: "animal_breeding_record",
          entityId: base.id,
          action: "create",
          changes: {
            animalId: [null, input.animalId],
            recordType: [null, input.recordType],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.create", error);
    }

    const created = await animalBreedingRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("animal_breeding_record", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await animalBreedingRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_breeding_record", id);

    if (patch.recordDate !== undefined) {
      validateDate(patch.recordDate, "Record date");
    }
    validateNonNegative(patch.offspringCount, "Offspring count");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof AnimalBreedingRecord,
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
      patch.recordType !== undefined &&
      patch.recordType !== existing.recordType
    ) {
      put("record_type", patch.recordType, "recordType", patch.recordType);
    }
    if (
      patch.recordDate !== undefined &&
      patch.recordDate !== existing.recordDate
    ) {
      put("record_date", patch.recordDate, "recordDate", patch.recordDate);
    }
    if (patch.sireId !== undefined && patch.sireId !== existing.sireId) {
      put("sire_id", patch.sireId, "sireId", patch.sireId);
    }
    if (patch.method !== undefined && patch.method !== existing.method) {
      put("method", patch.method, "method", patch.method);
    }
    if (
      patch.pregnancyConfirmedDate !== undefined &&
      patch.pregnancyConfirmedDate !== existing.pregnancyConfirmedDate
    ) {
      put(
        "pregnancy_confirmed_date",
        patch.pregnancyConfirmedDate,
        "pregnancyConfirmedDate",
        patch.pregnancyConfirmedDate,
      );
    }
    if (
      patch.expectedDueDate !== undefined &&
      patch.expectedDueDate !== existing.expectedDueDate
    ) {
      put(
        "expected_due_date",
        patch.expectedDueDate,
        "expectedDueDate",
        patch.expectedDueDate,
      );
    }
    if (
      patch.offspringCount !== undefined &&
      patch.offspringCount !== existing.offspringCount
    ) {
      put(
        "offspring_count",
        patch.offspringCount,
        "offspringCount",
        patch.offspringCount,
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
          `UPDATE animal_breeding_records SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "animal_breeding_record",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.update", error);
    }

    const updated = await animalBreedingRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("animal_breeding_record", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await animalBreedingRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_breeding_record", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_breeding_records
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_breeding_record",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_breeding_records
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_breeding_record",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalBreedingRepo.restore", error);
    }

    const restored = await animalBreedingRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("animal_breeding_record", id);
    return restored;
  },
};
