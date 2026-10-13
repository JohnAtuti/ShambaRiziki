import type { RecurrenceType } from "./types";

/**
 * Recurrence math. All arithmetic is UTC-based to avoid DST surprises.
 *
 * Design decision: when a task is created with a recurrence, we pre-generate
 * the next N occurrences as separate rows. This makes the calendar a plain
 * date-range query and eliminates any need for background jobs or spawn-on-
 * completion logic. It also works perfectly offline.
 *
 * Seasonal = 90 days between occurrences. That matches the long-rains /
 * short-rains cadence common in East African farming. If a farm needs a
 * different span, they create two separate seasonal tasks.
 */
const SEASONAL_DAYS = 90;

export const MAX_OCCURRENCES = 30;

const daysBetween = (type: RecurrenceType): number => {
  switch (type) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "seasonal":
      return SEASONAL_DAYS;
    default:
      return 0;
  }
};

const addDaysUtc = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

const addMonthsUtc = (iso: string, months: number): string => {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp to the last valid day of the target month.
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
};

/**
 * Returns the Nth occurrence date (1-based) for a given recurrence, starting
 * from `firstDate`. Occurrence 1 is always `firstDate` itself.
 *
 * Returns `null` when the recurrence is "none" and `index > 1`.
 */
export const occurrenceDate = (
  firstDate: string,
  type: RecurrenceType,
  index: number,
): string | null => {
  if (index < 1) return null;
  if (index === 1) return firstDate;
  if (type === "none") return null;

  const step = daysBetween(type);
  if (step > 0) return addDaysUtc(firstDate, step * (index - 1));

  if (type === "monthly") return addMonthsUtc(firstDate, index - 1);
  if (type === "yearly") return addMonthsUtc(firstDate, 12 * (index - 1));

  return null;
};

/**
 * Generates the sequence of occurrence dates for a task, up to `maxCount`
 * occurrences or `horizonDays` in the future, whichever limit hits first.
 *
 * Occurrence 1 is always included (the initial task row itself). For a
 * non-recurring task the array is exactly `[firstDate]`.
 */
export const generateOccurrences = (
  firstDate: string,
  type: RecurrenceType,
  maxCount: number,
  horizonDays: number,
): string[] => {
  const out: string[] = [firstDate];
  if (type === "none") return out;

  const horizon = addDaysUtc(firstDate, horizonDays);
  const cap = Math.min(maxCount, MAX_OCCURRENCES);

  for (let i = 2; i <= cap; i++) {
    const next = occurrenceDate(firstDate, type, i);
    if (!next) break;
    if (next > horizon) break;
    out.push(next);
  }

  return out;
};

export const isRecurring = (type: RecurrenceType): boolean => type !== "none";
