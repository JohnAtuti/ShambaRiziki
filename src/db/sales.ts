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
  mapSaleItemRow,
  mapSaleRow,
  type Sale,
  type SaleItem,
  type SaleItemRow,
  type SaleRow,
  type SaleStatus,
} from "./types";

export interface SaleItemInput {
  itemId?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
}

export interface CreateSaleInput {
  farmId: string;
  customerId?: string | null;
  saleDate: string;
  dueDate?: string | null;
  reference?: string | null;
  currency?: string;
  status?: SaleStatus;
  notes?: string | null;
  items?: SaleItemInput[];
}

export interface UpdateSaleInput {
  customerId?: string | null;
  saleDate?: string;
  dueDate?: string | null;
  reference?: string | null;
  status?: SaleStatus;
  notes?: string | null;
  amountPaid?: number;
  /** If provided, replaces all existing items atomically. */
  items?: SaleItemInput[];
}

export interface SaleRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Sale[]>;
  listByCustomer(ctx: RepoContext, customerId: string): Promise<Sale[]>;
  getById(ctx: RepoContext, id: string): Promise<Sale | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  listItems(ctx: RepoContext, saleId: string): Promise<SaleItem[]>;
  create(ctx: RepoContext, input: CreateSaleInput): Promise<Sale>;
  update(ctx: RepoContext, id: string, patch: UpdateSaleInput): Promise<Sale>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Sale>;
}

const validateDate = (iso: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError("Sale date is required");
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Sale date must be a valid date");
  }
  return trimmed;
};

