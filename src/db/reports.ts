import { nowIso } from "./time";
import { wrapDbError, type RepoContext } from "./repository";
import type { ProductionType } from "./types";

// ---------------------------------------------------------------------------
// Reports — read-only aggregates over finance_transactions.
//
// This file intentionally contains no writes and no state. Every function
// takes (ctx, farmId, window) and returns plain data. UI layers wrap them.
// ---------------------------------------------------------------------------

// ---- Public types

export interface DateWindow {
  from: string; // ISO 8601
  to: string; // ISO 8601
}

export type PeriodKey = "this_month" | "this_season" | "this_year" | "all_time";

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
}

export interface TargetProfit {
  targetId: string;
  targetLabel: string;
  income: number;
  expense: number;
  net: number;
}

export interface MonthlySeriesPoint {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  net: number;
}

export type FinanceTargetKind = "plot" | "animal" | "herd" | "item";

/**
 * Economics for a single crop cycle: what was spent, how much was
 * harvested, and the implied cost per unit of yield.
 *
 * `costPerUnit` is null whenever the number would be meaningless:
 *   - no yield recorded (yieldQty === 0)
 *   - harvest activities recorded in more than one unit (mixed)
 */
export interface CycleEconomics {
  cycleId: string;
  cost: number;
  yieldQty: number;
  yieldUnit: string | null;
  yieldUnitsMixed: boolean;
  costPerUnit: number | null;
}

/**
 * Economics for a single animal over a production type (milk, eggs, …).
 * Same null-honesty rule as CycleEconomics.
 */
export interface AnimalEconomics {
  animalId: string;
  productionType: ProductionType;
  cost: number;
  yieldQty: number;
  yieldUnit: string | null;
  yieldUnitsMixed: boolean;
  costPerUnit: number | null;
}

// ---- Row shapes (what SQLite returns before mapping)

interface PeriodSummaryRow {
  income: number | null;
  expense: number | null;
}

interface TargetProfitRow {
  target_id: string | null;
  target_label: string | null;
  income: number | null;
  expense: number | null;
}

interface MonthlySeriesRow {
  month: string | null;
  income: number | null;
  expense: number | null;
}

interface CostRow {
  cost: number | null;
}

interface YieldRow {
  yield_qty: number | null;
  unit_count: number | null;
  yield_unit: string | null;
}

// ---- Date window helper

const startOfMonthUtc = (year: number, month: number): string =>
  new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();

const endOfMonthUtc = (year: number, month: number): string =>
  new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).toISOString();

/**
 * Build a DateWindow for one of the standard periods.
 *
 * "this_season" = the last six months, rolling. Kenya has two rainy seasons
 * and no single agreed farm-year start, so a rolling window is less arbitrary
 * than picking calendar months that fit only half the country.
 *
 * "all_time" starts at the Unix epoch because every stored transaction_date
 * is an ISO 8601 string in this app, and any string sort compares correctly
 * against "1970-01-01T00:00:00.000Z".
 */
export const windowForPeriod = (key: PeriodKey): DateWindow => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (key) {
    case "this_month":
      return { from: startOfMonthUtc(y, m), to: endOfMonthUtc(y, m) };

    case "this_year":
      return { from: startOfMonthUtc(y, 0), to: endOfMonthUtc(y, 11) };

    case "this_season": {
      const from = new Date(now);
      from.setUTCMonth(from.getUTCMonth() - 6);
      return { from: from.toISOString(), to: nowIso() };
    }

    case "all_time":
    default:
      return { from: "1970-01-01T00:00:00.000Z", to: nowIso() };
  }
};

// ---- SQL
//
// Transfers are deliberately excluded from every income/expense aggregate:
// a transfer moves money between the farmer's own accounts and neither earns
// nor spends anything at the farm level. Including them would double-count.

const SUMMARY_SQL = `
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
      AS income,
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
      AS expense
  FROM finance_transactions
  WHERE farm_id = ?
    AND transaction_date >= ?
    AND transaction_date <= ?
    AND deleted_at IS NULL
    AND transaction_type IN ('income', 'expense')
`;

const TARGET_PROFIT_SQL = `
  SELECT
    target_id                                         AS target_id,
    MAX(target_label)                                 AS target_label,
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
      AS income,
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
      AS expense
  FROM finance_transactions
  WHERE farm_id = ?
    AND target_type = ?
    AND transaction_date >= ?
    AND transaction_date <= ?
    AND deleted_at IS NULL
    AND target_id IS NOT NULL
  GROUP BY target_id
  ORDER BY (income - expense) DESC
`;

