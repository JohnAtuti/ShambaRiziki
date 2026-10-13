// ---------------------------------------------------------------------------
// Enums — TypeScript only. Adding a value never requires a DB migration
// because the DB stores plain TEXT with no CHECK constraints.
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

export type SoilType =
  | "clay"
  | "sandy"
  | "loam"
  | "silt"
  | "peat"
  | "chalk"
  | "other";

export type Fertility = "low" | "medium" | "high";
export type Slope = "flat" | "gentle" | "moderate" | "steep";
export type TenureType = "owned" | "leased" | "rented" | "communal";
export type PlotUse = "crops" | "livestock" | "fallow" | "mixed" | "none";

export type CropCategory =
  | "cereal"
  | "legume"
  | "vegetable"
  | "fruit"
  | "root"
  | "cash"
  | "fodder"
  | "other";

export type CycleStatus = "planned" | "active" | "harvested" | "abandoned";

export type PlantingMethod =
  | "direct_sowing"
  | "transplanting"
  | "broadcasting"
  | "other";

export type CropActivityType =
  | "land_prep"
  | "planting"
  | "fertilizer"
  | "pesticide"
  | "herbicide"
  | "irrigation"
  | "scouting"
  | "weeding"
  | "thinning"
  | "harvest"
  | "post_harvest"
  | "other";

export type AttachmentKind = "photo" | "voice" | "document";

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

export interface Plot extends BaseEntity {
  farmId: string;
  name: string;
  size: number | null;
  sizeUnit: SizeUnit;
  locationText: string | null;
  soilType: SoilType | null;
  soilPh: number | null;
  fertility: Fertility | null;
  slope: Slope | null;
  tenureType: TenureType;
  currentUse: PlotUse;
  notes: string | null;
}

export interface Crop extends BaseEntity {
  farmId: string;
  name: string;
  variety: string | null;
  category: CropCategory;
  daysToHarvest: number | null;
  notes: string | null;
}

export interface CropCycle extends BaseEntity {
  farmId: string;
  plotId: string;
  cropId: string;
  cycleName: string | null;
  plantingDate: string;
  plantingMethod: PlantingMethod;
  expectedHarvestDate: string | null;
  actualHarvestDate: string | null;
  status: CycleStatus;
  seedSource: string | null;
  seedQuantity: number | null;
  seedUnit: string | null;
  expectedYield: number | null;
  expectedYieldUnit: string | null;
  notes: string | null;
}

export interface CropActivity extends BaseEntity {
  farmId: string;
  cycleId: string;
  activityType: CropActivityType;
  activityDate: string;
  description: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  cost: number | null;
  costCurrency: string | null;
  notes: string | null;
}

export interface Attachment extends BaseEntity {
  farmId: string;
  entityType: string;
  entityId: string;
  kind: AttachmentKind;
  localPath: string;
  remoteUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  caption: string | null;
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

export interface PlotRow {
  id: string;
  farm_id: string;
  name: string;
  size: number | null;
  size_unit: string;
  location_text: string | null;
  soil_type: string | null;
  soil_ph: number | null;
  fertility: string | null;
  slope: string | null;
  tenure_type: string;
  current_use: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface CropRow {
  id: string;
  farm_id: string;
  name: string;
  variety: string | null;
  category: string;
  days_to_harvest: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface CropCycleRow {
  id: string;
  farm_id: string;
  plot_id: string;
  crop_id: string;
  cycle_name: string | null;
  planting_date: string;
  planting_method: string;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  status: string;
  seed_source: string | null;
  seed_quantity: number | null;
  seed_unit: string | null;
  expected_yield: number | null;
  expected_yield_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface CropActivityRow {
  id: string;
  farm_id: string;
  cycle_id: string;
  activity_type: string;
  activity_date: string;
  description: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  cost: number | null;
  cost_currency: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AttachmentRow {
  id: string;
  farm_id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  local_path: string;
  remote_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  caption: string | null;
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

export const mapPlotRow = (row: PlotRow): Plot => ({
  id: row.id,
  farmId: row.farm_id,
  name: row.name,
  size: row.size,
  sizeUnit: row.size_unit as SizeUnit,
  locationText: row.location_text,
  soilType: (row.soil_type as SoilType | null) ?? null,
  soilPh: row.soil_ph,
  fertility: (row.fertility as Fertility | null) ?? null,
  slope: (row.slope as Slope | null) ?? null,
  tenureType: row.tenure_type as TenureType,
  currentUse: row.current_use as PlotUse,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapCropRow = (row: CropRow): Crop => ({
  id: row.id,
  farmId: row.farm_id,
  name: row.name,
  variety: row.variety,
  category: row.category as CropCategory,
  daysToHarvest: row.days_to_harvest,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapCropCycleRow = (row: CropCycleRow): CropCycle => ({
  id: row.id,
  farmId: row.farm_id,
  plotId: row.plot_id,
  cropId: row.crop_id,
  cycleName: row.cycle_name,
  plantingDate: row.planting_date,
  plantingMethod: row.planting_method as PlantingMethod,
  expectedHarvestDate: row.expected_harvest_date,
  actualHarvestDate: row.actual_harvest_date,
  status: row.status as CycleStatus,
  seedSource: row.seed_source,
  seedQuantity: row.seed_quantity,
  seedUnit: row.seed_unit,
  expectedYield: row.expected_yield,
  expectedYieldUnit: row.expected_yield_unit,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapCropActivityRow = (row: CropActivityRow): CropActivity => ({
  id: row.id,
  farmId: row.farm_id,
  cycleId: row.cycle_id,
  activityType: row.activity_type as CropActivityType,
  activityDate: row.activity_date,
  description: row.description,
  quantity: row.quantity,
  quantityUnit: row.quantity_unit,
  cost: row.cost,
  costCurrency: row.cost_currency,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAttachmentRow = (row: AttachmentRow): Attachment => ({
  id: row.id,
  farmId: row.farm_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  kind: row.kind as AttachmentKind,
  localPath: row.local_path,
  remoteUrl: row.remote_url,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  durationMs: row.duration_ms,
  caption: row.caption,
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