const validateNonNegative = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value == null) return;
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a number`);
  }
  if (value < 0) throw new ValidationError(`${field} must be non-negative`);
};

const requireItemDescription = (description: string): string => {
  const trimmed = description.trim();
  if (!trimmed) {
    throw new ValidationError("Sale item description is required");
  }
  if (trimmed.length > 200) {
    throw new ValidationError("Sale item description is too long");
  }
  return trimmed;
};

const validateItem = (item: SaleItemInput): void => {
  validateNonNegative(item.quantity, "Quantity");
  validateNonNegative(item.unitPrice, "Unit price");
};

const lineTotalOf = (item: SaleItemInput): number =>
  item.quantity * item.unitPrice;

const totalOf = (items: readonly SaleItemInput[]): number =>
  items.reduce((sum, item) => sum + lineTotalOf(item), 0);

export const saleRepo: SaleRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<SaleRow>(
        `SELECT * FROM sales
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY sale_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapSaleRow);
    } catch (error) {
      throw wrapDbError("saleRepo.listByFarm", error);
    }
  },

  async listByCustomer(ctx, customerId) {
    try {
      const rows = await ctx.db.getAllAsync<SaleRow>(
        `SELECT * FROM sales
          WHERE customer_id = ? AND deleted_at IS NULL
          ORDER BY sale_date DESC, created_at DESC`,
        [customerId],
      );
      return rows.map(mapSaleRow);
    } catch (error) {
      throw wrapDbError("saleRepo.listByCustomer", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<SaleRow>(
        `SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapSaleRow(row) : null;
    } catch (error) {
      throw wrapDbError("saleRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM sales
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("saleRepo.countByFarm", error);
    }
  },

  async listItems(ctx, saleId) {
    try {
      const rows = await ctx.db.getAllAsync<SaleItemRow>(
        `SELECT * FROM sale_items
          WHERE sale_id = ? AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [saleId],
      );
      return rows.map(mapSaleItemRow);
    } catch (error) {
      throw wrapDbError("saleRepo.listItems", error);
    }
  },

  async create(ctx, input) {
    const saleDate = validateDate(input.saleDate);
    const items = input.items ?? [];
    for (const item of items) validateItem(item);
    const total = totalOf(items);

    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO sales (
            id, farm_id, customer_id, sale_date, due_date, reference,
            total, amount_paid, currency, status, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.customerId ?? null,
            saleDate,
            input.dueDate ?? null,
            input.reference ?? null,
            total,
            0,
            input.currency ?? "KES",
            input.status ?? "draft",
            input.notes ?? null,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );

        for (const item of items) {
          const itemBase = newBaseFields();
          const description = requireItemDescription(item.description);
          const lineTotal = lineTotalOf(item);
          await ctx.db.runAsync(
            `INSERT INTO sale_items (
              id, farm_id, sale_id, item_id, description,
              quantity, unit, unit_price, line_total,
              created_at, updated_at, deleted_at, version, sync_status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemBase.id,
              input.farmId,
              base.id,
              item.itemId ?? null,
              description,
              item.quantity,
              item.unit ?? null,
              item.unitPrice,
              lineTotal,
              itemBase.created_at,
              itemBase.updated_at,
              itemBase.deleted_at,
              itemBase.version,
              itemBase.sync_status,
              itemBase.metadata,
            ],
          );
        }

        await writeAudit(ctx, {
          entityType: "sale",
          entityId: base.id,
          action: "create",
          changes: {
            farmId: [null, input.farmId],
            total: [null, total],
            itemCount: [null, items.length],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("saleRepo.create", error);
    }

    const created = await saleRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("sale", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await saleRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("sale", id);

    if (patch.saleDate !== undefined) validateDate(patch.saleDate);
    if (patch.amountPaid !== undefined) {
      validateNonNegative(patch.amountPaid, "Amount paid");
    }
    if (patch.items !== undefined) {
      for (const item of patch.items) validateItem(item);
    }

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Sale,
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
      patch.customerId !== undefined &&
      patch.customerId !== existing.customerId
    ) {
      put("customer_id", patch.customerId, "customerId", patch.customerId);
    }
    if (patch.saleDate !== undefined && patch.saleDate !== existing.saleDate) {
      put("sale_date", patch.saleDate, "saleDate", patch.saleDate);
    }
    if (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate) {
      put("due_date", patch.dueDate, "dueDate", patch.dueDate);
    }
    if (
      patch.reference !== undefined &&
      patch.reference !== existing.reference
    ) {
      put("reference", patch.reference, "reference", patch.reference);
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      put("status", patch.status, "status", patch.status);
    }
    if (patch.notes !== undefined && patch.notes !== existing.notes) {
      put("notes", patch.notes, "notes", patch.notes);
    }
    if (
      patch.amountPaid !== undefined &&
      patch.amountPaid !== existing.amountPaid
    ) {
      put("amount_paid", patch.amountPaid, "amountPaid", patch.amountPaid);
    }

    if (patch.items !== undefined) {
      const nextTotal = totalOf(patch.items);
      if (nextTotal !== existing.total) {
        put("total", nextTotal, "total", nextTotal);
      }
    }

    const shouldReplaceItems = patch.items !== undefined;

    if (sets.length === 0 && !shouldReplaceItems) return existing;

    try {
      await ctx.db.withTransactionAsync(async () => {
        if (sets.length > 0) {
          sets.push("updated_at = ?", "version = version + 1");
          params.push(nowIso(), id);
          await ctx.db.runAsync(
            `UPDATE sales SET ${sets.join(", ")}
               WHERE id = ? AND deleted_at IS NULL`,
            params,
          );
        }

        if (shouldReplaceItems && patch.items) {
          await ctx.db.runAsync(
            `UPDATE sale_items
               SET deleted_at = ?, updated_at = ?, version = version + 1
             WHERE sale_id = ? AND deleted_at IS NULL`,
            [nowIso(), nowIso(), id],
          );
          for (const item of patch.items) {
            const itemBase = newBaseFields();
            const description = requireItemDescription(item.description);
            const lineTotal = lineTotalOf(item);
            await ctx.db.runAsync(
              `INSERT INTO sale_items (
                id, farm_id, sale_id, item_id, description,
                quantity, unit, unit_price, line_total,
                created_at, updated_at, deleted_at, version, sync_status, metadata
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                itemBase.id,
                existing.farmId,
                id,
                item.itemId ?? null,
                description,
                item.quantity,
                item.unit ?? null,
                item.unitPrice,
                lineTotal,
                itemBase.created_at,
                itemBase.updated_at,
                itemBase.deleted_at,
                itemBase.version,
                itemBase.sync_status,
                itemBase.metadata,
              ],
            );
          }
        }

        await writeAudit(ctx, {
          entityType: "sale",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("saleRepo.update", error);
    }

    const updated = await saleRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("sale", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await saleRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("sale", id);

    const ts = nowIso();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE sale_items
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE sale_id = ? AND deleted_at IS NULL`,
          [ts, ts, id],
        );
        await ctx.db.runAsync(
          `UPDATE sales
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [ts, ts, id],
        );
        await writeAudit(ctx, {
          entityType: "sale",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("saleRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    // Read the deleted timestamp first so we can restore the exact items
    // that were cascaded at the same moment. Items that were independently
    // deleted before the sale will not be resurrected.
    const row = await ctx.db.getFirstAsync<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM sales WHERE id = ? AND deleted_at IS NOT NULL`,
      [id],
    );
    if (!row || row.deleted_at === null) {
      throw new NotFoundError("sale", id);
    }
    const ts = row.deleted_at;

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE sale_items
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE sale_id = ? AND deleted_at = ?`,
          [nowIso(), id, ts],
        );
        await ctx.db.runAsync(
          `UPDATE sales
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "sale",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("saleRepo.restore", error);
    }

    const restored = await saleRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("sale", id);
    return restored;
  },
};
