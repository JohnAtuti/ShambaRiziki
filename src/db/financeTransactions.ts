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
  mapFinanceTransactionRow,
  type FinanceTargetType,
  type FinanceTransaction,
  type FinanceTransactionRow,
  type FinanceTransactionType,
} from "./types";

export interface CreateTransactionInput {
  farmId: string;
  accountId: string;
  categoryId?: string | null;
  transferAccountId?: string | null;
  transactionType: FinanceTransactionType;
  transactionDate: string;
  amount: number;
  currency?: string;
  description?: string | null;
  reference?: string | null;
  payee?: string | null;
  targetType?: FinanceTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}

export interface UpdateTransactionInput {
  accountId?: string;
  categoryId?: string | null;
  transferAccountId?: string | null;
  transactionType?: FinanceTransactionType;
  transactionDate?: string;
  amount?: number;
  currency?: string;
  description?: string | null;
  reference?: string | null;
  payee?: string | null;
  targetType?: FinanceTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}

export interface CategoryTotal {
  categoryId: string | null;
  categoryName: string;
  categoryType: string;
  total: number;
}

export interface TargetTotal {
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  income: number;
  expense: number;
  net: number;
}

export interface FinanceTransactionRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<FinanceTransaction[]>;
  listByAccount(
    ctx: RepoContext,
    accountId: string,
  ): Promise<FinanceTransaction[]>;
  listByCategory(
    ctx: RepoContext,
    categoryId: string,
  ): Promise<FinanceTransaction[]>;
  listByTarget(
    ctx: RepoContext,
    targetType: FinanceTargetType,
    targetId: string,
  ): Promise<FinanceTransaction[]>;
  listBetween(
    ctx: RepoContext,
    farmId: string,
    fromIso: string,
    toIso: string,
  ): Promise<FinanceTransaction[]>;
  getById(ctx: RepoContext, id: string): Promise<FinanceTransaction | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  /** Totals per category within a date range — income or expense. */
  totalsByCategory(
    ctx: RepoContext,
    farmId: string,
    type: FinanceTransactionType,
    fromIso: string,
    toIso: string,
  ): Promise<CategoryTotal[]>;
  /** Income, expense, and net per target — the profit-per-plot primitive. */
  totalsByTarget(
    ctx: RepoContext,
    farmId: string,
    fromIso: string,
    toIso: string,
  ): Promise<TargetTotal[]>;
  create(
    ctx: RepoContext,
    input: CreateTransactionInput,
  ): Promise<FinanceTransaction>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateTransactionInput,
  ): Promise<FinanceTransaction>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<FinanceTransaction>;
}

const validateDate = (iso: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError("Transaction date is required");
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Transaction date must be a valid date");
  }
  return trimmed;
};

const validateAmount = (amount: number): void => {
  if (!Number.isFinite(amount)) {
    throw new ValidationError("Amount must be a number");
  }
  if (amount <= 0) {
    throw new ValidationError("Amount must be positive");
  }
};

const validateTransfer = (
  type: FinanceTransactionType,
  accountId: string,
  transferAccountId: string | null | undefined,
): void => {
  if (type !== "transfer") return;
  if (!transferAccountId) {
    throw new ValidationError("Transfer requires a destination account");
  }
  if (transferAccountId === accountId) {
    throw new ValidationError("Cannot transfer to the same account");
  }
};

