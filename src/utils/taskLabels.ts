import type {
  RecurrenceType,
  TaskPriority,
  TaskStatus,
  TaskTargetType,
  TaskType,
} from "../db";

// Pure lookups. No `use` prefix.

export const iconForTaskType = (type: TaskType): string => {
  switch (type) {
    case "field_work":
      return "🌾";
    case "planting":
      return "🌱";
    case "fertilizer":
      return "💩";
    case "pesticide":
      return "🧪";
    case "irrigation":
      return "💧";
    case "harvest":
      return "🌾";
    case "livestock_care":
      return "🐄";
    case "health_check":
      return "🩺";
    case "breeding":
      return "💕";
    case "production":
      return "🥛";
    case "inventory_check":
      return "📦";
    case "maintenance":
      return "🔧";
    case "admin":
      return "📋";
    case "meeting":
      return "👥";
    case "other":
    default:
      return "📝";
  }
};

export const keyForTaskType = (type: TaskType): string => `task_type_${type}`;

export const keyForPriority = (priority: TaskPriority): string =>
  `task_priority_${priority}`;

export const colorForPriority = (priority: TaskPriority): string => {
  switch (priority) {
    case "low":
      return "#7E57C2";
    case "normal":
      return "#1976D2";
    case "high":
      return "#EF6C00";
    case "urgent":
      return "#C62828";
    default:
      return "#666";
  }
};

export const keyForStatus = (status: TaskStatus): string =>
  `task_status_${status}`;

export const colorForStatus = (status: TaskStatus): string => {
  switch (status) {
    case "pending":
      return "#1976D2";
    case "in_progress":
      return "#F9A825";
    case "completed":
      return "#2E7D32";
    case "cancelled":
      return "#757575";
    default:
      return "#666";
  }
};

export const iconForStatus = (status: TaskStatus): string => {
  switch (status) {
    case "pending":
      return "○";
    case "in_progress":
      return "◐";
    case "completed":
      return "●";
    case "cancelled":
      return "✕";
    default:
      return "○";
  }
};

export const keyForRecurrence = (type: RecurrenceType): string =>
  `recurrence_${type}`;

export const iconForRecurrence = (type: RecurrenceType): string => {
  switch (type) {
    case "none":
      return "";
    case "daily":
      return "🔁";
    case "weekly":
      return "🔁";
    case "biweekly":
      return "🔁";
    case "monthly":
      return "🔁";
    case "seasonal":
      return "🔁";
    case "yearly":
      return "🔁";
    default:
      return "";
  }
};

export const keyForTargetType = (type: TaskTargetType): string => {
  switch (type) {
    case "plot":
      return "task_target_plot";
    case "crop_cycle":
      return "task_target_crop_cycle";
    case "animal":
      return "task_target_animal";
    case "herd":
      return "task_target_herd";
    case "item":
      return "task_target_item";
    case "other":
    default:
      return "task_target_other";
  }
};

export const TASK_TYPE_VALUES: readonly TaskType[] = [
  "field_work",
  "planting",
  "fertilizer",
  "pesticide",
  "irrigation",
  "harvest",
  "livestock_care",
  "health_check",
  "breeding",
  "production",
  "inventory_check",
  "maintenance",
  "admin",
  "meeting",
  "other",
];

export const PRIORITY_VALUES: readonly TaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export const STATUS_VALUES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
];

export const RECURRENCE_VALUES: readonly RecurrenceType[] = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "seasonal",
  "yearly",
];

export const TARGET_TYPE_VALUES: readonly TaskTargetType[] = [
  "plot",
  "crop_cycle",
  "animal",
  "herd",
  "item",
  "other",
];

/**
 * Returns a human-friendly due-date status for display.
 * `kind` is one of: "overdue" | "today" | "tomorrow" | "upcoming" | "past"
 * The caller maps this to an i18n key.
 */
export type DueStatus = {
  kind: "overdue" | "today" | "tomorrow" | "upcoming" | "past";
  daysAway: number;
};

export const computeDueStatus = (
  dueIso: string,
  now: Date = new Date(),
): DueStatus => {
  const due = new Date(dueIso);
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const startOfDue = new Date(due);
  startOfDue.setUTCHours(0, 0, 0, 0);

  const diffMs = startOfDue.getTime() - startOfToday.getTime();
  const daysAway = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysAway < 0) return { kind: "overdue", daysAway: -daysAway };
  if (daysAway === 0) return { kind: "today", daysAway: 0 };
  if (daysAway === 1) return { kind: "tomorrow", daysAway: 1 };
  return { kind: "upcoming", daysAway };
};
