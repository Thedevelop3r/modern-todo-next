import { z } from "zod";

/**
 * Single source of truth for shape rules. The API validates with the CommonJS
 * mirror in server/validation/schemas.js; these are the client-side twins used
 * by the forms so both sides reject the same input.
 */

export const STATUS_VALUES = ["pending", "progress", "completed"] as const;
export const PRIORITY_VALUES = ["none", "low", "medium", "high", "urgent"] as const;
export const RECURRENCE_VALUES = ["none", "daily", "weekly", "monthly"] as const;

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const subtaskSchema = z.object({
  title: z.string().trim().min(1, "Subtask cannot be empty").max(200),
  done: z.boolean().default(false),
});

export const todoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100, "Title must be at most 100 characters"),
  description: z.string().trim().max(1500, "Description must be at most 1500 characters").optional().or(z.literal("")),
  status: z.enum(STATUS_VALUES).default("pending"),
  priority: z.enum(PRIORITY_VALUES).default("none"),
  tags: z.array(z.string().trim().min(1).max(24)).max(10, "At most 10 tags").default([]),
  subtasks: z.array(subtaskSchema).max(50, "At most 50 subtasks").default([]),
  dueDate: z.string().datetime().nullable().optional(),
  recurrence: z.enum(RECURRENCE_VALUES).default("none"),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(50).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  avatar: z.string().max(64).optional(),
});

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultView: z.enum(["list", "grid", "board", "calendar"]).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
});

export type TodoInput = z.input<typeof todoSchema>;

/**
 * Rough password strength for the register/change-password meter.
 * Deliberately advisory - the hard rule is the 8-character minimum above.
 */
export function passwordStrength(password: string) {
  if (!password) return { score: 0, label: "Empty", hint: "Enter a password" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const capped = Math.min(score, 4);
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const hints = [
    "Use at least 8 characters",
    "Add length - 12+ characters is much stronger",
    "Mix upper and lower case",
    "Add a number or symbol",
    "Strong password",
  ];
  return { score: capped, label: labels[capped], hint: hints[capped] };
}
