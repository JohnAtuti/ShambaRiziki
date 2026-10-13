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
  mapInventoryItemRow,
  type InventoryItem,
  type InventoryItemRow,
  type ItemCategory,
} from "./types";

export interface CreateItemInput {
  farmId: string;
  name: string;
  sku?: string | null;
  category?: ItemCategory;
  unit?: string;
  description?: string | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  defaultCost?: number | null;
  defaultCostCurrency?: string | null;
  preferredSupplier?: string | null;
  notes?: string | null;
}

export interface UpdateItemInput {
  name?: string;
  sku?: string | null;
  category?: ItemCategory;
  unit?: string;
  description?: string | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  defaultCost?: number | null;
  defaultCostCurrency?: string | null;
  preferredSupplier?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface ItemStock {
  itemId: string;
  quantity: number;
}

export interface ItemStockRow {
  item_id: string;
  stock: number;
}

export interface InventoryItemRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<InventoryItem[]>;
  listActiveByFarm(ctx: RepoContext, farmId: string): Promise<InventoryItem[]>;
  listByCategory(
    ctx: RepoContext,
    farmId: string,
    category: ItemCategory,
  ): Promise<InventoryItem[]>;
  getById(ctx: RepoContext, id: string): Promise<InventoryItem | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateItemInput): Promise<InventoryItem>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateItemInput,
  ): Promise<InventoryItem>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<InventoryItem>;
  getStockLevels(ctx: RepoContext, farmId: string): Promise<ItemStock[]>;
  getStockForItem(ctx: RepoContext, itemId: string): Promise<number>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Item name is required");
  if (trimmed.length > 150) throw new ValidationError("Item name is too long");
  return trimmed;
};

const validateNonNegative = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value == null) return;
  if (value < 0) throw new ValidationError(`${field} must be non-negative`);
};

// SQL fragment that computes stock direction for a transaction type.
// Kept here as a constant so the query in getStockLevels stays readable.
const STOCK_SIGN_SQL = `
  CASE transaction_type
    WHEN 'purchase'       THEN quantity
    WHEN 'return'         THEN quantity
    WHEN 'adjustment_in'  THEN quantity
    WHEN 'stocktake'      THEN quantity
    WHEN 'issue'          THEN -quantity
    WHEN 'adjustment_out' THEN -quantity
    ELSE 0
  END
`;

export const inventoryItemRepo: InventoryItemRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryItemRow>(
        `SELECT * FROM inventory_items
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapInventoryItemRow);
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.listByFarm", error);
    }
  },

  async listActiveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryItemRow>(
        `SELECT * FROM inventory_items
          WHERE farm_id = ? AND is_active = 1 AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapInventoryItemRow);
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.listActiveByFarm", error);
    }
  },

  async listByCategory(ctx, farmId, category) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryItemRow>(
        `SELECT * FROM inventory_items
          WHERE farm_id = ? AND category = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId, category],
      );
      return rows.map(mapInventoryItemRow);
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.listByCategory", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<InventoryItemRow>(
        `SELECT * FROM inventory_items WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapInventoryItemRow(row) : null;
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM inventory_items
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    validateNonNegative(input.reorderLevel, "Reorder level");
    validateNonNegative(input.reorderQuantity, "Reorder quantity");
    validateNonNegative(input.defaultCost, "Default cost");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO inventory_items (
            id, farm_id, name, sku, category, unit, description,
            reorder_level, reorder_quantity,
            default_cost, default_cost_currency, preferred_supplier,
            is_active, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.sku ?? null,
            input.category ?? "other",
            input.unit ?? "unit",
            input.description ?? null,
            input.reorderLevel ?? null,
            input.reorderQuantity ?? null,
            input.defaultCost ?? null,
            input.defaultCostCurrency ?? null,
            input.preferredSupplier ?? null,
            1,
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
          entityType: "inventory_item",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.create", error);
    }

    const created = await inventoryItemRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("inventory_item", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await inventoryItemRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("inventory_item", id);

    validateNonNegative(patch.reorderLevel, "Reorder level");
    validateNonNegative(patch.reorderQuantity, "Reorder quantity");
    validateNonNegative(patch.defaultCost, "Default cost");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof InventoryItem,
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
    if (patch.sku !== undefined && patch.sku !== existing.sku) {
      put("sku", patch.sku, "sku", patch.sku);
    }
    if (patch.category !== undefined && patch.category !== existing.category) {
      put("category", patch.category, "category", patch.category);
    }
    if (patch.unit !== undefined && patch.unit !== existing.unit) {
      put("unit", patch.unit, "unit", patch.unit);
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      put("description", patch.description, "description", patch.description);
    }
    if (
      patch.reorderLevel !== undefined &&
      patch.reorderLevel !== existing.reorderLevel
    ) {
      put(
        "reorder_level",
        patch.reorderLevel,
        "reorderLevel",
        patch.reorderLevel,
      );
    }
    if (
      patch.reorderQuantity !== undefined &&
      patch.reorderQuantity !== existing.reorderQuantity
    ) {
      put(
        "reorder_quantity",
        patch.reorderQuantity,
        "reorderQuantity",
        patch.reorderQuantity,
      );
    }
    if (
      patch.defaultCost !== undefined &&
      patch.defaultCost !== existing.defaultCost
    ) {
      put("default_cost", patch.defaultCost, "defaultCost", patch.defaultCost);
    }
    if (
      patch.defaultCostCurrency !== undefined &&
      patch.defaultCostCurrency !== existing.defaultCostCurrency
    ) {
      put(
        "default_cost_currency",
        patch.defaultCostCurrency,
        "defaultCostCurrency",
        patch.defaultCostCurrency,
      );
    }
    if (
      patch.preferredSupplier !== undefined &&
      patch.preferredSupplier !== existing.preferredSupplier
    ) {
      put(
        "preferred_supplier",
        patch.preferredSupplier,
        "preferredSupplier",
        patch.preferredSupplier,
      );
    }
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      put("is_active", patch.isActive ? 1 : 0, "isActive", patch.isActive);
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
          `UPDATE inventory_items SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "inventory_item",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.update", error);
    }

    const updated = await inventoryItemRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("inventory_item", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await inventoryItemRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("inventory_item", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE inventory_items
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "inventory_item",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE inventory_items
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "inventory_item",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.restore", error);
    }

    const restored = await inventoryItemRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("inventory_item", id);
    return restored;
  },

  async getStockLevels(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<ItemStockRow>(
        `SELECT item_id,
                SUM(${STOCK_SIGN_SQL}) AS stock
           FROM inventory_transactions
          WHERE farm_id = ? AND deleted_at IS NULL
          GROUP BY item_id`,
        [farmId],
      );
      return rows.map((r) => ({
        itemId: r.item_id,
        quantity: r.stock ?? 0,
      }));
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.getStockLevels", error);
    }
  },

  async getStockForItem(ctx, itemId) {
    try {
      const row = await ctx.db.getFirstAsync<{ stock: number | null }>(
        `SELECT SUM(${STOCK_SIGN_SQL}) AS stock
           FROM inventory_transactions
          WHERE item_id = ? AND deleted_at IS NULL`,
        [itemId],
      );
      return row?.stock ?? 0;
    } catch (error) {
      throw wrapDbError("inventoryItemRepo.getStockForItem", error);
    }
  },
};
