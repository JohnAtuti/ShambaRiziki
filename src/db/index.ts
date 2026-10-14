// Connection lifecycle
export { getDb, closeDb } from "./client";

// Identity & time helpers
export { newId } from "./id";
export { nowIso, isoDaysAgo } from "./time";

// Recurrence helpers (used by task repo but also useful for calendar UI)
export {
  generateOccurrences,
  occurrenceDate,
  isRecurring,
  MAX_OCCURRENCES,
} from "./recurrence";

// Errors
export { DbError, NotFoundError, ValidationError } from "./errors";

// PIN hashing
export { hashPin, verifyPin, type PinHash } from "./pin";

// Repository context & audit helpers
export {
  type RepoContext,
  writeAudit,
  wrapDbError,
  newBaseFields,
  serialiseMetadata,
} from "./repository";

// Repos — users, farms, plots, crops
export { userRepo, findSoleOwner } from "./users";
export type { CreateUserInput, UpdateUserInput, UserRepo } from "./users";

export { farmRepo } from "./farms";
export type { CreateFarmInput, UpdateFarmInput, FarmRepo } from "./farms";

export { plotRepo } from "./plots";
export type { CreatePlotInput, UpdatePlotInput, PlotRepo } from "./plots";

export { cropRepo } from "./crops";
export type { CreateCropInput, UpdateCropInput, CropRepo } from "./crops";

export { cropCycleRepo } from "./cropCycles";
export type {
  CreateCropCycleInput,
  UpdateCropCycleInput,
  CropCycleRepo,
} from "./cropCycles";

export { cropActivityRepo } from "./cropActivities";
export type {
  CreateCropActivityInput,
  UpdateCropActivityInput,
  CropActivityRepo,
} from "./cropActivities";

export { attachmentRepo } from "./attachments";
export type {
  CreateAttachmentInput,
  UpdateAttachmentInput,
  AttachmentRepo,
} from "./attachments";

// Repos — livestock
export { herdRepo } from "./herds";
export type { CreateHerdInput, UpdateHerdInput, HerdRepo } from "./herds";

export { animalRepo } from "./animals";
export type {
  CreateAnimalInput,
  UpdateAnimalInput,
  AnimalRepo,
} from "./animals";

export { animalHealthRepo } from "./animalHealth";
export type {
  CreateHealthRecordInput,
  UpdateHealthRecordInput,
  AnimalHealthRepo,
} from "./animalHealth";

export { animalBreedingRepo } from "./animalBreeding";
export type {
  CreateBreedingRecordInput,
  UpdateBreedingRecordInput,
  AnimalBreedingRepo,
} from "./animalBreeding";

export { animalFeedingRepo } from "./animalFeeding";
export type {
  CreateFeedRecordInput,
  UpdateFeedRecordInput,
  AnimalFeedingRepo,
} from "./animalFeeding";

export { animalProductionRepo } from "./animalProduction";
export type {
  CreateProductionRecordInput,
  UpdateProductionRecordInput,
  AnimalProductionRepo,
} from "./animalProduction";

// Repos — inventory
export { warehouseRepo } from "./warehouses";
export type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  WarehouseRepo,
} from "./warehouses";

export { inventoryItemRepo } from "./inventoryItems";
export type {
  CreateItemInput,
  UpdateItemInput,
  InventoryItemRepo,
  ItemStock,
  ItemStockRow,
} from "./inventoryItems";

export { inventoryTransactionRepo } from "./inventoryTransactions";
export type {
  CreateTransactionInput,
  UpdateTransactionInput,
  InventoryTransactionRepo,
  ExpiringBatch,
} from "./inventoryTransactions";

// Repos — tasks
export { taskTemplateRepo } from "./taskTemplates";
export type {
  CreateTemplateInput,
  UpdateTemplateInput,
  TaskTemplateRepo,
} from "./taskTemplates";

export { taskRepo } from "./tasks";
export type {
  CreateTaskInput,
  UpdateTaskInput,
  CompleteTaskInput,
  TaskRepo,
} from "./tasks";

// Settings
export { settingsRepo } from "./settings";
export type { SettingsRepo, SettingsRow } from "./settings";

// Dev-only sanity check
export { runSmokeTest } from "./smokeTest";

// Domain types
export * from "./types";

// Repos — finance
export { financeAccountRepo } from "./financeAccounts";
export type {
  CreateAccountInput,
  UpdateAccountInput,
  FinanceAccountRepo,
  AccountBalance,
  AccountBalanceRow,
} from "./financeAccounts";

export { financeCategoryRepo } from "./financeCategories";
export type {
  CreateCategoryInput,
  UpdateCategoryInput,
  FinanceCategoryRepo,
} from "./financeCategories";

export { financeTransactionRepo } from "./financeTransactions";
export type {
  CreateTransactionInput as CreateFinanceTransactionInput,
  UpdateTransactionInput as UpdateFinanceTransactionInput,
  FinanceTransactionRepo,
  CategoryTotal,
  TargetTotal,
} from "./financeTransactions";

// Repos — reports (read-only aggregates over finance)
export { reportsRepo, windowForPeriod } from "./reports";
export type {
  ReportsRepo,
  DateWindow,
  PeriodKey,
  PeriodSummary,
  TargetProfit,
  MonthlySeriesPoint,
  FinanceTargetKind,
  CycleEconomics,
  AnimalEconomics,
} from "./reports";

// Repos — backup
export { backupRepo } from "./backup";
export type { BackupRepo, BackupFile, BackupValidation } from "./backup";

// Repos — export (CSV)
export { exportRepo, exportFilename } from "./export";
export type { ExportRepo } from "./export";

// Repos — sales
export { customerRepo } from "./customers";
export type {
  CustomerRepo,
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customers";

export { saleRepo } from "./sales";
export type {
  SaleRepo,
  CreateSaleInput,
  UpdateSaleInput,
  SaleItemInput,
} from "./sales";
