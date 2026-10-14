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
  mapFinanceCategoryRow,
  type FinanceCategory,
  type FinanceCategoryRow,
  type FinanceCategoryType,
  type FinanceTargetType,
} from "./types";

export interface CreateCategoryInput {
  farmId: string;
  name: string;
  categoryType: FinanceCategoryType;
  parentId?: string | null;
  icon?: string | null;
  defaultTargetType?: FinanceTargetType | null;
  isSystem?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  icon?: string | null;
  defaultTargetType?: FinanceTargetType | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface FinanceCategoryRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<FinanceCategory[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: FinanceCategoryType,
  ): Promise<FinanceCategory[]>;
  listChildren(ctx: RepoContext, parentId: string): Promise<FinanceCategory[]>;
  getById(ctx: RepoContext, id: string): Promise<FinanceCategory | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(
    ctx: RepoContext,
    input: CreateCategoryInput,
  ): Promise<FinanceCategory>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateCategoryInput,
  ): Promise<FinanceCategory>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<FinanceCategory>;
  /** Idempotent. Inserts the default chart of accounts if not already present. */
  seedDefaults(ctx: RepoContext, farmId: string): Promise<number>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Category name is required");
  if (trimmed.length > 100) {
    throw new ValidationError("Category name is too long");
  }
  return trimmed;
};

// System defaults — the chart of accounts a farmer sees on day one.
// If the category already exists (by name and type), seedDefaults is a no-op.
type SeedCategory = {
  name: string;
  categoryType: FinanceCategoryType;
  icon: string;
  sortOrder: number;
};

const SEED_CATEGORIES: readonly SeedCategory[] = [
  // Income
  { name: "Crop sales", categoryType: "income", icon: "🌾", sortOrder: 10 },
  {
    name: "Livestock sales",
    categoryType: "income",
    icon: "🐄",
    sortOrder: 20,
  },
  { name: "Milk sales", categoryType: "income", icon: "🥛", sortOrder: 30 },
  { name: "Egg sales", categoryType: "income", icon: "🥚", sortOrder: 40 },
  {
    name: "Other farm income",
    categoryType: "income",
    icon: "💰",
    sortOrder: 50,
  },
  {
    name: "Grants and subsidies",
    categoryType: "income",
    icon: "🏛️",
    sortOrder: 60,
  },

  // Expenses
  { name: "Seeds", categoryType: "expense", icon: "🌱", sortOrder: 10 },
  { name: "Fertilizer", categoryType: "expense", icon: "💩", sortOrder: 20 },
  { name: "Pesticides", categoryType: "expense", icon: "🧪", sortOrder: 30 },
  { name: "Animal feed", categoryType: "expense", icon: "🌾", sortOrder: 40 },
  {
    name: "Veterinary costs",
    categoryType: "expense",
    icon: "💊",
    sortOrder: 50,
  },
  { name: "Labor wages", categoryType: "expense", icon: "👷", sortOrder: 60 },
  {
    name: "Fuel and transport",
    categoryType: "expense",
    icon: "⛽",
    sortOrder: 70,
  },
  {
    name: "Equipment and repairs",
    categoryType: "expense",
    icon: "🔧",
    sortOrder: 80,
  },
  { name: "Utilities", categoryType: "expense", icon: "💡", sortOrder: 90 },
  {
    name: "Rent and land lease",
    categoryType: "expense",
    icon: "🏞️",
    sortOrder: 100,
  },
  {
    name: "Bank charges and interest",
    categoryType: "expense",
    icon: "🏦",
    sortOrder: 110,
  },
  {
    name: "Other expenses",
    categoryType: "expense",
    icon: "📝",
    sortOrder: 120,
  },
];

