import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import {
  mapTaskTemplateRow,
  type RecurrenceType,
  type TaskPriority,
  type TaskTargetType,
  type TaskTemplate,
  type TaskTemplateRow,
  type TaskType,
} from "./types";

export interface CreateTemplateInput {
  farmId: string;
  name: string;
  description?: string | null;
  taskType?: TaskType;
  defaultPriority?: TaskPriority;
  defaultRecurrenceType?: RecurrenceType;
  defaultDueOffsetDays?: number | null;
  defaultTargetType?: TaskTargetType | null;
  estimatedHours?: number | null;
  notes?: string | null;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  taskType?: TaskType;
  defaultPriority?: TaskPriority;
  defaultRecurrenceType?: RecurrenceType;
  defaultDueOffsetDays?: number | null;
  defaultTargetType?: TaskTargetType | null;
  estimatedHours?: number | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface TaskTemplateRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<TaskTemplate[]>;
  listActiveByFarm(ctx: RepoContext, farmId: string): Promise<TaskTemplate[]>;
  getById(ctx: RepoContext, id: string): Promise<TaskTemplate | null>;
  countByFarm(ctx: RepoContext, farmId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateTemplateInput): Promise<TaskTemplate>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateTemplateInput,
  ): Promise<TaskTemplate>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<TaskTemplate>;
}

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Template name is required");
  if (trimmed.length > 150) {
    throw new ValidationError("Template name is too long");
  }
  return trimmed;
};

const validateNonNegative = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value == null) return;
  if (value < 0) throw new ValidationError(`${field} must be non-negative`);
};

export const taskTemplateRepo: TaskTemplateRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<TaskTemplateRow>(
        `SELECT * FROM task_templates
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapTaskTemplateRow);
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.listByFarm", error);
    }
  },

  async listActiveByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<TaskTemplateRow>(
        `SELECT * FROM task_templates
          WHERE farm_id = ? AND is_active = 1 AND deleted_at IS NULL
          ORDER BY name ASC`,
        [farmId],
      );
      return rows.map(mapTaskTemplateRow);
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.listActiveByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<TaskTemplateRow>(
        `SELECT * FROM task_templates WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapTaskTemplateRow(row) : null;
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.getById", error);
    }
  },

  async countByFarm(ctx, farmId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM task_templates
          WHERE farm_id = ? AND deleted_at IS NULL`,
        [farmId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.countByFarm", error);
    }
  },

  async create(ctx, input) {
    const name = requireName(input.name);
    validateNonNegative(input.defaultDueOffsetDays, "Due offset");
    validateNonNegative(input.estimatedHours, "Estimated hours");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO task_templates (
            id, farm_id, name, description, task_type, default_priority,
            default_recurrence_type, default_due_offset_days,
            default_target_type, estimated_hours, is_active, notes,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            name,
            input.description ?? null,
            input.taskType ?? "other",
            input.defaultPriority ?? "normal",
            input.defaultRecurrenceType ?? "none",
            input.defaultDueOffsetDays ?? null,
            input.defaultTargetType ?? null,
            input.estimatedHours ?? null,
            1,
            input.notes ?? null,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );
        await writeAudit(ctx, {
          entityType: "task_template",
          entityId: base.id,
          action: "create",
          changes: { name: [null, name], farmId: [null, input.farmId] },
        });
      });
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.create", error);
    }

    const created = await taskTemplateRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("task_template", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await taskTemplateRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("task_template", id);

    validateNonNegative(patch.defaultDueOffsetDays, "Due offset");
    validateNonNegative(patch.estimatedHours, "Estimated hours");

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof TaskTemplate,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.name !== undefined) {
      const next = requireName(patch.name);
      if (next !== existing.name) put("name", next, "name", next);
    }
    if (
      patch.description !== undefined &&
      patch.description !== existing.description
    ) {
      put("description", patch.description, "description", patch.description);
    }
    if (patch.taskType !== undefined && patch.taskType !== existing.taskType) {
      put("task_type", patch.taskType, "taskType", patch.taskType);
    }
    if (
      patch.defaultPriority !== undefined &&
      patch.defaultPriority !== existing.defaultPriority
    ) {
      put(
        "default_priority",
        patch.defaultPriority,
        "defaultPriority",
        patch.defaultPriority,
      );
    }
    if (
      patch.defaultRecurrenceType !== undefined &&
      patch.defaultRecurrenceType !== existing.defaultRecurrenceType
    ) {
      put(
        "default_recurrence_type",
        patch.defaultRecurrenceType,
        "defaultRecurrenceType",
        patch.defaultRecurrenceType,
      );
    }
    if (
      patch.defaultDueOffsetDays !== undefined &&
      patch.defaultDueOffsetDays !== existing.defaultDueOffsetDays
    ) {
      put(
        "default_due_offset_days",
        patch.defaultDueOffsetDays,
        "defaultDueOffsetDays",
        patch.defaultDueOffsetDays,
      );
    }
    if (
      patch.defaultTargetType !== undefined &&
      patch.defaultTargetType !== existing.defaultTargetType
    ) {
      put(
        "default_target_type",
        patch.defaultTargetType,
        "defaultTargetType",
        patch.defaultTargetType,
      );
    }
    if (
      patch.estimatedHours !== undefined &&
      patch.estimatedHours !== existing.estimatedHours
    ) {
      put(
        "estimated_hours",
        patch.estimatedHours,
        "estimatedHours",
        patch.estimatedHours,
      );
    }
    if (patch.isActive !== undefined && patch.isActive !== existing.isActive) {
      put("is_active", patch.isActive ? 1 : 0, "isActive", patch.isActive);
    }
    if (patch.notes !== undefined && patch.notes !== existing.notes) {
      put("notes", patch.notes, "notes", patch.notes);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE task_templates SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "task_template",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.update", error);
    }

    const updated = await taskTemplateRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("task_template", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await taskTemplateRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("task_template", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE task_templates
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "task_template",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE task_templates
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "task_template",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("taskTemplateRepo.restore", error);
    }

    const restored = await taskTemplateRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("task_template", id);
    return restored;
  },
};
