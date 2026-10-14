import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import { mapCustomerRow, type Customer, type CustomerRow } from "./types";

export interface CreateCustomerInput {
  farmId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CustomerRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Customer[]>;
  listActiveByFarm(ctx: RepoContext, farmId: string): Promise<Customer[]>;
  getById(ctx: RepoContext, id: string): Promise<Customer | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateCustomerInput): Promise<Customer>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateCustomerInput,
  ): Promise<Customer>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Customer>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Customer name is required");
  if (trimmed.length > 100) {
    throw new ValidationError("Customer name is too long");
  }
  return trimmed;
};

export const customerRepo: CustomerRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CustomerRow>(
        `SELECT * FROM customers
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapCustomerRow);
    } catch (error) {
      throw wrapDbError("customerRepo.listByFarm", error);
    }
  },

  async listActiveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<CustomerRow>(
        `SELECT * FROM customers
          WHERE farm_id = ? AND is_active = 1 AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapCustomerRow);
    } catch (error) {
      throw wrapDbError("customerRepo.listActiveByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<CustomerRow>(
        `SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapCustomerRow(row) : null;
    } catch (error) {
      throw wrapDbError("customerRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM customers
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("customerRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO customers (
            id, farm_id, name, phone, email, address, notes,
            is_active, created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.phone ?? null,
            input.email ?? null,
            input.address ?? null,
            input.notes ?? null,
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
          entityType: "customer",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("customerRepo.create", error);
    }

    const created = await customerRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("customer", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await customerRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("customer", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Customer,
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
    if (patch.phone !== undefined && patch.phone !== existing.phone) {
      put("phone", patch.phone, "phone", patch.phone);
    }
    if (patch.email !== undefined && patch.email !== existing.email) {
      put("email", patch.email, "email", patch.email);
    }
    if (patch.address !== undefined && patch.address !== existing.address) {
      put("address", patch.address, "address", patch.address);
    }
    if (patch.notes !== undefined && patch.notes !== existing.notes) {
      put("notes", patch.notes, "notes", patch.notes);
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
          `UPDATE customers SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "customer",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("customerRepo.update", error);
    }

    const updated = await customerRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("customer", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await customerRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("customer", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE customers
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "customer",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("customerRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE customers
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "customer",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("customerRepo.restore", error);
    }

    const restored = await customerRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("customer", id);
    return restored;
  },
};
