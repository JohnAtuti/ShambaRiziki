import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";

import { closeDb } from "./client";
import { LATEST_VERSION } from "./migrations";
import { wrapDbError, type RepoContext } from "./repository";
import { settingsRepo } from "./settings";
import { nowIso } from "./time";

// ---------------------------------------------------------------------------
// Backup — creates and inspects point-in-time copies of the live database.
//
// Uses SQLite's VACUUM INTO, which produces a clean, compact, transactionally
// consistent copy while the app continues running. This is the only approach
// that guarantees consistency without pausing writes.
//
// Restore is deliberately NOT implemented here. See restoreBackup() below.
// ---------------------------------------------------------------------------

const BACKUP_DIR_NAME = "backups";
const BACKUP_FILE_PREFIX = "shamba-backup-";
const BACKUP_EXTENSION = ".db";
const SETTING_LAST_AT = "backup_last_at";

// The exact 16-byte magic header every SQLite 3 file begins with.
// (16th byte is NUL, not a printable char.)
const SQLITE_MAGIC = "SQLite format 3\u0000";

export interface BackupFile {
  uri: string;
  name: string;
  size: number;
  createdAt: string;
}

export type BackupValidation =
  | { ok: true; userVersion: number }
  | { ok: false; reason: string };

export interface BackupRepo {
  createBackup(ctx: RepoContext): Promise<BackupFile>;
  listBackups(): Promise<BackupFile[]>;
  deleteBackup(uri: string): Promise<void>;
  validateBackup(uri: string): Promise<BackupValidation>;
  restoreBackup(ctx: RepoContext, uri: string): Promise<void>;
}

// ---- Helpers

const getBackupDir = (): Directory =>
  new Directory(Paths.document, BACKUP_DIR_NAME);

const ensureBackupDir = (): Directory => {
  const dir = getBackupDir();
  if (!dir.exists) {
    dir.create();
  }
  return dir;
};

/**
 * Converts a file:// URI to a plain filesystem path. SQLite's VACUUM INTO
 * expects a path, not a URI; passing file:///x would create a file literally
 * named "file:" in the current working directory, silently.
 */
const uriToPath = (uri: string): string => uri.replace(/^file:\/\//, "");
/**
 * Inverse of uriToPath. PRAGMA database_list returns a plain path; the
 * File constructor expects a URI. Idempotent — safe to call on a value
 * that already carries the file:// scheme.
 */
const pathToUri = (path: string): string =>
  path.startsWith("file://") ? path : `file://${path}`;

const escapeSqlString = (value: string): string => value.replace(/'/g, "''");

/** "shamba-backup-2026-10-14T12-34-56-789Z.db" — sortable, shell-safe. */
const timestampForFilename = (): string =>
  new Date().toISOString().replace(/[:.]/g, "-");

/** Best-effort reverse of timestampForFilename. Returns null on mismatch. */
const parseCreatedAt = (name: string): string | null => {
  if (!name.startsWith(BACKUP_FILE_PREFIX)) return null;
  if (!name.endsWith(BACKUP_EXTENSION)) return null;
  const inner = name.slice(
    BACKUP_FILE_PREFIX.length,
    name.length - BACKUP_EXTENSION.length,
  );
  const restored = inner.replace(
    /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "T$1:$2:$3.$4Z",
  );
  const parsed = new Date(restored);
  return Number.isNaN(parsed.getTime()) ? null : restored;
};

const isBackupName = (name: string): boolean =>
  name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_EXTENSION);

/** Read the first 16 bytes and return them as a string, or null on error. */
const readMagic = (file: File): string | null => {
  try {
    const bytes = file.bytesSync();
    if (bytes.length < SQLITE_MAGIC.length) return null;
    let out = "";
    for (let i = 0; i < SQLITE_MAGIC.length; i += 1) {
      const byte = bytes[i];
      out += String.fromCharCode(byte ?? 0);
    }
    return out;
  } catch {
    return null;
  }
};

/**
 * Opens a backup file read-only and reads PRAGMA user_version. Returns null
 * if the file cannot be opened as a database. The live connection is not
 * touched — SQLite supports multiple connections to different files.
 */
const readUserVersion = async (path: string): Promise<number | null> => {
  try {
    const db = await SQLite.openDatabaseAsync(path);
    try {
      const row = await db.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
      );
      return row?.user_version ?? 0;
    } finally {
      await db.closeAsync();
    }
  } catch {
    return null;
  }
};

