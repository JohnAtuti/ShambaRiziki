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
  mapFinanceAccountRow,
  type FinanceAccount,
  type FinanceAccountRow,
  type FinanceAccountType,
} from "./types";

export interface CreateAccountInput {
  farmId: string;
  name: string;
  accountType?: FinanceAccountType;
  openingBalance?: number;
  currency?: string;
  accountNumber?: string | null;
  institutionName?: string | null;
  notes?: string | null;
}

export interface UpdateAccountInput {
  name?: string;
  accountType?: FinanceAccountType;
  openingBalance?: number;
  currency?: string;
  accountNumber?: string | null;
  institutionName?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface AccountBalance {
  accountId: string;
  openingBalance: number;
  balance: number;
}

export interface AccountBalanceRow {
  account_id: string;
  opening_balance: number;
  balance: number;
}

export interface FinanceAccountRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<FinanceAccount[]>;
  listActiveByFarm(ctx: RepoContext, farmId: string): Promise<FinanceAccount[]>;
  getById(ctx: RepoContext, id: string): Promise<FinanceAccount | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateAccountInput): Promise<FinanceAccount>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateAccountInput,
  ): Promise<FinanceAccount>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<FinanceAccount>;
  /** Total current balance for one account = opening + net movements. */
  getBalance(ctx: RepoContext, accountId: string): Promise<number>;
  /** Balances for every account on a farm, in one query. */
  getBalances(ctx: RepoContext, farmId: string): Promise<AccountBalance[]>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Account name is required");
  if (trimmed.length > 100) {
    throw new ValidationError("Account name is too long");
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

/**
 * Net movement for one account, computed from every non-deleted transaction
 * that touches the account either as source or as transfer destination.
 *
 *   income:               +amount
 *   expense:              -amount
 *   transfer (source):    -amount
 *   transfer (destination): +amount
 *
 * Expressed as a single SQL expression so both getBalance and getBalances
 * use identical arithmetic.
 */
const NET_MOVEMENT_SQL = `
  CASE transaction_type
    WHEN 'income'   THEN amount
    WHEN 'expense'  THEN -amount
    WHEN 'transfer' THEN -amount
    ELSE 0
  END
`;

const TRANSFER_IN_SQL = `
  CASE transaction_type
    WHEN 'transfer' THEN amount
    ELSE 0
  END
`;

export const financeAccountRepo: FinanceAccountRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceAccountRow>(
        `SELECT * FROM finance_accounts
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapFinanceAccountRow);
    } catch (error) {
      throw wrapDbError("financeAccountRepo.listByFarm", error);
    }
  },

  async listActiveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<FinanceAccountRow>(
        `SELECT * FROM finance_accounts
          WHERE farm_id = ? AND is_active = 1 AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapFinanceAccountRow);
    } catch (error) {
      throw wrapDbError("financeAccountRepo.listActiveByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<FinanceAccountRow>(
        `SELECT * FROM finance_accounts WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapFinanceAccountRow(row) : null;
    } catch (error) {
      throw wrapDbError("financeAccountRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM finance_accounts
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("financeAccountRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    validateNonNegative(input.openingBalance, "Opening balance");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO finance_accounts (
            id, farm_id, name, account_type, opening_balance, currency,
            account_number, institution_name, is_active, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.accountType ?? "cash",
            input.openingBalance ?? 0,
            input.currency ?? "KES",
            input.accountNumber ?? null,
            input.institutionName ?? null,
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
          entityType: "finance_account",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("financeAccountRepo.create", error);
    }

    const created = await financeAccountRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("finance_account", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await financeAccountRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_account", id);

    validateNonNegative(patch.openingBalance, "Opening balance");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof FinanceAccount,
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
    if (
      patch.accountType !== undefined &&
      patch.accountType !== existing.accountType
    ) {
      put("account_type", patch.accountType, "accountType", patch.accountType);
    }
    if (
      patch.openingBalance !== undefined &&
      patch.openingBalance !== existing.openingBalance
    ) {
      put(
        "opening_balance",
        patch.openingBalance,
        "openingBalance",
        patch.openingBalance,
      );
    }
    if (patch.currency !== undefined && patch.currency !== existing.currency) {
      put("currency", patch.currency, "currency", patch.currency);
    }
    if (
      patch.accountNumber !== undefined &&
      patch.accountNumber !== existing.accountNumber
    ) {
      put(
        "account_number",
        patch.accountNumber,
        "accountNumber",
        patch.accountNumber,
      );
    }
    if (
      patch.institutionName !== undefined &&
      patch.institutionName !== existing.institutionName
    ) {
      put(
        "institution_name",
        patch.institutionName,
        "institutionName",
        patch.institutionName,
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
          `UPDATE finance_accounts SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "finance_account",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("financeAccountRepo.update", error);
    }

    const updated = await financeAccountRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("finance_account", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await financeAccountRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("finance_account", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_accounts
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_account",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeAccountRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE finance_accounts
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "finance_account",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("financeAccountRepo.restore", error);
    }

    const restored = await financeAccountRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("finance_account", id);
    return restored;
  },

  async getBalance(ctx, accountId) {
    try {
      const acct = await ctx.db.getFirstAsync<{ opening_balance: number }>(
        `SELECT opening_balance FROM finance_accounts
          WHERE id = ? AND deleted_at IS NULL`,
        [accountId],
      );
      if (!acct) return 0;

      const row = await ctx.db.getFirstAsync<{ net: number | null }>(
        `SELECT COALESCE(SUM(${NET_MOVEMENT_SQL}), 0) AS net
           FROM finance_transactions
          WHERE account_id = ? AND deleted_at IS NULL`,
        [accountId],
      );

      const incoming = await ctx.db.getFirstAsync<{ net: number | null }>(
        `SELECT COALESCE(SUM(${TRANSFER_IN_SQL}), 0) AS net
           FROM finance_transactions
          WHERE transfer_account_id = ? AND deleted_at IS NULL`,
        [accountId],
      );

      return (
        (acct.opening_balance ?? 0) + (row?.net ?? 0) + (incoming?.net ?? 0)
      );
    } catch (error) {
      throw wrapDbError("financeAccountRepo.getBalance", error);
    }
  },

  async getBalances(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AccountBalanceRow>(
        `SELECT
            a.id AS account_id,
            a.opening_balance AS opening_balance,
            a.opening_balance
              + COALESCE((
                  SELECT SUM(${NET_MOVEMENT_SQL})
                    FROM finance_transactions t
                   WHERE t.account_id = a.id
                     AND t.deleted_at IS NULL
                ), 0)
              + COALESCE((
                  SELECT SUM(${TRANSFER_IN_SQL})
                    FROM finance_transactions t
                   WHERE t.transfer_account_id = a.id
                     AND t.deleted_at IS NULL
                ), 0)
            AS balance
          FROM finance_accounts a
         WHERE a.farm_id = ? AND a.deleted_at IS NULL
         ORDER BY a.name ASC`,
        [farmId],
      );

      return rows.map((r) => ({
        accountId: r.account_id,
        openingBalance: r.opening_balance ?? 0,
        balance: r.balance ?? 0,
      }));
    } catch (error) {
      throw wrapDbError("financeAccountRepo.getBalances", error);
    }
  },
};
