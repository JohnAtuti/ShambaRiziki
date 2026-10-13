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
  mapInventoryTransactionRow,
  type InventoryTargetType,
  type InventoryTransaction,
  type InventoryTransactionRow,
  type InventoryTransactionType,
} from "./types";

export interface CreateTransactionInput {
  farmId: string;
  itemId: string;
  warehouseId?: string | null;
  transactionType: InventoryTransactionType;
  transactionDate: string;
  quantity: number;
  quantityUnit?: string | null;
  unitCost?: number | null;
  totalCost?: number | null;
  costCurrency?: string | null;
  supplier?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  reference?: string | null;
  targetType?: InventoryTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}

export interface UpdateTransactionInput {
  warehouseId?: string | null;
  transactionType?: InventoryTransactionType;
  transactionDate?: string;
  quantity?: number;
  quantityUnit?: string | null;
  unitCost?: number | null;
  totalCost?: number | null;
  costCurrency?: string | null;
  supplier?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  reference?: string | null;
  targetType?: InventoryTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}

export interface ExpiringBatch {
  itemId: string;
  itemName: string;
  warehouseId: string | null;
  batchNumber: string | null;
  expiryDate: string;
  quantity: number;
}

export interface InventoryTransactionRepo {
  listByItem(ctx: RepoContext, itemId: string): Promise<InventoryTransaction[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<InventoryTransaction[]>;
  listByType(
    ctx: RepoContext,
    farmId: string,
    type: InventoryTransactionType,
  ): Promise<InventoryTransaction[]>;
  listByWarehouse(
    ctx: RepoContext,
    warehouseId: string,
  ): Promise<InventoryTransaction[]>;
  listByTarget(
    ctx: RepoContext,
    targetType: InventoryTargetType,
    targetId: string,
  ): Promise<InventoryTransaction[]>;
  getById(ctx: RepoContext, id: string): Promise<InventoryTransaction | null>;
  countByItem(ctx: RepoContext, itemId: string): Promise<number>;
  listExpiring(
    ctx: RepoContext,
    farmId: string,
    daysAhead: number,
  ): Promise<ExpiringBatch[]>;
  create(
    ctx: RepoContext,
    input: CreateTransactionInput,
  ): Promise<InventoryTransaction>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateTransactionInput,
  ): Promise<InventoryTransaction>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<InventoryTransaction>;
}

const OUT_TYPES: readonly InventoryTransactionType[] = [
  "issue",
  "adjustment_out",
];

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

const validateQuantityForType = (
  quantity: number,
  type: InventoryTransactionType,
): void => {
  if (!Number.isFinite(quantity)) {
    throw new ValidationError("Quantity must be a number");
  }
  // Stocktake is signed delta; every other type uses an unsigned magnitude.
  if (type === "stocktake") return;
  if (quantity < 0) {
    throw new ValidationError(
      "Quantity must be positive. Use a stocktake or adjustment for corrections.",
    );
  }
};

const validateTarget = (
  targetType: InventoryTargetType | null | undefined,
  targetId: string | null | undefined,
): void => {
  // both null is fine; exactly one non-null is not.
  const hasType = targetType != null && targetType !== null;
  const hasId = targetId != null && targetId.trim() !== "";
  if (hasType !== hasId) {
    throw new ValidationError(
      "Target type and target id must both be set or both be empty",
    );
  }
};

