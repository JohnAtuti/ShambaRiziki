import type * as SQLite from "expo-sqlite";

export type Migration = {
  version: number;
  name: string;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Migration rules (unchanged from v1):
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

const plots: Migration = {
  version: 2,
  name: "plots",
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS plots (
        id              TEXT PRIMARY KEY NOT NULL,
        farm_id         TEXT NOT NULL,
        name            TEXT NOT NULL,
        size            REAL,
        size_unit       TEXT NOT NULL DEFAULT 'acre',
        location_text   TEXT,
        soil_type       TEXT,
        soil_ph         REAL,
        fertility       TEXT,
        slope           TEXT,
        tenure_type     TEXT NOT NULL DEFAULT 'owned',
        current_use     TEXT NOT NULL DEFAULT 'none',
        notes           TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT,
        version         INTEGER NOT NULL DEFAULT 1,
        sync_status     TEXT NOT NULL DEFAULT 'local',
        metadata        TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_plots_farm    ON plots(farm_id);
      CREATE INDEX IF NOT EXISTS idx_plots_deleted ON plots(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_plots_use     ON plots(current_use);
    `);
  },
};

const crops: Migration = {
  version: 3,
  name: "crops",
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS crops (
        id                 TEXT PRIMARY KEY NOT NULL,
        farm_id            TEXT NOT NULL,
        name               TEXT NOT NULL,
        variety            TEXT,
        category           TEXT NOT NULL DEFAULT 'other',
        days_to_harvest    INTEGER,
        notes              TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        deleted_at         TEXT,
        version            INTEGER NOT NULL DEFAULT 1,
        sync_status        TEXT NOT NULL DEFAULT 'local',
        metadata           TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_crops_farm     ON crops(farm_id);
      CREATE INDEX IF NOT EXISTS idx_crops_deleted  ON crops(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_crops_category ON crops(category);
    `);
  },
};

const cropCyclesAndActivities: Migration = {
  version: 4,
  name: "crop_cycles_and_activities",
  up: async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS crop_cycles (
        id                      TEXT PRIMARY KEY NOT NULL,
        farm_id                 TEXT NOT NULL,
        plot_id                 TEXT NOT NULL,
        crop_id                 TEXT NOT NULL,
        cycle_name              TEXT,
        planting_date           TEXT NOT NULL,
        planting_method         TEXT NOT NULL DEFAULT 'direct_sowing',
        expected_harvest_date   TEXT,
        actual_harvest_date     TEXT,
        status                  TEXT NOT NULL DEFAULT 'planned',
        seed_source             TEXT,
        seed_quantity           REAL,
        seed_unit               TEXT,
        expected_yield          REAL,
        expected_yield_unit     TEXT,
        notes                   TEXT,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL,
        deleted_at              TEXT,
        version                 INTEGER NOT NULL DEFAULT 1,
        sync_status             TEXT NOT NULL DEFAULT 'local',
        metadata                TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE RESTRICT,
        FOREIGN KEY (plot_id) REFERENCES plots(id) ON DELETE RESTRICT,
        FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_cycles_farm    ON crop_cycles(farm_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_plot    ON crop_cycles(plot_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_crop    ON crop_cycles(crop_id);
      CREATE INDEX IF NOT EXISTS idx_cycles_status  ON crop_cycles(status);
      CREATE INDEX IF NOT EXISTS idx_cycles_deleted ON crop_cycles(deleted_at);

      CREATE TABLE IF NOT EXISTS crop_activities (
        id              TEXT PRIMARY KEY NOT NULL,
        farm_id         TEXT NOT NULL,
        cycle_id        TEXT NOT NULL,
        activity_type   TEXT NOT NULL,
        activity_date   TEXT NOT NULL,
        description     TEXT,
        quantity        REAL,
        quantity_unit   TEXT,
        cost            REAL,
        cost_currency   TEXT,
        notes           TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT,
        version         INTEGER NOT NULL DEFAULT 1,
        sync_status     TEXT NOT NULL DEFAULT 'local',
        metadata        TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE RESTRICT,
        FOREIGN KEY (cycle_id) REFERENCES crop_cycles(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_activities_farm    ON crop_activities(farm_id);
      CREATE INDEX IF NOT EXISTS idx_activities_cycle   ON crop_activities(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_activities_type    ON crop_activities(activity_type);
      CREATE INDEX IF NOT EXISTS idx_activities_date    ON crop_activities(activity_date);
      CREATE INDEX IF NOT EXISTS idx_activities_deleted ON crop_activities(deleted_at);

      CREATE TABLE IF NOT EXISTS attachments (
        id            TEXT PRIMARY KEY NOT NULL,
        farm_id       TEXT NOT NULL,
        entity_type   TEXT NOT NULL,
        entity_id     TEXT NOT NULL,
        kind          TEXT NOT NULL,
        local_path    TEXT NOT NULL,
        remote_url    TEXT,
        mime_type     TEXT,
        size_bytes    INTEGER,
        duration_ms   INTEGER,
        caption       TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        deleted_at    TEXT,
        version       INTEGER NOT NULL DEFAULT 1,
        sync_status   TEXT NOT NULL DEFAULT 'local',
        metadata      TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_farm    ON attachments(farm_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_entity  ON attachments(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_kind    ON attachments(kind);
      CREATE INDEX IF NOT EXISTS idx_attachments_deleted ON attachments(deleted_at);
    `);
  },
};

export const MIGRATIONS: readonly Migration[] = [
  initial,
  plots,
  crops,
  cropCyclesAndActivities,
];

export const LATEST_VERSION: number = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);