export const financeTransactionRepo: FinanceTransactionRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [farmId],
      );
      return rows.map(mapFinanceTransactionRow);
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.listByFarm", error);
    }
  },

  async listByAccount(ctx, accountId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE (account_id = ? OR transfer_account_id = ?)
            AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [accountId, accountId],
      );
      return rows.map(mapFinanceTransactionRow);
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.listByAccount", error);
    }
  },

  async listByCategory(ctx, categoryId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE category_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [categoryId],
      );
      return rows.map(mapFinanceTransactionRow);
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.listByCategory", error);
    }
  },

  async listByTarget(ctx, targetType, targetId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE target_type = ? AND target_id = ? AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [targetType, targetId],
      );
      return rows.map(mapFinanceTransactionRow);
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.listByTarget", error);
    }
  },

  async listBetween(ctx, farmId, fromIso, toIso) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE farm_id = ?
            AND transaction_date >= ?
            AND transaction_date <= ?
            AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC`,
        [farmId, fromIso, toIso],
      );
      return rows.map(mapFinanceTransactionRow);
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.listBetween", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<FinanceTransactionRow>(
        `SELECT * FROM finance_transactions
          WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapFinanceTransactionRow(row) : null;
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM finance_transactions
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.countByFarm", error);
    }
  },

  async totalsByCategory(ctx, farmId, type, fromIso, toIso) {
    try {
      const rows = await ctx.db.getAllAsync<{
        category_id: string | null;
        category_name: string | null;
        category_type: string | null;
        total: number;
      }>(
        `SELECT
            t.category_id                                   AS category_id,
            c.name                                          AS category_name,
            c.category_type                                 AS category_type,
            COALESCE(SUM(t.amount), 0)                      AS total
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
          WHERE t.farm_id = ?
            AND t.transaction_type = ?
            AND t.transaction_date >= ?
            AND t.transaction_date <= ?
            AND t.deleted_at IS NULL
          GROUP BY t.category_id, c.name, c.category_type
          ORDER BY total DESC`,
        [farmId, type, fromIso, toIso],
      );

      return rows.map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name ?? "Uncategorized",
        categoryType: r.category_type ?? type,
        total: r.total ?? 0,
      }));
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.totalsByCategory", error);
    }
  },

  async totalsByTarget(ctx, farmId, fromIso, toIso) {
    try {
      const rows = await ctx.db.getAllAsync<{
        target_type: string | null;
        target_id: string | null;
        target_label: string | null;
        income: number;
        expense: number;
      }>(
        `SELECT
            target_type                    AS target_type,
            target_id                      AS target_id,
            MAX(target_label)              AS target_label,
            COALESCE(SUM(CASE WHEN transaction_type = 'income'
                              THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN transaction_type = 'expense'
                              THEN amount ELSE 0 END), 0) AS expense
           FROM finance_transactions
          WHERE farm_id = ?
            AND transaction_date >= ?
            AND transaction_date <= ?
            AND deleted_at IS NULL
            AND target_type IS NOT NULL
          GROUP BY target_type, target_id
          ORDER BY (income - expense) DESC`,
        [farmId, fromIso, toIso],
      );

      return rows.map((r) => ({
        targetType: r.target_type,
        targetId: r.target_id,
        targetLabel: r.target_label,
        income: r.income ?? 0,
        expense: r.expense ?? 0,
        net: (r.income ?? 0) - (r.expense ?? 0),
      }));
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.totalsByTarget", error);
    }
  },

  async create(ctx, input) {
    const transactionDate = validateDate(input.transactionDate);
    validateAmount(input.amount);
    validateTransfer(
      input.transactionType,
      input.accountId,
      input.transferAccountId,
    );

    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO finance_transactions (
            id, farm_id, account_id, category_id, transfer_account_id,
            transaction_type, transaction_date, amount, currency,
            description, reference, payee,
            target_type, target_id, target_label, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.accountId,
            input.transactionType === "transfer"
              ? null
              : (input.categoryId ?? null),
            input.transactionType === "transfer"
              ? (input.transferAccountId ?? null)
              : null,
            input.transactionType,
            transactionDate,
            input.amount,
            input.currency ?? "KES",
            input.description ?? null,
            input.reference ?? null,
            input.payee ?? null,
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
          entityType: "finance_transaction",
          entityId: base.id,
          action: "create",
          changes: {
            transactionType: [null, input.transactionType],
            amount: [null, input.amount],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.create", error);
    }

    const created = await financeTransactionRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("finance_transaction", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await financeTransactionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_transaction", id);

    if (patch.transactionDate !== undefined) {
      validateDate(patch.transactionDate);
    }
    if (patch.amount !== undefined) {
      validateAmount(patch.amount);
    }

    const nextType = patch.transactionType ?? existing.transactionType;
    const nextAccountId = patch.accountId ?? existing.accountId;
    const nextTransferId =
      patch.transferAccountId !== undefined
        ? patch.transferAccountId
        : existing.transferAccountId;
    validateTransfer(nextType, nextAccountId, nextTransferId);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof FinanceTransaction,
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
      patch.accountId !== undefined &&
      patch.accountId !== existing.accountId
    ) {
      put("account_id", patch.accountId, "accountId", patch.accountId);
    }
    if (
      patch.categoryId !== undefined &&
      patch.categoryId !== existing.categoryId
    ) {
      put("category_id", patch.categoryId, "categoryId", patch.categoryId);
    }
    if (
      patch.transferAccountId !== undefined &&
      patch.transferAccountId !== existing.transferAccountId
    ) {
      put(
        "transfer_account_id",
        patch.transferAccountId,
        "transferAccountId",
        patch.transferAccountId,
      );
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
    if (patch.amount !== undefined && patch.amount !== existing.amount) {
      put("amount", patch.amount, "amount", patch.amount);
    }
    if (patch.currency !== undefined && patch.currency !== existing.currency) {
      put("currency", patch.currency, "currency", patch.currency);
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      put("description", patch.description, "description", patch.description);
    }
    if (
      patch.reference !== undefined &&
      patch.reference !== existing.reference
    ) {
      put("reference", patch.reference, "reference", patch.reference);
    }
    if (patch.payee !== undefined && patch.payee !== existing.payee) {
      put("payee", patch.payee, "payee", patch.payee);
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
          `UPDATE finance_transactions SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "finance_transaction",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.update", error);
    }

    const updated = await financeTransactionRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("finance_transaction", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await financeTransactionRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_transaction", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_transactions
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_transaction",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_transactions
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_transaction",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeTransactionRepo.restore", error);
    }

    const restored = await financeTransactionRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("finance_transaction", id);
    return restored;
  },
};
