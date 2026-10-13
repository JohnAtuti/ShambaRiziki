// Connection lifecycle
export { getDb, closeDb } from "./client";

// Identity & time helpers
export { newId } from "./id";
export { nowIso, isoDaysAgo } from "./time";

// Errors — all data-layer failures are one of these
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

// Repos
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

export { settingsRepo } from "./settings";
export type { SettingsRepo, SettingsRow } from "./settings";

// Dev-only sanity check
export { runSmokeTest } from "./smokeTest";

// Domain types
export * from "./types";
