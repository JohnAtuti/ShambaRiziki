import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import { hashPin, verifyPin } from "./pin";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import { mapUserRow, type Role, type User, type UserRow } from "./types";

// Lockout policy: 5 failed attempts → locked for 5 minutes.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export interface CreateUserInput {
  name: string;
  role: Role;
  pin?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
  isActive?: boolean;
}

export interface UserRepo {
  list(ctx: RepoContext): Promise<User[]>;
  getById(ctx: RepoContext, id: string): Promise<User | null>;
  countActive(ctx: RepoContext): Promise<number>;
  create(ctx: RepoContext, input: CreateUserInput): Promise<User>;
  update(ctx: RepoContext, id: string, patch: UpdateUserInput): Promise<User>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<User>;
  setPin(ctx: RepoContext, id: string, pin: string): Promise<void>;
  verifyPin(ctx: RepoContext, id: string, pin: string): Promise<boolean>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("User name is required");
  if (trimmed.length > 80) throw new ValidationError("User name is too long");
  return trimmed;
};

export const userRepo: UserRepo = {
  async list(ctx) {
    try {
      const rows = await ctx.db.getAllAsync<UserRow>(
        `SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC`,
      );
      return rows.map(mapUserRow);
    } catch (error) {
      throw wrapDbError("userRepo.list", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<UserRow>(
        `SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapUserRow(row) : null;
    } catch (error) {
      throw wrapDbError("userRepo.getById", error);
    }
  },

  async countActive(ctx) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM users
          WHERE deleted_at IS NULL AND is_active = 1`,
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("userRepo.countActive", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    const base = newBaseFields();

    let pinHash: string | null = null;
    let pinSalt: string | null = null;
    if (input.pin) {
      const hashed = await hashPin(input.pin);
      pinHash = hashed.hash;
      pinSalt = hashed.salt;
    }

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO users (
            id, name, pin_hash, pin_salt, role, is_active,
            failed_attempts, locked_until,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            name,
            pinHash,
            pinSalt,
            input.role,
            1,
            0,
            null,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );
        await writeAudit(ctx, {
          entityType: "user",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], role: [null, input.role] },
        });
      });
    } catch (error) {
      throw wrapDbError("userRepo.create", error);
    }

    const created = await userRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("user", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await userRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("user", id);

    const changes: Record<string, [unknown, unknown]> = {};

    if (patch.name !== undefined) {
      const next = requireName(patch.name);
      if (next !== existing.name) changes.name = [existing.name, next];
    }
    if (patch.role !== undefined && patch.role !== existing.role) {
      changes.role = [existing.role, patch.role];
    }
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      changes.isActive = [existing.isActive, patch.isActive];
    }

    if (Object.keys(changes).length === 0) return existing;

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];

    if (patch.name !== undefined) {
      sets.push("name = ?");
      params.push(requireName(patch.name));
    }
    if (patch.role !== undefined) {
      sets.push("role = ?");
      params.push(patch.role);
    }
    if (patch.isActive !== undefined) {
      sets.push("is_active = ?");
      params.push(patch.isActive ? 1 : 0);
    }

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "user",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("userRepo.update", error);
    }

    const updated = await userRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("user", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await userRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("user", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE users
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "user",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("userRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE users
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "user",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("userRepo.restore", error);
    }

    const restored = await userRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("user", id);
    return restored;
  },

  async setPin(ctx, id, pin) {
    const existing = await userRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("user", id);

    const { hash, salt } = await hashPin(pin);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE users
             SET pin_hash = ?, pin_salt = ?,
                 failed_attempts = 0, locked_until = NULL,
                 updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [hash, salt, nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "user",
          entityId: id,
          action: "update",
          changes: { pin: ["***", "***"] },
        });
      });
    } catch (error) {
      throw wrapDbError("userRepo.setPin", error);
    }
  },

  async verifyPin(ctx, id, pin) {
    const row = await ctx.db.getFirstAsync<UserRow>(
      `SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!row) return false;
    if (!row.pin_hash || !row.pin_salt) return false;

    // Lockout check — reject before hashing to avoid wasting cycles on a
    // guaranteed-fail verify.
    if (row.locked_until) {
      const locked = new Date(row.locked_until).getTime();
      if (Number.isFinite(locked) && locked > Date.now()) {
        return false;
      }
    }

    const ok = await verifyPin(pin, row.pin_hash, row.pin_salt);

    if (ok) {
      await ctx.db.runAsync(
        `UPDATE users
           SET failed_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [id],
      );
      return true;
    }

    // Failed attempt — increment and lock if threshold reached.
    const next = row.failed_attempts + 1;
    const reachedThreshold = next >= MAX_ATTEMPTS;
    const lockedUntil = reachedThreshold
      ? new Date(Date.now() + LOCKOUT_MS).toISOString()
      : null;

    await ctx.db.runAsync(
      `UPDATE users
         SET failed_attempts = ?, locked_until = ?
       WHERE id = ?`,
      [reachedThreshold ? 0 : next, lockedUntil, id],
    );

    return false;
  },
};

/**
 * Convenience for the case where the DB was populated with a single owner
 * during onboarding but the caller doesn't yet have the ID.
 */
export const findSoleOwner = async (ctx: RepoContext): Promise<User | null> => {
  const row = await ctx.db.getFirstAsync<UserRow>(
    `SELECT * FROM users
      WHERE deleted_at IS NULL AND role = 'owner'
      ORDER BY created_at ASC
      LIMIT 1`,
  );
  return row ? mapUserRow(row) : null;
};
