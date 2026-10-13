// ---------------------------------------------------------------------------
// Enums — TypeScript only. Adding a value never requires a DB migration.
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

export type Species =
  | "cattle"
  | "goat"
  | "sheep"
  | "chicken"
  | "pig"
  | "rabbit"
  | "duck"
  | "turkey"
  | "fish"
  | "bee"
  | "other";

export type HerdPurpose =
  | "dairy"
  | "meat"
  | "eggs"
  | "wool"
  | "breeding"
  | "mixed"
  | "other";

export type AnimalSex = "male" | "female" | "unknown";

export type AnimalOrigin =
  | "born_on_farm"
  | "purchased"
  | "gifted"
  | "inherited"
  | "unknown";

export type AnimalStatus =
  | "alive"
  | "sold"
  | "dead"
  | "slaughtered"
  | "culled"
  | "missing";

export type HealthRecordType =
  | "vaccination"
  | "deworming"
  | "treatment"
  | "illness"
  | "injury"
  | "mortality"
  | "quarantine";

export type BreedingRecordType =
  | "mating"
  | "pregnancy_check"
  | "birth"
  | "weaning"
  | "abortion";

export type BreedingMethod = "natural" | "artificial_insemination" | "unknown";

export type FeedType =
  | "hay"
  | "silage"
  | "concentrate"
  | "pasture"
  | "kitchen_scraps"
  | "minerals"
  | "water"
  | "other";

export type ProductionType =
  | "milk"
  | "eggs"
  | "wool"
  | "honey"
  | "weight"
  | "meat"
  | "other";

// Inventory enums

export type ItemCategory =
  | "seed"
  | "fertilizer"
  | "pesticide"
  | "herbicide"
  | "feed"
  | "veterinary_drug"
  | "fuel"
  | "tool"
  | "packaging"
  | "other";

export type InventoryTransactionType =
  | "purchase" // stock in, from a supplier
  | "issue" // stock out, consumed by a plot/animal/worker
  | "return" // stock in, returned from a plot/animal/worker
  | "adjustment_in" // stock in, correction or found stock
  | "adjustment_out" // stock out, loss, theft, spoilage
  | "stocktake"; // balance set point at a physical count; sign via delta

export type InventoryTargetType =
  | "plot"
  | "animal"
  | "herd"
  | "crop_cycle"
  | "worker"
  | "other";

// ---------------------------------------------------------------------------
// Base entity
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

export interface Herd extends BaseEntity {
  farmId: string;
  name: string;
  species: Species;
  breed: string | null;
  purpose: HerdPurpose;
  notes: string | null;
}

export interface Animal extends BaseEntity {
  farmId: string;
  herdId: string | null;
  tagId: string;
  name: string | null;
  species: Species;
  breed: string | null;
  sex: AnimalSex;
  dateOfBirth: string | null;
  origin: AnimalOrigin;
  purchaseDate: string | null;
  purchasePrice: number | null;
  motherId: string | null;
  fatherId: string | null;
  status: AnimalStatus;
  bodyConditionScore: number | null;
  notes: string | null;
}

export interface AnimalHealthRecord extends BaseEntity {
  farmId: string;
  animalId: string;
  recordType: HealthRecordType;
  recordDate: string;
  productName: string | null;
  dosage: number | null;
  dosageUnit: string | null;
  administeredBy: string | null;
  diagnosis: string | null;
  symptoms: string | null;
  cost: number | null;
  costCurrency: string | null;
  withdrawalPeriodDays: number | null;
  notes: string | null;
}

export interface AnimalBreedingRecord extends BaseEntity {
  farmId: string;
  animalId: string;
  recordType: BreedingRecordType;
  recordDate: string;
  sireId: string | null;
  method: BreedingMethod | null;
  pregnancyConfirmedDate: string | null;
  expectedDueDate: string | null;
  offspringCount: number | null;
  notes: string | null;
}

export interface AnimalFeedRecord extends BaseEntity {
  farmId: string;
  animalId: string | null;
  herdId: string | null;
  recordDate: string;
  feedType: FeedType;
  quantity: number | null;
  quantityUnit: string | null;
  cost: number | null;
  costCurrency: string | null;
  notes: string | null;
}

