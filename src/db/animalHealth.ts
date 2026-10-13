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
  mapAnimalHealthRow,
  type AnimalHealthRecord,
  type AnimalHealthRecordRow,
  type HealthRecordType,
} from "./types";

export interface CreateHealthRecordInput {
  farmId: string;
  animalId: string;
  recordType: HealthRecordType;
  recordDate: string;
  productName?: string | null;
  dosage?: number | null;
  dosageUnit?: string | null;
  administeredBy?: string | null;
  diagnosis?: string | null;
  symptoms?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  withdrawalPeriodDays?: number | null;
  notes?: string | null;
}

export interface UpdateHealthRecordInput {
  recordType?: HealthRecordType;
  recordDate?: string;
  productName?: string | null;
  dosage?: number | null;
  dosageUnit?: string | null;
  administeredBy?: string | null;
  diagnosis?: string | null;
  symptoms?: string | null;
  cost?: number | null;
  costCurrency?: string | null;
  withdrawalPeriodDays?: number | null;
  notes?: string | null;
}

export interface AnimalHealthRepo {
  listByAnimal(
    ctx: RepoContext,
    animalId: string,
  ): Promise<AnimalHealthRecord[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<AnimalHealthRecord[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: HealthRecordType,
  ): Promise<AnimalHealthRecord[]>;
  getById(ctx: RepoContext, id: string): Promise<AnimalHealthRecord | null>;
  countByAnimal(ctx: RepoContext, animalId: string): Promise<number>;
  create(
    ctx: RepoContext,
    input: CreateHealthRecordInput,
  ): Promise<AnimalHealthRecord>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateHealthRecordInput,
  ): Promise<AnimalHealthRecord>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<AnimalHealthRecord>;
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

export const animalHealthRepo: AnimalHealthRepo = {
  async listByAnimal(ctx, animalId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalHealthRecordRow>(
        `SELECT * FROM animal_health_records
          WHERE animal_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [animalId],
      );
      return rows.map(mapAnimalHealthRow);
    } catch (error) {
      throw wrapDbError("animalHealthRepo.listByAnimal", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalHealthRecordRow>(
        `SELECT * FROM animal_health_records
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapAnimalHealthRow);
    } catch (error) {
      throw wrapDbError("animalHealthRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<AnimalHealthRecordRow>(
        `SELECT * FROM animal_health_records
          WHERE farm_id = ? AND record_type = ? AND deleted_at IS NULL
          ORDER BY record_date DESC, created_at DESC`,
        [farmId, type],
      );
      return rows.map(mapAnimalHealthRow);
    } catch (error) {
      throw wrapDbError("animalHealthRepo.listByType", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AnimalHealthRecordRow>(
        `SELECT * FROM animal_health_records
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAnimalHealthRow(row) : null;
    } catch (error) {
      throw wrapDbError("animalHealthRepo.getById", error);
    }
  },

  async countByAnimal(ctx, animalId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM animal_health_records
          WHERE animal_id = ? AND deleted_at IS NULL`,
        [animalId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("animalHealthRepo.countByAnimal", error);
    }
  },

  async create(ctx, input) {
    const recordDate = validateDate(input.recordDate);
    validateNonNegative(input.dosage, "Dosage");
    validateNonNegative(input.cost, "Cost");
    validateNonNegative(input.withdrawalPeriodDays, "Withdrawal period");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO animal_health_records (
            id, farm_id, animal_id, record_type, record_date,
            product_name, dosage, dosage_unit, administered_by,
            diagnosis, symptoms, cost, cost_currency,
            withdrawal_period_days, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.animalId,
            input.recordType,
            recordDate,
            input.productName ?? null,
            input.dosage ?? null,
            input.dosageUnit ?? null,
            input.administeredBy ?? null,
            input.diagnosis ?? null,
            input.symptoms ?? null,
            input.cost ?? null,
            input.costCurrency ?? null,
            input.withdrawalPeriodDays ?? null,
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
          entityType: "animal_health_record",
          entityId: base.id,
          action: "create",
          changes: {
            animalId: [null, input.animalId],
            recordType: [null, input.recordType],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("animalHealthRepo.create", error);
    }

    const created = await animalHealthRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("animal_health_record", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await animalHealthRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_health_record", id);

    if (patch.recordDate !== undefined) validateDate(patch.recordDate);
    validateNonNegative(patch.dosage, "Dosage");
    validateNonNegative(patch.cost, "Cost");
    validateNonNegative(patch.withdrawalPeriodDays, "Withdrawal period");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof AnimalHealthRecord,
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
    if (
      patch.productName !== undefined &&
      patch.productName !== existing.productName
    ) {
      put("product_name", patch.productName, "productName", patch.productName);
    }
    if (patch.dosage !== undefined && patch.dosage !== existing.dosage) {
      put("dosage", patch.dosage, "dosage", patch.dosage);
    }
    if (
      patch.dosageUnit !== undefined &&
      patch.dosageUnit !== existing.dosageUnit
    ) {
      put("dosage_unit", patch.dosageUnit, "dosageUnit", patch.dosageUnit);
    }
    if (
      patch.administeredBy !== undefined &&
      patch.administeredBy !== existing.administeredBy
    ) {
      put(
        "administered_by",
        patch.administeredBy,
        "administeredBy",
        patch.administeredBy,
      );
    }
    if (
      patch.diagnosis !== undefined &&
      patch.diagnosis !== existing.diagnosis
    ) {
      put("diagnosis", patch.diagnosis, "diagnosis", patch.diagnosis);
    }
    if (patch.symptoms !== undefined && patch.symptoms !== existing.symptoms) {
      put("symptoms", patch.symptoms, "symptoms", patch.symptoms);
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
    if (
      patch.withdrawalPeriodDays !== undefined &&
      patch.withdrawalPeriodDays !== existing.withdrawalPeriodDays
    ) {
      put(
        "withdrawal_period_days",
        patch.withdrawalPeriodDays,
        "withdrawalPeriodDays",
        patch.withdrawalPeriodDays,
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
          `UPDATE animal_health_records SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "animal_health_record",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("animalHealthRepo.update", error);
    }

    const updated = await animalHealthRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("animal_health_record", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await animalHealthRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("animal_health_record", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_health_records
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_health_record",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalHealthRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE animal_health_records
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "animal_health_record",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("animalHealthRepo.restore", error);
    }

    const restored = await animalHealthRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("animal_health_record", id);
    return restored;
  },
};