// ---- Repo

export const backupRepo: BackupRepo = {
  async createBackup(ctx) {
    try {
      const dir = ensureBackupDir();
      const name = `${BACKUP_FILE_PREFIX}${timestampForFilename()}${BACKUP_EXTENSION}`;
      const file = new File(dir, name);

      // VACUUM INTO refuses to overwrite. Unique timestamped name makes
      // collisions essentially impossible, but delete defensively.
      if (file.exists) {
        file.delete();
      }

      const path = uriToPath(file.uri);
      const safePath = escapeSqlString(path);
      await ctx.db.execAsync(`VACUUM INTO '${safePath}'`);

      if (!file.exists) {
        throw new Error("VACUUM INTO produced no file at " + path);
      }

      const size = file.size;
      const createdAt = parseCreatedAt(name) ?? nowIso();

      await settingsRepo.set(ctx, SETTING_LAST_AT, createdAt);

      return { uri: file.uri, name, size, createdAt };
    } catch (error) {
      throw wrapDbError("backupRepo.createBackup", error);
    }
  },

  async listBackups() {
    const dir = getBackupDir();
    if (!dir.exists) return [];

    const entries = dir.list();
    const out: BackupFile[] = [];
    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      if (!isBackupName(entry.name)) continue;
      const createdAt = parseCreatedAt(entry.name) ?? nowIso();
      out.push({
        uri: entry.uri,
        name: entry.name,
        size: entry.size,
        createdAt,
      });
    }
    // Newest first: filenames are timestamped, so lexicographic == chronological.
    out.sort((a, b) => b.name.localeCompare(a.name));
    return out;
  },

  async deleteBackup(uri) {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  },

  async validateBackup(uri) {
    const file = new File(uri);
    if (!file.exists) {
      return { ok: false, reason: "file does not exist" };
    }
    if (file.size < 100) {
      return {
        ok: false,
        reason: "file is too small to be a SQLite database",
      };
    }
    const magic = readMagic(file);
    if (magic !== SQLITE_MAGIC) {
      return { ok: false, reason: "file is not a SQLite database" };
    }
    const userVersion = await readUserVersion(uriToPath(file.uri));
    if (userVersion === null) {
      return { ok: false, reason: "cannot read user_version from backup" };
    }
    return { ok: true, userVersion };
  },

  async restoreBackup(ctx, uri) {
    // 1. Validate first — never touch the live DB until we know the source
    //    is a real SQLite file with a plausible schema version.
    const validation = await backupRepo.validateBackup(uri);
    if (!validation.ok) {
      throw new Error(`backup validation failed: ${validation.reason}`);
    }
    if (validation.userVersion > LATEST_VERSION) {
      throw new Error(
        `backup is from a newer app version (backup v${validation.userVersion}, app v${LATEST_VERSION}). Update the app first.`,
      );
    }

    // 2. Read the live path while the connection is still open.
    const pathRow = await ctx.db.getFirstAsync<{ file: string }>(
      `SELECT file FROM pragma_database_list WHERE name = 'main'`,
    );
    const livePath = pathRow?.file;
    if (!livePath) {
      throw new Error("could not resolve live database path");
    }

    // 3. Close the live connection. This checkpoints the WAL and, under
    //    normal conditions, removes the sidecar files.
    await closeDb();

    // 4. Defensively remove sidecars if they survived the close. A stale
    //    -wal beside a freshly restored main DB is the corruption vector
    //    we are guarding against.
    const liveUri = pathToUri(livePath);
    const walFile = new File(`${liveUri}-wal`);
    const shmFile = new File(`${liveUri}-shm`);
    if (walFile.exists) walFile.delete();
    if (shmFile.exists) shmFile.delete();

    // 5. Delete the live DB.
    const liveFile = new File(liveUri);
    if (liveFile.exists) liveFile.delete();

    // 6. Copy backup into place. From here the backup file is untouched —
    //    if anything fails, the user retries with the same file.
    const source = new File(uri);
    if (!source.exists) {
      throw new Error("backup file disappeared before restore");
    }
    source.copySync(liveFile);

    if (!liveFile.exists) {
      throw new Error("restore completed but live database is missing");
    }

    // 7. Do not reopen here. The caller reinitialises via AppStateContext.
  },
};
