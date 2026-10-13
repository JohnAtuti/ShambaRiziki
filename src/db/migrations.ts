import type * as SQLite from "expo-sqlite";

export type Migration = {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Migration 001 — initial schema
//
// Rules for every future migration:
//   1. Never edit an existing migration. Add a new one.
//   2. Never DROP a column. Add a new one, migrate data, leave the old one.
//   3. Never use ON DELETE CASCADE. Use ON DELETE SET NULL or RESTRICT.
//   4. Always add an index for any column you will filter or join on.
// ---------------------------------------------------------------------------

const initial: Migration = {
  version: 1,
  name: "initial",
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id                TEXT PRIMARY KEY NOT NULL,
        name              TEXT NOT NULL,
        pin_hash          TEXT,
        pin_salt          TEXT,
        role              TEXT NOT NULL DEFAULT 'owner',
        is_active         INTEGER NOT NULL DEFAULT 1,
        failed_attempts   INTEGER NOT NULL DEFAULT 0,
        locked_until      TEXT,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        deleted_at        TEXT,
        version           INTEGER NOT NULL DEFAULT 1,
        sync_status       TEXT NOT NULL DEFAULT 'local',
        metadata          TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_users_deleted  ON users(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_active   ON users(is_active);

      CREATE TABLE IF NOT EXISTS farms (
        id                       TEXT PRIMARY KEY NOT NULL,
        name                     TEXT NOT NULL,
        location                 TEXT,
        size                     REAL,
        size_unit                TEXT NOT NULL DEFAULT 'acre',
        farm_type                TEXT NOT NULL DEFAULT 'mixed',
        logo_uri                 TEXT,
        contact_phone            TEXT,
        contact_email            TEXT,
        currency                 TEXT NOT NULL DEFAULT 'KES',
        date_format              TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
        fiscal_year_start_month  INTEGER NOT NULL DEFAULT 1,
        tax_rate                 REAL NOT NULL DEFAULT 0,
        language                 TEXT NOT NULL DEFAULT 'en',
        is_active                INTEGER NOT NULL DEFAULT 1,
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        deleted_at               TEXT,
        version                  INTEGER NOT NULL DEFAULT 1,
        sync_status              TEXT NOT NULL DEFAULT 'local',
        metadata                 TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_farms_deleted ON farms(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_farms_active  ON farms(is_active);

      CREATE TABLE IF NOT EXISTS audit_log (
        id           TEXT PRIMARY KEY NOT NULL,
        user_id      TEXT,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        action       TEXT NOT NULL,
        changes      TEXT,
        created_at   TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

      CREATE TABLE IF NOT EXISTS app_settings (
        key         TEXT PRIMARY KEY NOT NULL,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `);
  },
};

export const MIGRATIONS: readonly Migration[] = [initial];

export const LATEST_VERSION: number = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);