const MONTHLY_SERIES_SQL = `
  SELECT
    substr(transaction_date, 1, 7)                    AS month,
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
      AS income,
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
      AS expense
  FROM finance_transactions
  WHERE farm_id = ?
    AND transaction_date >= ?
    AND transaction_date <= ?
    AND deleted_at IS NULL
    AND transaction_type IN ('income', 'expense')
  GROUP BY substr(transaction_date, 1, 7)
  ORDER BY month ASC
`;

const FORECAST_SQL = `
  SELECT
    substr(transaction_date, 1, 7)                    AS month,
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
      AS income,
    COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)
      AS expense
  FROM finance_transactions
  WHERE farm_id = ?
    AND transaction_date > ?
    AND deleted_at IS NULL
    AND transaction_type IN ('income', 'expense')
  GROUP BY substr(transaction_date, 1, 7)
  ORDER BY month ASC
  LIMIT ?
`;

const TARGET_COST_SQL = `
  SELECT COALESCE(SUM(amount), 0) AS cost
  FROM finance_transactions
  WHERE farm_id = ?
    AND transaction_type = 'expense'
    AND target_type = ?
    AND target_id = ?
    AND transaction_date >= ?
    AND transaction_date <= ?
    AND deleted_at IS NULL
`;

const CYCLE_YIELD_SQL = `
  SELECT
    COALESCE(SUM(quantity), 0)        AS yield_qty,
    COUNT(DISTINCT quantity_unit)     AS unit_count,
    MAX(quantity_unit)                AS yield_unit
  FROM crop_activities
  WHERE cycle_id = ?
    AND activity_type = 'harvest'
    AND deleted_at IS NULL
`;

const ANIMAL_YIELD_SQL = `
  SELECT
    COALESCE(SUM(quantity), 0)        AS yield_qty,
    COUNT(DISTINCT quantity_unit)     AS unit_count,
    MAX(quantity_unit)                AS yield_unit
  FROM animal_production_records
  WHERE animal_id = ?
    AND production_type = ?
    AND record_date >= ?
    AND record_date <= ?
    AND deleted_at IS NULL
`;

// ---- Mappers

const toSeriesPoint = (row: MonthlySeriesRow): MonthlySeriesPoint | null => {
  if (row.month === null) return null;
  const income = row.income ?? 0;
  const expense = row.expense ?? 0;
  return {
    month: row.month,
    income,
    expense,
    net: income - expense,
  };
};

const computeCostPerUnit = (
  cost: number,
  yieldQty: number,
  unitCount: number,
): number | null => {
  if (yieldQty <= 0) return null;
  if (unitCount > 1) return null;
  return cost / yieldQty;
};

// ---- Repo

export interface ReportsRepo {
  /** Total income, expense, and net for a window. Transfers excluded. */
  getPeriodSummary(
    ctx: RepoContext,
    farmId: string,
    window: DateWindow,
  ): Promise<PeriodSummary>;

  /** Profit grouped by a target kind (plot, animal, herd, or item). */
  getProfitByTarget(
    ctx: RepoContext,
    farmId: string,
    kind: FinanceTargetKind,
    window: DateWindow,
  ): Promise<TargetProfit[]>;

  /** One point per calendar month that has at least one transaction. */
  getMonthlySeries(
    ctx: RepoContext,
    farmId: string,
    window: DateWindow,
  ): Promise<MonthlySeriesPoint[]>;

  /**
   * Forward-looking months with pre-recorded future-dated transactions.
   * Not a projection — a projection would need recurring-finance entries,
   * which the schema does not yet support. This just surfaces what is
   * already scheduled for the future, up to `months` months out.
   */
  getForecast(
    ctx: RepoContext,
    farmId: string,
    months: number,
  ): Promise<MonthlySeriesPoint[]>;

  /**
   * Economics for one crop cycle: expenses tagged target_type='crop_cycle'
   * divided by the sum of harvest activities' quantities.
   */
  getCycleEconomics(
    ctx: RepoContext,
    farmId: string,
    cycleId: string,
    window: DateWindow,
  ): Promise<CycleEconomics>;

  /**
   * Economics for one animal over one production type (typically "milk").
   * Expenses tagged target_type='animal' divided by summed production.
   */
  getAnimalEconomics(
    ctx: RepoContext,
    farmId: string,
    animalId: string,
    productionType: ProductionType,
    window: DateWindow,
  ): Promise<AnimalEconomics>;
}

