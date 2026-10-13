import { wrapDbError, type RepoContext } from "./repository";
import { nowIso } from "./time";

export interface SettingsRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface SettingsRepo {
  get<T = unknown>(ctx: RepoContext, key: string): Promise<T | null>;
  set(ctx: RepoContext, key: string, value: unknown): Promise<void>;
  remove(ctx: RepoContext, key: string): Promise<void>;
  getAll(ctx: RepoContext): Promise<Record<string, unknown>>;
}

const parse = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const settingsRepo: SettingsRepo = {
  async get<T = unknown>(ctx: RepoContext, key: string): Promise<T | null> {
    try {
      const row = await ctx.db.getFirstAsync<SettingsRow>(
        `SELECT * FROM app_settings WHERE key = ?`,
        [key],
      );
      if (!row) return null;
      return parse<T>(row.value);
    } catch (error) {
      throw wrapDbError("settingsRepo.get", error);
    }
  },

  async set(ctx, key, value) {
    try {
      await ctx.db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                        updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), nowIso()],
      );
    } catch (error) {
      throw wrapDbError("settingsRepo.set", error);
    }
  },

  async remove(ctx, key) {
    try {
      await ctx.db.runAsync(`DELETE FROM app_settings WHERE key = ?`, [key]);
    } catch (error) {
      throw wrapDbError("settingsRepo.remove", error);
    }
  },

  async getAll(ctx) {
    try {
      const rows = await ctx.db.getAllAsync<SettingsRow>(
        `SELECT * FROM app_settings`,
      );
      const out: Record<string, unknown> = {};
      for (const row of rows) {
        out[row.key] = parse(row.value);
      }
      return out;
    } catch (error) {
      throw wrapDbError("settingsRepo.getAll", error);
    }
  },
};
