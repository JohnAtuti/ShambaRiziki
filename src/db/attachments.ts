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
  mapAttachmentRow,
  type Attachment,
  type AttachmentKind,
  type AttachmentRow,
} from "./types";

export interface CreateAttachmentInput {
  farmId: string;
  entityType: string;
  entityId: string;
  kind: AttachmentKind;
  localPath: string;
  remoteUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  caption?: string | null;
}

export interface UpdateAttachmentInput {
  caption?: string | null;
  remoteUrl?: string | null;
}

export interface AttachmentRepo {
  listByEntity(
    ctx: RepoContext,
    entityType: string,
    entityId: string,
  ): Promise<Attachment[]>;
  listByEntityAndKind(
    ctx: RepoContext,
    entityType: string,
    entityId: string,
    kind: AttachmentKind,
  ): Promise<Attachment[]>;
  listByFarm(ctx: RepoContext, farmId: string): Promise<Attachment[]>;
  getById(ctx: RepoContext, id: string): Promise<Attachment | null>;
  countByEntity(
    ctx: RepoContext,
    entityType: string,
    entityId: string,
  ): Promise<number>;
  create(ctx: RepoContext, input: CreateAttachmentInput): Promise<Attachment>;
  update(
    ctx: RepoContext,
    id: string,
    patch: UpdateAttachmentInput,
  ): Promise<Attachment>;
  softDelete(ctx: RepoContext, id: string): Promise<void>;
  restore(ctx: RepoContext, id: string): Promise<Attachment>;
}

const validatePath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) throw new ValidationError("Attachment path is required");
  if (trimmed.length > 500) {
    throw new ValidationError("Attachment path is too long");
  }
  return trimmed;
};

const validateSize = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value == null) return;
  if (value < 0) throw new ValidationError(`${field} must be non-negative`);
};

export const attachmentRepo: AttachmentRepo = {
  async listByEntity(ctx, entityType, entityId) {
    try {
      const rows = await ctx.db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments
          WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [entityType, entityId],
      );
      return rows.map(mapAttachmentRow);
    } catch (error) {
      throw wrapDbError("attachmentRepo.listByEntity", error);
    }
  },

  async listByEntityAndKind(ctx, entityType, entityId, kind) {
    try {
      const rows = await ctx.db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments
          WHERE entity_type = ? AND entity_id = ? AND kind = ?
            AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [entityType, entityId, kind],
      );
      return rows.map(mapAttachmentRow);
    } catch (error) {
      throw wrapDbError("attachmentRepo.listByEntityAndKind", error);
    }
  },

  async listByFarm(ctx, farmId) {
    try {
      const rows = await ctx.db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments
          WHERE farm_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        [farmId],
      );
      return rows.map(mapAttachmentRow);
    } catch (error) {
      throw wrapDbError("attachmentRepo.listByFarm", error);
    }
  },

  async getById(ctx, id) {
    try {
      const row = await ctx.db.getFirstAsync<AttachmentRow>(
        `SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      return row ? mapAttachmentRow(row) : null;
    } catch (error) {
      throw wrapDbError("attachmentRepo.getById", error);
    }
  },

  async countByEntity(ctx, entityType, entityId) {
    try {
      const row = await ctx.db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM attachments
          WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL`,
        [entityType, entityId],
      );
      return row?.count ?? 0;
    } catch (error) {
      throw wrapDbError("attachmentRepo.countByEntity", error);
    }
  },

  async create(ctx, input) {
    const localPath = validatePath(input.localPath);
    validateSize(input.sizeBytes, "Size");
    validateSize(input.durationMs, "Duration");
    const base = newBaseFields();

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `INSERT INTO attachments (
            id, farm_id, entity_type, entity_id, kind,
            local_path, remote_url, mime_type, size_bytes, duration_ms, caption,
            created_at, updated_at, deleted_at, version, sync_status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            base.id,
            input.farmId,
            input.entityType,
            input.entityId,
            input.kind,
            localPath,
            input.remoteUrl ?? null,
            input.mimeType ?? null,
            input.sizeBytes ?? null,
            input.durationMs ?? null,
            input.caption ?? null,
            base.created_at,
            base.updated_at,
            base.deleted_at,
            base.version,
            base.sync_status,
            base.metadata,
          ],
        );
        await writeAudit(ctx, {
          entityType: "attachment",
          entityId: base.id,
          action: "create",
          changes: {
            kind: [null, input.kind],
            target: [null, `${input.entityType}:${input.entityId}`],
          },
        });
      });
    } catch (error) {
      throw wrapDbError("attachmentRepo.create", error);
    }

    const created = await attachmentRepo.getById(ctx, base.id);
    if (!created) throw new NotFoundError("attachment", base.id);
    return created;
  },

  async update(ctx, id, patch) {
    const existing = await attachmentRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("attachment", id);

    const sets: string[] = [];
    const params: SQLiteBindValue[] = [];
    const changes: Record<string, [unknown, unknown]> = {};

    const put = (
      column: string,
      columnValue: SQLiteBindValue,
      domainKey: keyof Attachment,
      domainValue: unknown,
    ): void => {
      sets.push(`${column} = ?`);
      params.push(columnValue);
      changes[domainKey as string] = [
        existing[domainKey] as unknown,
        domainValue,
      ];
    };

    if (patch.caption !== undefined && patch.caption !== existing.caption) {
      put("caption", patch.caption, "caption", patch.caption);
    }
    if (
      patch.remoteUrl !== undefined &&
      patch.remoteUrl !== existing.remoteUrl
    ) {
      put("remote_url", patch.remoteUrl, "remoteUrl", patch.remoteUrl);
    }

    if (sets.length === 0) return existing;

    sets.push("updated_at = ?", "version = version + 1");
    params.push(nowIso(), id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE attachments SET ${sets.join(", ")}
             WHERE id = ? AND deleted_at IS NULL`,
          params,
        );
        await writeAudit(ctx, {
          entityType: "attachment",
          entityId: id,
          action: "update",
          changes,
        });
      });
    } catch (error) {
      throw wrapDbError("attachmentRepo.update", error);
    }

    const updated = await attachmentRepo.getById(ctx, id);
    if (!updated) throw new NotFoundError("attachment", id);
    return updated;
  },

  async softDelete(ctx, id) {
    const existing = await attachmentRepo.getById(ctx, id);
    if (!existing) throw new NotFoundError("attachment", id);

    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE attachments
             SET deleted_at = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NULL`,
          [nowIso(), nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "attachment",
          entityId: id,
          action: "delete",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("attachmentRepo.softDelete", error);
    }
  },

  async restore(ctx, id) {
    try {
      await ctx.db.withTransactionAsync(async () => {
        await ctx.db.runAsync(
          `UPDATE attachments
             SET deleted_at = NULL, updated_at = ?, version = version + 1
           WHERE id = ? AND deleted_at IS NOT NULL`,
          [nowIso(), id],
        );
        await writeAudit(ctx, {
          entityType: "attachment",
          entityId: id,
          action: "restore",
          changes: null,
        });
      });
    } catch (error) {
      throw wrapDbError("attachmentRepo.restore", error);
    }

    const restored = await attachmentRepo.getById(ctx, id);
    if (!restored) throw new NotFoundError("attachment", id);
    return restored;
  },
};
