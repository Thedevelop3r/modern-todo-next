// CommonJS mirror of src/lib/validation.ts - both sides must reject the same input.

const { z } = require("zod");

const STATUS = ["pending", "progress", "completed"];
const PRIORITY = ["none", "low", "medium", "high", "urgent"];
const RECURRENCE = ["none", "daily", "weekly", "monthly"];
const VIEWS = ["list", "grid", "board", "calendar", "table"];
const UI_SCALES = ["xs", "small", "normal", "large", "xl"];
const THEME_IDS = require("../../shared/themes.json").map((theme) => theme.id);

/** A Google Fonts family name, or "" for the built-in Inter. */
const FONT_FAMILY = z
  .string()
  .trim()
  .max(64)
  .regex(/^$|^[A-Za-z0-9][A-Za-z0-9 ]*$/, "That is not a valid font name");

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
  // Present only once the account asks for a second factor.
  code: z.string().trim().max(20).optional(),
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
    uiScale: z.enum(UI_SCALES).optional(),
    themeId: z.enum(THEME_IDS, { message: "Unknown theme" }).optional(),
    fontFamily: FONT_FAMILY.optional(),
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

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

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
  projectId: z.union([objectId, z.null()]).optional(),
  startDate: nullableDate,
  estimate: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  blockedBy: z.array(objectId).max(20).default([]),
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
    projectId: z.union([objectId, z.null()]).optional(),
    startDate: nullableDate,
    estimate: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
    blockedBy: z.array(objectId).max(20).optional(),
  })
  .strip();

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one todo").max(200),
  action: z.enum([
    "status",
    "priority",
    "tag",
    "untag",
    "pin",
    "unpin",
    "archive",
    "unarchive",
    "delete",
    "project",
  ]),
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
  projectId: z.string().optional(),
  blocked: boolParam,
  sort: z
    .enum(["createdAt", "updatedAt", "dueDate", "startDate", "priority", "title", "order", "estimate"])
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().max(500).optional().default(""),
  color: z
    .enum(["slate", "red", "orange", "amber", "green", "teal", "sky", "indigo", "violet", "pink"])
    .default("indigo"),
  archived: z.boolean().default(false),
});

const projectUpdateSchema = projectSchema.partial().strip();

const savedViewSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  // Free-form so the dashboard's filter shape can grow without a migration.
  query: z.record(z.string(), z.any()).default({}),
  icon: z.string().max(32).default("bookmark"),
  pinned: z.boolean().default(false),
});

const savedViewUpdateSchema = savedViewSchema.partial().strip();

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().max(1500).optional().default(""),
  priority: z.enum(PRIORITY).default("none"),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  subtasks: z.array(subtask).max(50).default([]),
  estimate: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  projectId: z.union([objectId, z.null()]).optional(),
  recurrence: z.enum(RECURRENCE).default("none"),
  dueInDays: z.union([z.coerce.number().int().min(0).max(3650), z.null()]).optional(),
});

const templateUpdateSchema = templateSchema.partial().strip();

const templateFromTodoSchema = z.object({
  todoId: objectId,
  name: z.string().trim().max(60).optional(),
});

const tagRenameSchema = z.object({
  from: z.string().trim().min(1).max(24),
  to: z.string().trim().min(1).max(24),
});

const tagMergeSchema = z.object({
  sources: z.array(z.string().trim().min(1).max(24)).min(1).max(20),
  target: z.string().trim().min(1).max(24),
});

const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(2000),
});

const importSchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  data: z.string().min(1, "There is nothing to import").max(2_000_000),
  /** Defaults to a preview: importing for real is an explicit second call. */
  dryRun: z.coerce.boolean().default(true),
  skipDuplicates: z.coerce.boolean().default(true),
});

const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6, "Enter the 6-digit code").max(20),
});

const passwordConfirmSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

/** Deleting an account asks for the password *and* the word, on purpose. */
const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirm: z.literal("DELETE", { message: 'Type DELETE to confirm' }),
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
  projectSchema,
  projectUpdateSchema,
  commentSchema,
  savedViewSchema,
  savedViewUpdateSchema,
  templateSchema,
  templateUpdateSchema,
  templateFromTodoSchema,
  tagRenameSchema,
  tagMergeSchema,
  importSchema,
  exportQuerySchema,
  auditQuerySchema,
  twoFactorCodeSchema,
  passwordConfirmSchema,
  deleteAccountSchema,
  objectId,
};
