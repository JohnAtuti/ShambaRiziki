/**
 * Typed error classes for the data layer. Repos throw these; UI catches
 * them with instanceof to decide how to respond. No raw SQLite errors
 * should ever reach the UI layer.
 */

export class DbError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DbError";
    this.cause = cause;
  }
}

export class NotFoundError extends DbError {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
    this.entity = entity;
    this.id = id;
  }
}

export class ValidationError extends DbError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
