import type * as SQLite from "expo-sqlite";

import { DbError } from "./errors";
import { newId } from "./id";
import { nowIso } from "./time";
import type { AuditAction, SyncStatus } from "./types";

/**
 * Everything a repo method needs to do its job. Screens build one of these
 * from the DB instance and the currently signed-in user.
 */
export interface RepoContext {
  readonly db: SQLite.SQLiteDatabase;
  readonly currentUserId: string | null;
}

/**
 * Base column values injected into every new row. Kept in one place so
 * every table stays consistent.
 */
export interface BaseInsertFields {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
  version: 1;
  sync_status: SyncStatus;
  metadata: string;
}

export const newBaseFields = (): BaseInsertFields => ({
  id: newId(),
  created_at: nowIso(),
  updated_at: nowIso(),
  deleted_at: null,
  version: 1,
  sync_status: "local",
  metadata: "{}",
});

/**
 * Serialises metadata to a JSON string, safely. If the caller passes an
 * unserialisable object we fall back to '{}' rather than crashing the write.
 */
export const serialiseMetadata = (value: unknown): string => {
  if (value === null || value === undefined) return "{}";
  if (typeof value === "object" && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return "{}";
    }
  }
  return "{}";
};

/**
 * Wraps an unknown error as DbError, preserving the original in `cause`.
 * Every repo method funnels caught errors through this so the UI can rely
 * on `instanceof DbError` working consistently.
 */
export const wrapDbError = (context: string, error: unknown): DbError => {
  if (error instanceof DbError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DbError(`${context}: ${message}`, error);
};

// ---------------------------------------------------------------------------
// Audit log
//
// Append-only. Never updated, never deleted. Every entity mutation records
// one row here. The audit log is the source of truth for "who changed what
// and when" — see DOET Ch. 2 on blame & attribution: better to record than
// to guess.
// ---------------------------------------------------------------------------

export interface AuditWrite {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, [unknown, unknown]> | null;
}

export const writeAudit = async (
  ctx: RepoContext,
  entry: AuditWrite,
): Promise<void> => {
  try {
    await ctx.db.runAsync(
      `INSERT INTO audit_log
        (id, user_id, entity_type, entity_id, action, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        ctx.currentUserId,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.changes ? JSON.stringify(entry.changes) : null,
        nowIso(),
      ],
    );
  } catch (error) {
    // Audit failure must NOT roll back the entity write. We log and move on.
    // A missing audit row is a minor loss; a failed save is a major one.
    if (__DEV__) {
      console.warn("[audit] write failed", error);
    }
  }
};
