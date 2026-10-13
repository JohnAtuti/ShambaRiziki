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
  mapPlotRow,
  type Fertility,
  type Plot,
  type PlotRow,
  type PlotUse,
  type SizeUnit,
  type Slope,
  type SoilType,
  type TenureType,
} from "./types";

export interface CreatePlotInput {
  farmId: string;
  name: string;
  size?: number | null;
  sizeUnit?: SizeUnit;
  locationText?: string | null;
  soilType?: SoilType | null;
  soilPh?: number | null;
  fertility?: Fertility | null;
  slope?: Slope | null;
  tenureType?: TenureType;
  currentUse?: PlotUse;
  notes?: string | null;
}

export interface UpdatePlotInput {
  name?: string;
  size?: number | null;
  sizeUnit?: SizeUnit;
  locationText?: string | null;
  soilType?: SoilType | null;
  soilPh?: number | null;
  fertility?: Fertility | null;
  slope?: Slope | null;
  tenureType?: TenureType;
  currentUse?: PlotUse;
  notes?: string | null;
}

export interface PlotRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Plot[]>;
  getById(ctx: RepoContext, id: string): Promise<Plot | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreatePlotInput): Promise<Plot>;
  update(ctx: RepoContext, id: string, patch: UpdatePlotInput): Promise<Plot>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Plot>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Plot name is required");
  if (trimmed.length > 100) throw new ValidationError("Plot name is too long");
  return trimmed;
};

const validatePh = (ph: number): void => {
  if (ph < 0 || ph > 14) {
    throw new ValidationError("Soil pH must be between 0 and 14");
  }
};

const validateSize = (size: number): void => {
  if (size < 0) {
    throw new ValidationError("Plot size must be non-negative");
  }
};

export const plotRepo: PlotRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<PlotRow>(
        `SELECT * FROM plots
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [farmId],
      );
      return rows.map(mapPlotRow);
    } catch (error) {
      throw wrapDbError("plotRepo.listByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<PlotRow>(
        `SELECT * FROM plots WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapPlotRow(row) : null;
    } catch (error) {
      throw wrapDbError("plotRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM plots
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("plotRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    if (input.size !== undefined && input.size !== null) {
      validateSize(input.size);
    }
    if (input.soilPh !== undefined && input.soilPh !== null) {
      validatePh(input.soilPh);
    }
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO plots (
            id, farm_id, name, size, size_unit, location_text,
            soil_type, soil_ph, fertility, slope,
            tenure_type, current_use, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.size ?? null,
            input.sizeUnit ?? "acre",
            input.locationText ?? null,
            input.soilType ?? null,
            input.soilPh ?? null,
            input.fertility ?? null,
            input.slope ?? null,
            input.tenureType ?? "owned",
            input.currentUse ?? "none",
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
          entityType: "plot",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("plotRepo.create", error);
    }

    const created = await plotRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("plot", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await plotRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("plot", id);

    if (patch.size !== undefined && patch.size !== null) {
      validateSize(patch.size);
    }
    if (patch.soilPh !== undefined && patch.soilPh !== null) {
      validatePh(patch.soilPh);
    }

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Plot,
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
    if (patch.size !== undefined && patch.size !== existing.size) {
      put("size", patch.size, "size", patch.size);
    }
    if (patch.sizeUnit !== undefined && patch.sizeUnit !== existing.sizeUnit) {
      put("size_unit", patch.sizeUnit, "sizeUnit", patch.sizeUnit);
    }
    if (
      patch.locationText !== undefined &&
      patch.locationText !== existing.locationText
    ) {
      put(
        "location_text",
        patch.locationText,
        "locationText",
        patch.locationText,
      );
    }
    if (patch.soilType !== undefined && patch.soilType !== existing.soilType) {
      put("soil_type", patch.soilType, "soilType", patch.soilType);
    }
    if (patch.soilPh !== undefined && patch.soilPh !== existing.soilPh) {
      put("soil_ph", patch.soilPh, "soilPh", patch.soilPh);
    }
    if (
      patch.fertility !== undefined &&
      patch.fertility !== existing.fertility
    ) {
      put("fertility", patch.fertility, "fertility", patch.fertility);
    }
    if (patch.slope !== undefined && patch.slope !== existing.slope) {
      put("slope", patch.slope, "slope", patch.slope);
    }
    if (
      patch.tenureType !== undefined &&
      patch.tenureType !== existing.tenureType
    ) {
      put("tenure_type", patch.tenureType, "tenureType", patch.tenureType);
    }
    if (
      patch.currentUse !== undefined &&
      patch.currentUse !== existing.currentUse
    ) {
      put("current_use", patch.currentUse, "currentUse", patch.currentUse);
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
          `UPDATE plots SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "plot",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("plotRepo.update", error);
    }

    const updated = await plotRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("plot", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await plotRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("plot", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE plots
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "plot",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("plotRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE plots
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "plot",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("plotRepo.restore", error);
    }

    const restored = await plotRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("plot", id);
    return restored;
  },
};