export const financeCategoryRepo: FinanceCategoryRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceCategoryRow>(
        `SELECT * FROM finance_categories
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY category_type ASC, sort_order ASC, name ASC`,
        [farmId],
      );
      return rows.map(mapFinanceCategoryRow);
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceCategoryRow>(
        `SELECT * FROM finance_categories
          WHERE farm_id = ? AND category_type = ? AND deleted_at IS NULL
          ORDER BY sort_order ASC, name ASC`,
        [farmId, type],
      );
      return rows.map(mapFinanceCategoryRow);
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.listByType", error);
    }
  },

  async listChildren(ctx, parentId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceCategoryRow>(
        `SELECT * FROM finance_categories
          WHERE parent_id = ? AND deleted_at IS NULL
          ORDER BY sort_order ASC, name ASC`,
        [parentId],
      );
      return rows.map(mapFinanceCategoryRow);
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.listChildren", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<FinanceCategoryRow>(
        `SELECT * FROM finance_categories WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapFinanceCategoryRow(row) : null;
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM finance_categories
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO finance_categories (
            id, farm_id, name, category_type, parent_id, icon,
            default_target_type, is_system, is_active, sort_order,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.categoryType,
            input.parentId ?? null,
            input.icon ?? null,
            input.defaultTargetType ?? null,
            input.isSystem ? 1 : 0,
            1,
            input.sortOrder ?? 0,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );
        await writeAudit(ctx, {
          entityType: "finance_category",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.create", error);
    }

    const created = await financeCategoryRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("finance_category", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await financeCategoryRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_category", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof FinanceCategory,
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
    if (patch.parentId !== undefined && patch.parentId !== existing.parentId) {
      put("parent_id", patch.parentId, "parentId", patch.parentId);
    }
    if (patch.icon !== undefined && patch.icon !== existing.icon) {
      put("icon", patch.icon, "icon", patch.icon);
    }
    if (
      patch.defaultTargetType !== undefined &&
      patch.defaultTargetType !== existing.defaultTargetType
    ) {
      put(
        "default_target_type",
        patch.defaultTargetType,
        "defaultTargetType",
        patch.defaultTargetType,
      );
    }
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      put("is_active", patch.isActive ? 1 : 0, "isActive", patch.isActive);
    }
    if (
      patch.sortOrder !== undefined &&
      patch.sortOrder !== existing.sortOrder
    ) {
      put("sort_order", patch.sortOrder, "sortOrder", patch.sortOrder);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_categories SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "finance_category",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.update", error);
    }

    const updated = await financeCategoryRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("finance_category", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await financeCategoryRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_category", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_categories
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_category",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_categories
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_category",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.restore", error);
    }

    const restored = await financeCategoryRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("finance_category", id);
    return restored;
  },

  async seedDefaults(ctx, farmId) {
    try {
      let inserted = 0;
      await ctx.db.withTransactionAsync(async () => {
        for (const seed of SEED_CATEGORIES) {
          const existing = await ctx.db.getFirstAsync<{ id: string }>(
            `SELECT id FROM finance_categories
              WHERE farm_id = ? AND name = ? AND category_type = ?
                AND deleted_at IS NULL
              LIMIT 1`,
            [farmId, seed.name, seed.categoryType],
          );
          if (existing) continue;

          const base = newBaseFields();
          await ctx.db.runAsync(
            `INSERT INTO finance_categories (
              id, farm_id, name, category_type, parent_id, icon,
              default_target_type, is_system, is_active, sort_order,
              created_at, updated_at, deleted_at, version, sync_status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              base.id,
              farmId,
              seed.name,
              seed.categoryType,
              null,
              seed.icon,
              null,
              1,
              1,
              seed.sortOrder,
              base.created_at,
              base.updated_at,
              base.deleted_at,
              base.version,
              base.sync_status,
              base.metadata,
            ],
          );
          inserted += 1;
        }

        if (inserted > 0) {
          await writeAudit(ctx, {
            entityType: "finance_category_seed",
            entityId: farmId,
            action: "create",
            changes: { inserted: [null, inserted] },
          });
        }
      });
      return inserted;
    } catch (error) {
      throw wrapDbError("financeCategoryRepo.seedDefaults", error);
    }
  },
};
