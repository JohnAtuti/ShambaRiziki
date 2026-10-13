import type { SQLiteBindValue } from "expo-sqlite";

import { NotFoundError, ValidationError } from "./errors";
import { generateOccurrences } from "./recurrence";
import {
  newBaseFields,
  wrapDbError,
  writeAudit,
  type RepoContext,
} from "./repository";
import { nowIso } from "./time";
import {
  mapTaskRow,
  type RecurrenceType,
  type Task,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
  type TaskTargetType,
  type TaskType,
} from "./types";

export interface CreateTaskInput {
  farmId: string;
  templateId?: string | null;
  title: string;
  description?: string | null;
  taskType?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate: string;
  scheduledStart?: string | null;
  assignedTo?: string | null;
  recurrenceType?: RecurrenceType;
  targetType?: TaskTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  estimatedHours?: number | null;
  notes?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  taskType?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  scheduledStart?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  assignedTo?: string | null;
  targetType?: TaskTargetType | null;
  targetId?: string | null;
  targetLabel?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  notes?: string | null;
}

export interface CompleteTaskInput {
  completedBy?: string | null;
  actualHours?: number | null;
  notes?: string | null;
}

export interface TaskRepo {
  listByFarm(ctx: RepoContext, farmId: string): Promise<Task[]>;
  listByStatus(
    ctx: RepoContext,
    farmId: string,
    status: TaskStatus,
  ): Promise<Task[]>;
  listByTarget(
    ctx: RepoContext,
    targetType: TaskTargetType,
    targetId: string,
  ): Promise<Task[]>;
  listBetween(
    ctx: RepoContext,
    farmId: string,
    fromIso: string,
    toIso: string,
  ): Promise<Task[]>;
  listOverdue(ctx: RepoContext, farmId: string): Promise<Task[]>;
  listTodays(ctx: RepoContext, farmId: string): Promise<Task[]>;
  listUpcoming(ctx: RepoContext, farmId: string, days: number): Promise<Task[]>;
  getById(ctx: RepoContext, id: string): Promise<Task | null>;
  countByStatus(
    ctx: RepoContext,
    farmId: string,
    status: TaskStatus,
  ): Promise<number>;
  countByRecurrenceParent(ctx: RepoContext, parentId: string): Promise<number>;
  create(ctx: RepoContext, input: CreateTaskInput): Promise<Task>;
  update(ctx: RepoContext, id: string, patch: UpdateTaskInput): Promise<Task>;
  complete(
    ctx: RepoContext,
    id: string,
    input: CompleteTaskInput,
  ): Promise<Task>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  softDeleteSeries(ctx: RepoContext, parentId: string): Promise<number>;
  restore(ctx: RepoContext, id: string): Promise<Task>;
}

const requireTitle = (title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) throw new ValidationError("Task title is required");
  if (trimmed.length > 200) throw new ValidationError("Task title is too long");
  return trimmed;
};

