// CommonJS mirror of src/lib/validation.ts - both sides must reject the same input.

const { z } = require("zod");

const STATUS = ["pending", "progress", "completed"];
const PRIORITY = ["none", "low", "medium", "high", "urgent"];
const RECURRENCE = ["none", "daily", "weekly", "monthly"];
const VIEWS = ["list", "grid", "board", "calendar"];

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
const password = z.string().min(8, "Password must be at least 8 characters").max(128);

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50),
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: password,
});

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(50).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    avatar: z.string().max(64).optional(),
  })
  .strip();

const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]).optional(),
    defaultView: z.enum(VIEWS).optional(),
    pageSize: z.coerce.number().int().min(5).max(100).optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
  })
  .strip();

const subtask = z.object({
  _id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

const nullableDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

const createTodoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().max(1500).optional().default(""),
  status: z.enum(STATUS).default("pending"),
  priority: z.enum(PRIORITY).default("none"),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  subtasks: z.array(subtask).max(50).default([]),
  dueDate: nullableDate,
  recurrence: z.enum(RECURRENCE).default("none"),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
});

// Every field optional on update; only what is sent gets written.
const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1500).optional(),
    status: z.enum(STATUS).optional(),
    priority: z.enum(PRIORITY).optional(),
    tags: z.array(z.string().trim().min(1).max(24)).max(10).optional(),
    subtasks: z.array(subtask).max(50).optional(),
    dueDate: nullableDate,
    recurrence: z.enum(RECURRENCE).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    order: z.number().optional(),
  })
  .strip();

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one todo").max(200),
  action: z.enum(["status", "priority", "tag", "untag", "pin", "unpin", "archive", "unarchive", "delete"]),
  value: z.any().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/** Comma or repeat-friendly list parser for query params. */
const listParam = (values) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const parts = (Array.isArray(value) ? value : value.split(","))
        .map((v) => v.trim())
        .filter(Boolean);
      const allowed = values ? parts.filter((p) => values.includes(p)) : parts;
      return allowed.length ? allowed : undefined;
    });

const boolParam = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(200).optional(),
  status: listParam(STATUS),
  priority: listParam(PRIORITY),
  tags: listParam(),
  due: z.enum(["any", "overdue", "today", "week", "none"]).optional(),
  archived: boolParam,
  pinned: boolParam,
  sort: z.enum(["createdAt", "updatedAt", "dueDate", "priority", "title", "order"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

module.exports = {
  STATUS,
  PRIORITY,
  RECURRENCE,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  profileSchema,
  preferencesSchema,
  createTodoSchema,
  updateTodoSchema,
  bulkSchema,
  reorderSchema,
  listQuerySchema,
};
