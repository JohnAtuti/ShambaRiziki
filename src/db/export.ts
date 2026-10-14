import { wrapDbError, type RepoContext } from "./repository";
import type { DateWindow } from "./reports";

// ---------------------------------------------------------------------------
// Export — turns report data into RFC 4180 CSV strings.
//
// Returns strings, not files. Writing to disk and sharing is the caller's
// job (Phase 10.3), so this file has no dependency on expo-file-system
// and stays testable in isolation.
// ---------------------------------------------------------------------------

// ---- CSV primitives

/**
 * Quote a field if it contains a comma, quote, CR, or LF.
 * Doubles any internal quotes. Null and undefined become empty string.
 */
const csvField = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (
    s.indexOf(",") === -1 &&
    s.indexOf('"') === -1 &&
    s.indexOf("\n") === -1 &&
    s.indexOf("\r") === -1
  ) {
    return s;
  }
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * Join rows to RFC 4180 CSV. Rows already include their headers, so this
 * function only handles separators and line endings. Uses CRLF because
 * that is what Excel expects by default.
 */
const toCsv = (
  rows: readonly (readonly (string | number | null)[])[],
): string => rows.map((row) => row.map(csvField).join(",")).join("\r\n");

/** Amounts and monetary fields always carry two decimals in exports. */
const money = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : n.toFixed(2);

// ---- Row shapes from raw SQL

interface TransactionExportRow {
  transaction_date: string;
  transaction_type: string;
  amount: number;
  currency: string;
  account_name: string | null;
  transfer_account_name: string | null;
  category_name: string | null;
  description: string | null;
  payee: string | null;
  reference: string | null;
  target_type: string | null;
  target_label: string | null;
}

interface ProductionExportRow {
  record_date: string;
  animal_tag: string | null;
  animal_name: string | null;
  herd_name: string | null;
  production_type: string;
  quantity: number | null;
  quantity_unit: string | null;
  quality: string | null;
  weight_kg: number | null;
  notes: string | null;
}

// ---- SQL

const TRANSACTIONS_EXPORT_SQL = `
  SELECT
    t.transaction_date         AS transaction_date,
    t.transaction_type         AS transaction_type,
    t.amount                   AS amount,
    t.currency                 AS currency,
    a.name                     AS account_name,
    ta.name                    AS transfer_account_name,
    c.name                     AS category_name,
    t.description              AS description,
    t.payee                    AS payee,
    t.reference                AS reference,
    t.target_type              AS target_type,
    t.target_label             AS target_label
  FROM finance_transactions t
  LEFT JOIN finance_accounts   a  ON a.id  = t.account_id
  LEFT JOIN finance_accounts   ta ON ta.id = t.transfer_account_id
  LEFT JOIN finance_categories c  ON c.id  = t.category_id
  WHERE t.farm_id = ?
    AND t.transaction_date >= ?
    AND t.transaction_date <= ?
    AND t.deleted_at IS NULL
  ORDER BY t.transaction_date DESC, t.created_at DESC
`;

const PRODUCTION_EXPORT_SQL = `
  SELECT
    p.record_date              AS record_date,
    a.tag_id                   AS animal_tag,
    a.name                     AS animal_name,
    h.name                     AS herd_name,
    p.production_type          AS production_type,
    p.quantity                 AS quantity,
    p.quantity_unit            AS quantity_unit,
    p.quality                  AS quality,
    p.weight_kg                AS weight_kg,
    p.notes                    AS notes
  FROM animal_production_records p
  LEFT JOIN animals a ON a.id = p.animal_id
  LEFT JOIN herds   h ON h.id = p.herd_id
  WHERE p.farm_id = ?
    AND p.record_date >= ?
    AND p.record_date <= ?
    AND p.deleted_at IS NULL
  ORDER BY p.record_date DESC, p.created_at DESC
`;

// ---- Public API

export interface ExportRepo {
  /** One row per transaction with category and account names resolved. */
  exportTransactionsCsv(
    ctx: RepoContext,
    farmId: string,
    window: DateWindow,
  ): Promise<string>;