const validateDate = (iso: string, field: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
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

const validateTarget = (
  targetType: TaskTargetType | null | undefined,
  targetId: string | null | undefined,
): void => {
  const hasType = targetType != null;
  const hasId = targetId != null && targetId.trim() !== "";
  if (hasType !== hasId) {
    throw new ValidationError(
      "Target type and target id must both be set or both be empty",
    );
  }
};

const startOfUtcDayIso = (d: Date): string => {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
};

const endOfUtcDayIso = (d: Date): string => {
  const copy = new Date(d);
  copy.setUTCHours(23, 59, 59, 999);
  return copy.toISOString();
};

// Pre-generation horizon for recurring tasks: 90 days OR 30 occurrences,
// whichever comes first. See src/db/recurrence.ts for the reasoning.
const RECURRENCE_HORIZON_DAYS = 90;

export const taskRepo: TaskRepo = {
  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY due_date ASC, created_at ASC`,
        [farmId],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listByFarm", error);
    }
  },

  async listByStatus(ctx, farmId, status) {
    try {
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ? AND status = ? AND deleted_at IS NULL
          ORDER BY due_date ASC, created_at ASC`,
        [farmId, status],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listByStatus", error);
    }
  },

  async listByTarget(ctx, targetType, targetId) {
    try {
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE target_type = ? AND target_id = ? AND deleted_at IS NULL
          ORDER BY due_date ASC, created_at ASC`,
        [targetType, targetId],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listByTarget", error);
    }
  },

  async listBetween(ctx, farmId, fromIso, toIso) {
    try {
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ?
            AND due_date >= ?
            AND due_date <= ?
            AND deleted_at IS NULL
          ORDER BY due_date ASC, created_at ASC`,
        [farmId, fromIso, toIso],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listBetween", error);
    }
  },

  async listOverdue(ctx, farmId) {
    try {
      const now = new Date().toISOString();
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ?
            AND due_date < ?
            AND status IN ('pending', 'in_progress')
            AND deleted_at IS NULL
          ORDER BY due_date ASC`,
        [farmId, now],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listOverdue", error);
    }
  },

  async listTodays(ctx, farmId) {
    try {
      const start = startOfUtcDayIso(new Date());
      const end = endOfUtcDayIso(new Date());
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ?
            AND due_date >= ?
            AND due_date <= ?
            AND deleted_at IS NULL
          ORDER BY due_date ASC, created_at ASC`,
        [farmId, start, end],
      );
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listTodays", error);
    }
  },

  async listUpcoming(ctx, farmId, days) {
    try {
      const now = new Date();
      const start = startOfUtcDayIso(now);
      const end = new Date(now);
      end.setUTCDate(end.getUTCDate() + days);
      const endIso = endOfUtcDayIso(end);
      const rows = await ctx.db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
          WHERE farm_id = ?
            AND due_date > ?
            AND due_date <= ?
            AND status IN ('pending', 'in_progress')
            AND deleted_at IS NULL
          ORDER BY due_date ASC`,
        [farmId, endOfUtcDayIso(now), endIso],
      );
      // Note: `start` computed but only used to guard the window in future
      // versions. Kept for clarity.
      void start;
      return rows.map(mapTaskRow);
    } catch (error) {
      throw wrapDbError("taskRepo.listUpcoming", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<TaskRow>(
        `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapTaskRow(row) : null;
    } catch (error) {
      throw wrapDbError("taskRepo.getById", error);
    }
  },

  async countByStatus(ctx, farmId, status) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks
          WHERE farm_id = ? AND status = ? AND deleted_at IS NULL`,
        [farmId, status],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("taskRepo.countByStatus", error);
    }
  },

  async countByRecurrenceParent(ctx, parentId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks
          WHERE recurrence_parent_id = ? AND deleted_at IS NULL`,
        [parentId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("taskRepo.countByRecurrenceParent", error);
    }
  },

  async create(ctx, input) {
    const title = requireTitle(input.title);
    const dueDate = validateDate(input.dueDate, "Due date");
    validateNonNegative(input.estimatedHours, "Estimated hours");
    validateTarget(input.targetType, input.targetId);

    const recurrenceType = input.recurrenceType ?? "none";

    // Pre-generate all occurrences in one transaction.
    const dates = generateOccurrences(
      dueDate,
      recurrenceType,
      input.recurrenceType ? 30 : 1,
      RECURRENCE_HORIZON_DAYS,
    );

    const base = newBaseFields();
    const parentId = base.id;
    const createdIds: string[] = [];

    try {
      await ctx.db.withTransactionAsync(async () => {
        for (let i = 0; i < dates.length; i++) {
          const occurrenceId = i === 0 ? parentId : `${parentId}-o${i + 1}`;
          createdIds.push(occurrenceId);
          const fields = i === 0 ? base : newBaseFields();

          await ctx.db.runAsync(
            `INSERT INTO tasks (
              id, farm_id, template_id, title, description,
              task_type, priority, status, due_date, scheduled_start,
              assigned_to,
              recurrence_type, recurrence_parent_id, occurrence_index,
              target_type, target_id, target_label,
              estimated_hours, notes,
              created_at, updated_at, deleted_at, version, sync_status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              occurrenceId,
              input.farmId,
              input.templateId ?? null,
              title,
              input.description ?? null,
              input.taskType ?? "other",
              input.priority ?? "normal",
              input.status ?? "pending",
              dates[i],
              input.scheduledStart ?? null,
              input.assignedTo ?? null,
              recurrenceType,
              i === 0 ? null : parentId,
              i === 0 ? null : i + 1,
              input.targetType ?? null,
              input.targetId ?? null,
              input.targetLabel ?? null,
              input.estimatedHours ?? null,
              input.notes ?? null,
              fields.created_at,
              fields.updated_at,
              fields.deleted_at,
              fields.version,
              fields.sync_status,
              fields.metadata,
            ],
          );
        }

        await writeAudit(ctx, {
          entityType: "task",
          entityId: parentId,
          action: "create",
          changes: {
            title: [null, title],
            farmId: [null, input.farmId],
            occurrenceCount: [null, dates.length],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("taskRepo.create", error);
    }

    const created = await taskRepo.getById(ctx, parentId);
    if (!created) throw new NotFoundError("task", parentId);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await taskRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("task", id);

    if (patch.dueDate !== undefined) validateDate(patch.dueDate, "Due date");
    validateNonNegative(patch.estimatedHours, "Estimated hours");
    validateNonNegative(patch.actualHours, "Actual hours");

    const nextTargetType =
      patch.targetType !== undefined ? patch.targetType : existing.targetType;
    const nextTargetId =
      patch.targetId !== undefined ? patch.targetId : existing.targetId;
    validateTarget(nextTargetType, nextTargetId);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Task,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.title !== undefined) {
      const next = requireTitle(patch.title);
      if (next !== existing.title) put("title", next, "title", next);
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
    if (patch.priority !== undefined && patch.priority !== existing.priority) {
      put("priority", patch.priority, "priority", patch.priority);
    }
    if (patch.status !== undefined && patch.status !== existing.status) {
      put("status", patch.status, "status", patch.status);
    }
    if (patch.dueDate !== undefined && patch.dueDate !== existing.dueDate) {
      put("due_date", patch.dueDate, "dueDate", patch.dueDate);
    }
    if (
      patch.scheduledStart !== undefined &&
      patch.scheduledStart !== existing.scheduledStart
    ) {
      put(
        "scheduled_start",
        patch.scheduledStart,
        "scheduledStart",
        patch.scheduledStart,
      );
    }
    if (
      patch.completedAt !== undefined &&
      patch.completedAt !== existing.completedAt
    ) {
      put("completed_at", patch.completedAt, "completedAt", patch.completedAt);
    }
    if (
      patch.completedBy !== undefined &&
      patch.completedBy !== existing.completedBy
    ) {
      put("completed_by", patch.completedBy, "completedBy", patch.completedBy);
    }
    if (
      patch.assignedTo !== undefined &&
      patch.assignedTo !== existing.assignedTo
    ) {
      put("assigned_to", patch.assignedTo, "assignedTo", patch.assignedTo);
    }
    if (
      patch.targetType !== undefined &&
      patch.targetType !== existing.targetType
    ) {
      put("target_type", patch.targetType, "targetType", patch.targetType);
    }
    if (patch.targetId !== undefined && patch.targetId !== existing.targetId) {
      put("target_id", patch.targetId, "targetId", patch.targetId);
    }
    if (
      patch.targetLabel !== undefined &&
      patch.targetLabel !== existing.targetLabel
    ) {
      put("target_label", patch.targetLabel, "targetLabel", patch.targetLabel);
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
    if (
      patch.actualHours !== undefined &&
      patch.actualHours !== existing.actualHours
    ) {
      put("actual_hours", patch.actualHours, "actualHours", patch.actualHours);
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
          `UPDATE tasks SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "task",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("taskRepo.update", error);
    }

    const updated = await taskRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("task", id);
    return updated;
  },

  async complete(ctx, id, input) {
    const existing = await taskRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("task", id);

    validateNonNegative(input.actualHours, "Actual hours");

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE tasks
             SET status = 'completed',
                 completed_at = ?,
                 completed_by = ?,
                 actual_hours = COALESCE(?, actual_hours),
                 notes = COALESCE(?, notes),
                 updated_at = ?,
                 version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [
            nowIso(),
            input.completedBy ?? null,
            input.actualHours ?? null,
            input.notes ?? null,
            nowIso(),
            id,
          ],
        );
        await writeAudit(ctx, {
          entityType: "task",
          entityId: id,
          action: "update",
          changes: { status: [existing.status, "completed"] },
        });
      });
    } catch (error) {
      throw wrapDbError("taskRepo.complete", error);
    }

    const updated = await taskRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("task", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await taskRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("task", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE tasks
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "task",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("taskRepo.softDelete", error);
    }
  },

  async softDeleteSeries(ctx, parentId) {
    try {
      let affected = 0;
      await ctx.db.withTransactionAsync(async () => {
        // Include the parent itself and every child.
        const result = await ctx.db.runAsync(
          `UPDATE tasks
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE (id = ? OR recurrence_parent_id = ?)
             AND deleted_at IS NULL`,
          [nowIso(), nowIso(), parentId, parentId],
        );
        affected = result.changes ?? 0;
        await writeAudit(ctx, {
          entityType: "task_series",
          entityId: parentId,
          action: "delete",
          changes: { affected: [null, affected] },
        });
      });
      return affected;
    } catch (error) {
      throw wrapDbError("taskRepo.softDeleteSeries", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE tasks
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "task",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("taskRepo.restore", error);
    }

    const restored = await taskRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("task", id);
    return restored;
  },
};