export interface AnimalProductionRecord extends BaseEntity {
  farmId: string;
  animalId: string | null;
  herdId: string | null;
  recordDate: string;
  productionType: ProductionType;
  quantity: number | null;
  quantityUnit: string | null;
  quality: string | null;
  weightKg: number | null;
  bodyConditionScore: number | null;
  notes: string | null;
}

export interface Warehouse extends BaseEntity {
  farmId: string;
  name: string;
  location: string | null;
  notes: string | null;
}

export interface InventoryItem extends BaseEntity {
  farmId: string;
  name: string;
  sku: string | null;
  category: ItemCategory;
  unit: string;
  description: string | null;
  reorderLevel: number | null;
  reorderQuantity: number | null;
  defaultCost: number | null;
  defaultCostCurrency: string | null;
  preferredSupplier: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface InventoryTransaction extends BaseEntity {
  farmId: string;
  itemId: string;
  warehouseId: string | null;
  transactionType: InventoryTransactionType;
  transactionDate: string;
  quantity: number;
  quantityUnit: string | null;
  unitCost: number | null;
  totalCost: number | null;
  costCurrency: string | null;
  supplier: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  reference: string | null;
  targetType: InventoryTargetType | null;
  targetId: string | null;
  targetLabel: string | null;
  notes: string | null;
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
// Row shapes
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

export interface HerdRow {
  id: string;
  farm_id: string;
  name: string;
  species: string;
  breed: string | null;
  purpose: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AnimalRow {
  id: string;
  farm_id: string;
  herd_id: string | null;
  tag_id: string;
  name: string | null;
  species: string;
  breed: string | null;
  sex: string;
  date_of_birth: string | null;
  origin: string;
  purchase_date: string | null;
  purchase_price: number | null;
  mother_id: string | null;
  father_id: string | null;
  status: string;
  body_condition_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AnimalHealthRecordRow {
  id: string;
  farm_id: string;
  animal_id: string;
  record_type: string;
  record_date: string;
  product_name: string | null;
  dosage: number | null;
  dosage_unit: string | null;
  administered_by: string | null;
  diagnosis: string | null;
  symptoms: string | null;
  cost: number | null;
  cost_currency: string | null;
  withdrawal_period_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AnimalBreedingRecordRow {
  id: string;
  farm_id: string;
  animal_id: string;
  record_type: string;
  record_date: string;
  sire_id: string | null;
  method: string | null;
  pregnancy_confirmed_date: string | null;
  expected_due_date: string | null;
  offspring_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface AnimalFeedRecordRow {
  id: string;
  farm_id: string;
  animal_id: string | null;
  herd_id: string | null;
  record_date: string;
  feed_type: string;
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

export interface AnimalProductionRecordRow {
  id: string;
  farm_id: string;
  animal_id: string | null;
  herd_id: string | null;
  record_date: string;
  production_type: string;
  quantity: number | null;
  quantity_unit: string | null;
  quality: string | null;
  weight_kg: number | null;
  body_condition_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface WarehouseRow {
  id: string;
  farm_id: string;
  name: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface InventoryItemRow {
  id: string;
  farm_id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  description: string | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  default_cost: number | null;
  default_cost_currency: string | null;
  preferred_supplier: string | null;
  is_active: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  sync_status: string;
  metadata: string;
}

export interface InventoryTransactionRow {
  id: string;
  farm_id: string;
  item_id: string;
  warehouse_id: string | null;
  transaction_type: string;
  transaction_date: string;
  quantity: number;
  quantity_unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  cost_currency: string | null;
  supplier: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  reference: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  notes: string | null;
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
// Row -> Domain mappers
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

export const mapHerdRow = (row: HerdRow): Herd => ({
  id: row.id,
  farmId: row.farm_id,
  name: row.name,
  species: row.species as Species,
  breed: row.breed,
  purpose: row.purpose as HerdPurpose,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAnimalRow = (row: AnimalRow): Animal => ({
  id: row.id,
  farmId: row.farm_id,
  herdId: row.herd_id,
  tagId: row.tag_id,
  name: row.name,
  species: row.species as Species,
  breed: row.breed,
  sex: row.sex as AnimalSex,
  dateOfBirth: row.date_of_birth,
  origin: row.origin as AnimalOrigin,
  purchaseDate: row.purchase_date,
  purchasePrice: row.purchase_price,
  motherId: row.mother_id,
  fatherId: row.father_id,
  status: row.status as AnimalStatus,
  bodyConditionScore: row.body_condition_score,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAnimalHealthRow = (
  row: AnimalHealthRecordRow,
): AnimalHealthRecord => ({
  id: row.id,
  farmId: row.farm_id,
  animalId: row.animal_id,
  recordType: row.record_type as HealthRecordType,
  recordDate: row.record_date,
  productName: row.product_name,
  dosage: row.dosage,
  dosageUnit: row.dosage_unit,
  administeredBy: row.administered_by,
  diagnosis: row.diagnosis,
  symptoms: row.symptoms,
  cost: row.cost,
  costCurrency: row.cost_currency,
  withdrawalPeriodDays: row.withdrawal_period_days,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAnimalBreedingRow = (
  row: AnimalBreedingRecordRow,
): AnimalBreedingRecord => ({
  id: row.id,
  farmId: row.farm_id,
  animalId: row.animal_id,
  recordType: row.record_type as BreedingRecordType,
  recordDate: row.record_date,
  sireId: row.sire_id,
  method: (row.method as BreedingMethod | null) ?? null,
  pregnancyConfirmedDate: row.pregnancy_confirmed_date,
  expectedDueDate: row.expected_due_date,
  offspringCount: row.offspring_count,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapAnimalFeedRow = (
  row: AnimalFeedRecordRow,
): AnimalFeedRecord => ({
  id: row.id,
  farmId: row.farm_id,
  animalId: row.animal_id,
  herdId: row.herd_id,
  recordDate: row.record_date,
  feedType: row.feed_type as FeedType,
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

export const mapAnimalProductionRow = (
  row: AnimalProductionRecordRow,
): AnimalProductionRecord => ({
  id: row.id,
  farmId: row.farm_id,
  animalId: row.animal_id,
  herdId: row.herd_id,
  recordDate: row.record_date,
  productionType: row.production_type as ProductionType,
  quantity: row.quantity,
  quantityUnit: row.quantity_unit,
  quality: row.quality,
  weightKg: row.weight_kg,
  bodyConditionScore: row.body_condition_score,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapWarehouseRow = (row: WarehouseRow): Warehouse => ({
  id: row.id,
  farmId: row.farm_id,
  name: row.name,
  location: row.location,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapInventoryItemRow = (row: InventoryItemRow): InventoryItem => ({
  id: row.id,
  farmId: row.farm_id,
  name: row.name,
  sku: row.sku,
  category: row.category as ItemCategory,
  unit: row.unit,
  description: row.description,
  reorderLevel: row.reorder_level,
  reorderQuantity: row.reorder_quantity,
  defaultCost: row.default_cost,
  defaultCostCurrency: row.default_cost_currency,
  preferredSupplier: row.preferred_supplier,
  isActive: row.is_active === 1,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  version: row.version,
  syncStatus: row.sync_status as SyncStatus,
  metadata: safeParseObject(row.metadata),
});

export const mapInventoryTransactionRow = (
  row: InventoryTransactionRow,
): InventoryTransaction => ({
  id: row.id,
  farmId: row.farm_id,
  itemId: row.item_id,
  warehouseId: row.warehouse_id,
  transactionType: row.transaction_type as InventoryTransactionType,
  transactionDate: row.transaction_date,
  quantity: row.quantity,
  quantityUnit: row.quantity_unit,
  unitCost: row.unit_cost,
  totalCost: row.total_cost,
  costCurrency: row.cost_currency,
  supplier: row.supplier,
  batchNumber: row.batch_number,
  expiryDate: row.expiry_date,
  reference: row.reference,
  targetType: (row.target_type as InventoryTargetType | null) ?? null,
  targetId: row.target_id,
  targetLabel: row.target_label,
  notes: row.notes,
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
