// ---------------------------------------------------------------------------
// Enums — kept in TypeScript only. Adding a new value never requires a DB
// migration because the DB stores plain TEXT with no CHECK constraints.
// ---------------------------------------------------------------------------

export type Role =
  | "owner"
  | "manager"
  | "worker"
  | "accountant"
  | "storekeeper";

export type SyncStatus = "local" | "pending" | "synced";

export type FarmType =
  | "crops"
  | "livestock"
  | "poultry"
  | "aquaculture"
  | "mixed"
  | "apiary";

export type SizeUnit = "acre" | "hectare";
export type Language = "en" | "sw";
export type Currency = "KES" | "TZS" | "UGX" | "USD" | "EUR";

// ---------------------------------------------------------------------------
// Base entity — every table inherits these columns verbatim.
// ---------------------------------------------------------------------------

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
  syncStatus: SyncStatus;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

export interface User extends BaseEntity {
  name: string;
  pinHash: string | null;
  pinSalt: string | null;
  role: Role;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
}

export interface Farm extends BaseEntity {
  name: string;
  location: string | null;
  size: number | null;
  sizeUnit: SizeUnit;
  farmType: FarmType;
  logoUri: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  currency: Currency;
  dateFormat: string;
  fiscalYearStartMonth: number;
  taxRate: number;
  language: Language;
  isActive: boolean;
}

export type AuditAction = "create" | "update" | "delete" | "restore";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: Record<string, [unknown, unknown]> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Row shapes — exactly what SQLite returns (snake_case, ints for booleans).
// Mappers below convert rows into domain entities.
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  name: string;
  pin_hash: string | null;
  pin_salt: string | null;
  role: string;
  is_active: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface FarmRow {
  id: string;
  name: string;
  location: string | null;
  size: number | null;
  size_unit: string;
  farm_type: string;
  logo_uri: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  currency: string;
  date_format: string;
  fiscal_year_start_month: number;
  tax_rate: number;
  language: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row → Domain mappers
// ---------------------------------------------------------------------------

const safeParseObject = (raw: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
};

export const mapUserRow = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  pinHash: row.pin_hash,
  pinSalt: row.pin_salt,
  role: row.role as Role,
  isActive: row.is_active === 1,
  failedAttempts: row.failed_attempts,
  lockedUntil: row.locked_until,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapFarmRow = (row: FarmRow): Farm => ({
  id: row.id,
  name: row.name,
  location: row.location,
  size: row.size,
  sizeUnit: row.size_unit as SizeUnit,
  farmType: row.farm_type as FarmType,
  logoUri: row.logo_uri,
  contactPhone: row.contact_phone,
  contactEmail: row.contact_email,
  currency: row.currency as Currency,
  dateFormat: row.date_format,
  fiscalYearStartMonth: row.fiscal_year_start_month,
  taxRate: row.tax_rate,
  language: row.language as Language,
  isActive: row.is_active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAuditRow = (row: AuditLogRow): AuditLogEntry => {
  let changes: Record<string, [unknown, unknown]> | null = null;
  if (row.changes) {
    try {
      const parsed: unknown = JSON.parse(row.changes);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        changes = parsed as Record<string, [unknown, unknown]>;
      }
    } catch {
      changes = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action as AuditAction,
    changes,
    createdAt: row.created_at,
  };
};
