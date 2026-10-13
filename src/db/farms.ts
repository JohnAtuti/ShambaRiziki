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
  mapFarmRow,
  type Currency,
  type Farm,
  type FarmRow,
  type FarmType,
  type Language,
  type SizeUnit,
} from "./types";

export interface CreateFarmInput {
  name: string;
  location?: string | null;
  size?: number | null;
  sizeUnit?: SizeUnit;
  farmType?: FarmType;
  currency?: Currency;
  language?: Language;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

export interface UpdateFarmInput {
  name?: string;
  location?: string | null;
  size?: number | null;
  sizeUnit?: SizeUnit;
  farmType?: FarmType;
  currency?: Currency;
  dateFormat?: string;
  fiscalYearStartMonth?: number;
  taxRate?: number;
  language?: Language;
  contactPhone?: string | null;
  contactEmail?: string | null;
  logoUri?: string | null;
  isActive?: boolean;
}

export interface FarmRepo {
  list(ctx: RepoContext): Promise<Farm[]>;
  listActive(ctx: RepoContext): Promise<Farm[]>;
  getById(ctx: RepoContext, id: string): Promise<Farm | null>;
  getActive(ctx: RepoContext): Promise<Farm | null>;
  create(ctx: RepoContext, input: CreateFarmInput): Promise<Farm>;
  update(ctx: RepoContext, id: string, patch: UpdateFarmInput): Promise<Farm>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Farm>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Farm name is required");
  if (trimmed.length > 100) throw new ValidationError("Farm name is too long");
  return trimmed;
};

export const farmRepo: FarmRepo = {
  async list(ctx) {
    try {
      const rows = await ctx.db.getAllAsync<FarmRow>(
        `SELECT * FROM farms WHERE deleted_at IS NULL ORDER BY created_at ASC`,
      );
      return rows.map(mapFarmRow);
    } catch (error) {
      throw wrapDbError("farmRepo.list", error);
    }
  },

  async listActive(ctx) {
    try {
      const rows = await ctx.db.getAllAsync<FarmRow>(
        `SELECT * FROM farms
          WHERE deleted_at IS NULL AND is_active = 1
          ORDER BY created_at ASC`,
      );
      return rows.map(mapFarmRow);
    } catch (error) {
      throw wrapDbError("farmRepo.listActive", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<FarmRow>(
        `SELECT * FROM farms WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapFarmRow(row) : null;
    } catch (error) {
      throw wrapDbError("farmRepo.getById", error);
    }
  },

  async getActive(ctx) {
    try {
      const row = await ctx.db.getFirstAsync<FarmRow>(
        `SELECT * FROM farms
          WHERE deleted_at IS NULL AND is_active = 1
          ORDER BY created_at ASC
          LIMIT 1`,
      );
      return row ? mapFarmRow(row) : null;
    } catch (error) {
      throw wrapDbError("farmRepo.getActive", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO farms (
            id, name, location, size, size_unit, farm_type,
            logo_uri, contact_phone, contact_email,
            currency, date_format, fiscal_year_start_month, tax_rate, language,
            is_active,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            name,
            input.location ?? null,
            input.size ?? null,
            input.sizeUnit ?? "acre",
            input.farmType ?? "mixed",
            null,
            input.contactPhone ?? null,
            input.contactEmail ?? null,
            input.currency ?? "KES",
            "DD/MM/YYYY",
            1,
            0,
            input.language ?? "en",
            1,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );

        await writeAudit(ctx, {
          entityType: "farm",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name] },
        });
      });
    } catch (error) {
      throw wrapDbError("farmRepo.create", error);
    }

    const created = await farmRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("farm", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await farmRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("farm", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: string,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey] = [
        (existing as unknown as Record<string, unknown>)[domainKey],
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
    if (patch.size !== undefined && patch.size !== existing.size) {
      put("size", patch.size, "size", patch.size);
    }
    if (patch.sizeUnit !== undefined && patch.sizeUnit !== existing.sizeUnit) {
      put("size_unit", patch.sizeUnit, "sizeUnit", patch.sizeUnit);
    }
    if (patch.farmType !== undefined && patch.farmType !== existing.farmType) {
      put("farm_type", patch.farmType, "farmType", patch.farmType);
    }
    if (patch.currency !== undefined && patch.currency !== existing.currency) {
      put("currency", patch.currency, "currency", patch.currency);
    }
    if (
      patch.dateFormat !== undefined &&
      patch.dateFormat !== existing.dateFormat
    ) {
      put("date_format", patch.dateFormat, "dateFormat", patch.dateFormat);
    }
    if (
      patch.fiscalYearStartMonth !== undefined &&
      patch.fiscalYearStartMonth !== existing.fiscalYearStartMonth
    ) {
      if (patch.fiscalYearStartMonth < 1 || patch.fiscalYearStartMonth > 12) {
        throw new ValidationError("fiscalYearStartMonth must be 1-12");
      }
      put(
        "fiscal_year_start_month",
        patch.fiscalYearStartMonth,
        "fiscalYearStartMonth",
        patch.fiscalYearStartMonth,
      );
    }
    if (patch.taxRate !== undefined && patch.taxRate !== existing.taxRate) {
      if (patch.taxRate < 0 || patch.taxRate > 100) {
        throw new ValidationError("taxRate must be between 0 and 100");
      }
      put("tax_rate", patch.taxRate, "taxRate", patch.taxRate);
    }
    if (patch.language !== undefined && patch.language !== existing.language) {
      put("language", patch.language, "language", patch.language);
    }
    if (
      patch.contactPhone !== undefined &&
      patch.contactPhone !== existing.contactPhone
    ) {
      put(
        "contact_phone",
        patch.contactPhone,
        "contactPhone",
        patch.contactPhone,
      );
    }
    if (
      patch.contactEmail !== undefined &&
      patch.contactEmail !== existing.contactEmail
    ) {
      put(
        "contact_email",
        patch.contactEmail,
        "contactEmail",
        patch.contactEmail,
      );
    }
    if (patch.logoUri !== undefined && patch.logoUri !== existing.logoUri) {
      put("logo_uri", patch.logoUri, "logoUri", patch.logoUri);
    }
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      put("is_active", patch.isActive ? 1 : 0, "isActive", patch.isActive);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE farms SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "farm",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("farmRepo.update", error);
    }

    const updated = await farmRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("farm", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await farmRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("farm", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE farms
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "farm",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("farmRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE farms
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "farm",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("farmRepo.restore", error);
    }

    const restored = await farmRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("farm", id);
    return restored;
  },
};