export const inventoryTransactionRepo: InventoryTransactionRepo = {
  async listByItem(ctx, itemId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE item_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [itemId],
      );
      return rows.map(mapInventoryTransactionRow);
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listByItem", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapInventoryTransactionRow);
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listByFarm", error);
    }
  },

  async listByType(ctx, farmId, type) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE farm_id = ? AND transaction_type = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [farmId, type],
      );
      return rows.map(mapInventoryTransactionRow);
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listByType", error);
    }
  },

  async listByWarehouse(ctx, warehouseId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE warehouse_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [warehouseId],
      );
      return rows.map(mapInventoryTransactionRow);
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listByWarehouse", error);
    }
  },

  async listByTarget(ctx, targetType, targetId) {
    try {
      const rows = await ctx.db.getAllAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE target_type = ? AND target_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [targetType, targetId],
      );
      return rows.map(mapInventoryTransactionRow);
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listByTarget", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<InventoryTransactionRow>(
        `SELECT * FROM inventory_transactions
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapInventoryTransactionRow(row) : null;
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.getById", error);
    }
  },

  async countByItem(ctx, itemId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM inventory_transactions
          WHERE item_id = ? AND deleted_at IS NULL`,
        [itemId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.countByItem", error);
    }
  },

  async listExpiring(ctx, farmId, daysAhead) {
    try {
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() + daysAhead);
      const cutoffIso = cutoff.toISOString();

      const rows = await ctx.db.getAllAsync<{
        item_id: string;
        item_name: string;
        warehouse_id: string | null;
        batch_number: string | null;
        expiry_date: string;
        quantity: number;
      }>(
        `SELECT
            t.item_id           AS item_id,
            i.name              AS item_name,
            t.warehouse_id      AS warehouse_id,
            t.batch_number      AS batch_number,
            t.expiry_date       AS expiry_date,
            SUM(${STOCK_SIGN_INLINE}) AS quantity
           FROM inventory_transactions t
           JOIN inventory_items i ON i.id = t.item_id
          WHERE t.farm_id = ?
            AND t.deleted_at IS NULL
            AND t.expiry_date IS NOT NULL
            AND t.expiry_date <= ?
          GROUP BY t.item_id, t.warehouse_id, t.batch_number, t.expiry_date
          HAVING SUM(${STOCK_SIGN_INLINE}) > 0
          ORDER BY t.expiry_date ASC`,
        [farmId, cutoffIso],
      );

      return rows.map((r) => ({
        itemId: r.item_id,
        itemName: r.item_name,
        warehouseId: r.warehouse_id,
        batchNumber: r.batch_number,
        expiryDate: r.expiry_date,
        quantity: r.quantity ?? 0,
      }));
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.listExpiring", error);
    }
  },

  async create(ctx, input) {
    const transactionDate = validateDate(
      input.transactionDate,
      "Transaction date",
    );
    validateQuantityForType(input.quantity, input.transactionType);
    validateNonNegative(input.unitCost, "Unit cost");
    validateNonNegative(input.totalCost, "Total cost");
    validateTarget(input.targetType, input.targetId);

    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO inventory_transactions (
            id, farm_id, item_id, warehouse_id,
            transaction_type, transaction_date, quantity, quantity_unit,
            unit_cost, total_cost, cost_currency, supplier,
            batch_number, expiry_date, reference,
            target_type, target_id, target_label, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.itemId,
            input.warehouseId ?? null,
            input.transactionType,
            transactionDate,
            input.quantity,
            input.quantityUnit ?? null,
            input.unitCost ?? null,
            input.totalCost ?? null,
            input.costCurrency ?? null,
            input.supplier ?? null,
            input.batchNumber ?? null,
            input.expiryDate ?? null,
            input.reference ?? null,
            input.targetType ?? null,
            input.targetId ?? null,
            input.targetLabel ?? null,
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
          entityType: "inventory_transaction",
          entityId: base.id,
          action: "create",
          changes: {
            itemId: [null, input.itemId],
            transactionType: [null, input.transactionType],
            quantity: [null, input.quantity],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.create", error);
    }

    const created = await inventoryTransactionRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("inventory_transaction", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await inventoryTransactionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("inventory_transaction", id);

    if (patch.transactionDate !== undefined) {
      validateDate(patch.transactionDate, "Transaction date");
    }
    if (patch.quantity !== undefined) {
      const type = patch.transactionType ?? existing.transactionType;
      validateQuantityForType(patch.quantity, type);
    }
    validateNonNegative(patch.unitCost, "Unit cost");
    validateNonNegative(patch.totalCost, "Total cost");

    const nextTargetType =
      patch.targetType !== undefined ? patch.targetType : existing.targetType;
    const nextTargetId =
      patch.targetId !== undefined ? patch.targetId : existing.targetId;
    validateTarget(nextTargetType, nextTargetId);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof InventoryTransaction,
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
      patch.warehouseId !== undefined &&
      patch.warehouseId !== existing.warehouseId
    ) {
      put("warehouse_id", patch.warehouseId, "warehouseId", patch.warehouseId);
    }
    if (
      patch.transactionType !== undefined &&
      patch.transactionType !== existing.transactionType
    ) {
      put(
        "transaction_type",
        patch.transactionType,
        "transactionType",
        patch.transactionType,
      );
    }
    if (
      patch.transactionDate !== undefined &&
      patch.transactionDate !== existing.transactionDate
    ) {
      put(
        "transaction_date",
        patch.transactionDate,
        "transactionDate",
        patch.transactionDate,
      );
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
    if (patch.unitCost !== undefined && patch.unitCost !== existing.unitCost) {
      put("unit_cost", patch.unitCost, "unitCost", patch.unitCost);
    }
    if (
      patch.totalCost !== undefined &&
      patch.totalCost !== existing.totalCost
    ) {
      put("total_cost", patch.totalCost, "totalCost", patch.totalCost);
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
    if (patch.supplier !== undefined && patch.supplier !== existing.supplier) {
      put("supplier", patch.supplier, "supplier", patch.supplier);
    }
    if (
      patch.batchNumber !== undefined &&
      patch.batchNumber !== existing.batchNumber
    ) {
      put("batch_number", patch.batchNumber, "batchNumber", patch.batchNumber);
    }
    if (
      patch.expiryDate !== undefined &&
      patch.expiryDate !== existing.expiryDate
    ) {
      put("expiry_date", patch.expiryDate, "expiryDate", patch.expiryDate);
    }
    if (
      patch.reference !== undefined &&
      patch.reference !== existing.reference
    ) {
      put("reference", patch.reference, "reference", patch.reference);
    }
    if (
      patch.targetType !== undefined &&
      patch.targetType !== existing.targetType
    ) {
      put("target_type", patch.targetType, "targetType", patch.targetType);
    }
    if (patch.targetId !== undefined && patch.targetId !== existing.targetId) {
      put("target_id", patch.targetId, "targetId", patch.targetId);
    }
    if (
      patch.targetLabel !== undefined &&
      patch.targetLabel !== existing.targetLabel
    ) {
      put("target_label", patch.targetLabel, "targetLabel", patch.targetLabel);
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
          `UPDATE inventory_transactions SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "inventory_transaction",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.update", error);
    }

    const updated = await inventoryTransactionRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("inventory_transaction", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await inventoryTransactionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("inventory_transaction", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE inventory_transactions
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "inventory_transaction",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE inventory_transactions
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "inventory_transaction",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("inventoryTransactionRepo.restore", error);
    }

    const restored = await inventoryTransactionRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("inventory_transaction", id);
    return restored;
  },
};

// Local constant used only inside listExpiring's JOIN query.
const STOCK_SIGN_INLINE = `
  CASE t.transaction_type
    WHEN 'purchase'       THEN t.quantity
    WHEN 'return'         THEN t.quantity
    WHEN 'adjustment_in'  THEN t.quantity
    WHEN 'stocktake'      THEN t.quantity
    WHEN 'issue'          THEN -t.quantity
    WHEN 'adjustment_out' THEN -t.quantity
    ELSE 0
  END
`;

// Referenced from the OUT_TYPES array defined above but unused at runtime.
void OUT_TYPES;
