/**
 * Currency formatting for display. Amounts are stored as numbers in
 * SQLite; this file is the single place where they become strings.
 *
 * Two variants because they serve different jobs:
 *   - formatMoney        — whole shillings for balances and totals
 *   - formatMoneyDecimal — two decimals for per-unit costs, where
 *                          "30.00/kg" reads better than "30/kg"
 */

export const formatMoney = (amount: number, currency: string): string => {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${formatted}`;
};

export const formatMoneyDecimal = (
  amount: number,
  currency: string,
): string => {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${formatted}`;
};
