/**
 * Every timestamp in the database is an ISO-8601 UTC string.
 * ISO strings sort lexicographically = chronologically, so no date columns
 * are needed and no timezone math is needed on storage.
 */
export const nowIso = (): string => new Date().toISOString();

/** For future features that need "last X days" filters in SQL. */
export const isoDaysAgo = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};