  /** One row per plot with income, expense, and net. */
  exportPlotProfitCsv(
    ctx: RepoContext,
    farmId: string,
    window: DateWindow,
  ): Promise<string>;

  /** One row per production record with animal and herd context. */
  exportAnimalProductionCsv(
    ctx: RepoContext,
    farmId: string,
    window: DateWindow,
  ): Promise<string>;
}

/**
 * Suggested filename — no path, no extension validation, just the leaf
 * name. Kept pure so it can be unit-tested later.
 */
export const exportFilename = (kind: string, extension = "csv"): string => {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const safe = kind.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `shamba-${safe}-${date}.${extension}`;
};

export const exportRepo: ExportRepo = {
  async exportTransactionsCsv(ctx, farmId, window) {
    try {
      const rows = await ctx.db.getAllAsync<TransactionExportRow>(
        TRANSACTIONS_EXPORT_SQL,
        [farmId, window.from, window.to],
      );
      const out: (string | number | null)[][] = [
        [
          "Date",
          "Type",
          "Amount",
          "Currency",
          "Account",
          "Transfer To",
          "Category",
          "Description",
          "Payee",
          "Reference",
          "Target Type",
          "Target Label",
        ],
      ];
      for (const r of rows) {
        out.push([
          r.transaction_date,
          r.transaction_type,
          money(r.amount),
          r.currency,
          r.account_name,
          r.transfer_account_name,
          r.category_name,
          r.description,
          r.payee,
          r.reference,
          r.target_type,
          r.target_label,
        ]);
      }
      return toCsv(out);
    } catch (error) {
      throw wrapDbError("exportRepo.exportTransactionsCsv", error);
    }
  },

  async exportPlotProfitCsv(ctx, farmId, window) {
    try {
      // Reuse the reports query through the same SQL shape as
      // reportsRepo.getProfitByTarget("plot"), so exports and dashboards
      // cannot silently diverge.
      const rows = await ctx.db.getAllAsync<{
        target_id: string | null;
        target_label: string | null;
        income: number | null;
        expense: number | null;
      }>(
        `SELECT
           target_id                                       AS target_id,
           MAX(target_label)                               AS target_label,
           COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
             AS income,
           COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
             AS expense
         FROM finance_transactions
         WHERE farm_id = ?
           AND target_type = 'plot'
           AND transaction_date >= ?
           AND transaction_date <= ?
           AND deleted_at IS NULL
           AND target_id IS NOT NULL
         GROUP BY target_id
         ORDER BY (income - expense) DESC`,
        [farmId, window.from, window.to],
      );
      const out: (string | number | null)[][] = [
        ["Plot", "Income", "Expense", "Net"],
      ];
      for (const r of rows) {
        const income = r.income ?? 0;
        const expense = r.expense ?? 0;
        out.push([
          r.target_label ?? r.target_id ?? "",
          money(income),
          money(expense),
          money(income - expense),
        ]);
      }
      return toCsv(out);
    } catch (error) {
      throw wrapDbError("exportRepo.exportPlotProfitCsv", error);
    }
  },

  async exportAnimalProductionCsv(ctx, farmId, window) {
    try {
      const rows = await ctx.db.getAllAsync<ProductionExportRow>(
        PRODUCTION_EXPORT_SQL,
        [farmId, window.from, window.to],
      );
      const out: (string | number | null)[][] = [
        [
          "Date",
          "Animal Tag",
          "Animal Name",
          "Herd",
          "Production Type",
          "Quantity",
          "Unit",
          "Quality",
          "Weight (kg)",
          "Notes",
        ],
      ];
      for (const r of rows) {
        out.push([
          r.record_date,
          r.animal_tag,
          r.animal_name,
          r.herd_name,
          r.production_type,
          r.quantity ?? "",
          r.quantity_unit,
          r.quality,
          r.weight_kg ?? "",
          r.notes,
        ]);
      }
      return toCsv(out);
    } catch (error) {
      throw wrapDbError("exportRepo.exportAnimalProductionCsv", error);
    }
  },
};