export const reportsRepo: ReportsRepo = {
  async getPeriodSummary(ctx, farmId, window) {
    try {
      const row = await ctx.db.getFirstAsync<PeriodSummaryRow>(SUMMARY_SQL, [
        farmId,
        window.from,
        window.to,
      ]);
      const income = row?.income ?? 0;
      const expense = row?.expense ?? 0;
      return { income, expense, net: income - expense };
    } catch (error) {
      throw wrapDbError("reportsRepo.getPeriodSummary", error);
    }
  },

  async getProfitByTarget(ctx, farmId, kind, window) {
    try {
      const rows = await ctx.db.getAllAsync<TargetProfitRow>(
        TARGET_PROFIT_SQL,
        [farmId, kind, window.from, window.to],
      );
      const out: TargetProfit[] = [];
      for (const r of rows) {
        if (r.target_id === null) continue;
        const income = r.income ?? 0;
        const expense = r.expense ?? 0;
        out.push({
          targetId: r.target_id,
          targetLabel: r.target_label ?? r.target_id,
          income,
          expense,
          net: income - expense,
        });
      }
      return out;
    } catch (error) {
      throw wrapDbError("reportsRepo.getProfitByTarget", error);
    }
  },

  async getMonthlySeries(ctx, farmId, window) {
    try {
      const rows = await ctx.db.getAllAsync<MonthlySeriesRow>(
        MONTHLY_SERIES_SQL,
        [farmId, window.from, window.to],
      );
      const out: MonthlySeriesPoint[] = [];
      for (const r of rows) {
        const point = toSeriesPoint(r);
        if (point) out.push(point);
      }
      return out;
    } catch (error) {
      throw wrapDbError("reportsRepo.getMonthlySeries", error);
    }
  },

  async getForecast(ctx, farmId, months) {
    try {
      const rows = await ctx.db.getAllAsync<MonthlySeriesRow>(FORECAST_SQL, [
        farmId,
        nowIso(),
        months,
      ]);
      const out: MonthlySeriesPoint[] = [];
      for (const r of rows) {
        const point = toSeriesPoint(r);
        if (point) out.push(point);
      }
      return out;
    } catch (error) {
      throw wrapDbError("reportsRepo.getForecast", error);
    }
  },

  async getCycleEconomics(ctx, farmId, cycleId, window) {
    try {
      const [costRow, yieldRow] = await Promise.all([
        ctx.db.getFirstAsync<CostRow>(TARGET_COST_SQL, [
          farmId,
          "crop_cycle",
          cycleId,
          window.from,
          window.to,
        ]),
        ctx.db.getFirstAsync<YieldRow>(CYCLE_YIELD_SQL, [cycleId]),
      ]);
      const cost = costRow?.cost ?? 0;
      const yieldQty = yieldRow?.yield_qty ?? 0;
      const unitCount = yieldRow?.unit_count ?? 0;
      const yieldUnit = yieldRow?.yield_unit ?? null;
      const costPerUnit = computeCostPerUnit(cost, yieldQty, unitCount);
      return {
        cycleId,
        cost,
        yieldQty,
        yieldUnit,
        yieldUnitsMixed: unitCount > 1,
        costPerUnit,
      };
    } catch (error) {
      throw wrapDbError("reportsRepo.getCycleEconomics", error);
    }
  },

  async getAnimalEconomics(ctx, farmId, animalId, productionType, window) {
    try {
      const [costRow, yieldRow] = await Promise.all([
        ctx.db.getFirstAsync<CostRow>(TARGET_COST_SQL, [
          farmId,
          "animal",
          animalId,
          window.from,
          window.to,
        ]),
        ctx.db.getFirstAsync<YieldRow>(ANIMAL_YIELD_SQL, [
          animalId,
          productionType,
          window.from,
          window.to,
        ]),
      ]);
      const cost = costRow?.cost ?? 0;
      const yieldQty = yieldRow?.yield_qty ?? 0;
      const unitCount = yieldRow?.unit_count ?? 0;
      const yieldUnit = yieldRow?.yield_unit ?? null;
      const costPerUnit = computeCostPerUnit(cost, yieldQty, unitCount);
      return {
        animalId,
        productionType,
        cost,
        yieldQty,
        yieldUnit,
        yieldUnitsMixed: unitCount > 1,
        costPerUnit,
      };
    } catch (error) {
      throw wrapDbError("reportsRepo.getAnimalEconomics", error);
    }
  },
};
