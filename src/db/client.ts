import * as SQLite from "expo-sqlite";
import { LATEST_VERSION, MIGRATIONS } from "./migrations";

const DB_NAME = "shamba.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Runs every pending migration in order, inside a single transaction per
 * migration. Uses PRAGMA user_version to know where we are.
 */
const runMigrations = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const current = row?.user_version ?? 0;

  if (current >= LATEST_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    if (__DEV__) {
      console.log(
        `[db] applying migration ${migration.version} (${migration.name})`,
      );
    }

    await db.withTransactionAsync(async () => {
      await migration.up(db);
    });

    // PRAGMA cannot be parameterised; the value is a number we control.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
};

const initialize = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // Pragmas must be run one at a time; execAsync with multiple statements
  // can silently drop results on some platforms.
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA synchronous = NORMAL;");

  await runMigrations(db);

  return db;
};

/**
 * Returns the app's single SQLite connection, initialising on first call.
 * Safe to call from anywhere, from any number of concurrent callers — the
 * initialisation promise is cached so migrations run exactly once.
 */
export const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = initialize()
      .then((db) => {
        dbInstance = db;
        return db;
      })
      .catch((err) => {
        // Reset so the next caller can retry instead of getting a stuck promise.
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
};

/** Test / dev helper. Not called from app code. */
export const closeDb = async (): Promise<void> => {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    initPromise = null;
  }
};
