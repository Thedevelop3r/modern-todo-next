type TodoStatus = "pending" | "progress" | "completed";
type TodoPriority = "none" | "low" | "medium" | "high" | "urgent";
type TodoRecurrence = "none" | "daily" | "weekly" | "monthly";
type TodoView = "list" | "grid" | "board" | "calendar" | "table";
type ThemePreference = "light" | "dark" | "system";
type Density = "comfortable" | "compact";
type UiScale = "xs" | "small" | "normal" | "large" | "xl";

type Subtask = {
  _id?: string;
  title: string;
  done: boolean;
};

type Preferences = {
  theme: ThemePreference;
  defaultView: TodoView;
  pageSize: number;
  density: Density;
  uiScale: UiScale;
  /** A theme id from shared/themes.json. Orthogonal to `theme` above. */
  themeId: string;
  /** A Google Fonts family, served through /api/fonts. "" = the built-in Inter. */
  fontFamily: string;
  /** Which application variant this account runs as; see shared/variants/. */
  applicationType: string;
};

/** A record's extra fields, keyed by variant id. Only the active one is shown. */
type VariantData = Record<string, Record<string, unknown>>;

type User = {
  _id?: string;
  name?: string;
  email?: string;
  role?: "admin" | "user";
  status?: string;
  avatar?: string;
  preferences?: Preferences;
  lastLoginAt?: string;
  /** Only the flag reaches the client - the secret never leaves the server. */
  twoFactor?: { enabled: boolean; enabledAt?: string | null };
  createdAt?: string;
  updatedAt?: string;
};

/** One signed-in device, as listed by the security page. */
type Session = {
  id: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  lastSeenAt: string;
  current?: boolean;
};

type AuditEntry = {
  _id?: string;
  action: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
};

/** What an import would do (dry run) or did do (the real thing). */
type ImportSummary = {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  willCreate: number;
  created: number;
  projectsCreated: number;
  rejected: Array<{ line: number; title: string; issues: string[] }>;
  preview: Array<{
    title: string;
    status: TodoStatus;
    priority: TodoPriority;
    dueDate?: string | null;
    project?: string | null;
  }>;
};

type ProjectColor =
  | "slate" | "red" | "orange" | "amber" | "green"
  | "teal" | "sky" | "indigo" | "violet" | "pink";

type Project = {
  _id?: string;
  name: string;
  description?: string;
  descriptionHtml?: string;
  color: ProjectColor;
  archived?: boolean;
  order?: number;
  todoCount?: number;
  completedCount?: number;
  estimateTotal?: number;
  timeSpentTotal?: number;
  /** Printed on every PDF this project's records generate. */
  organizationName?: string;
  /** Overrides the account's variant for this project. null means inherit. */
  applicationType?: string | null;
  variantData?: VariantData;
  createdAt?: string;
};

type TodoComment = {
  _id?: string;
  todoId?: string;
  body: string;
  editedAt?: string | null;
  createdAt?: string;
};

type Activity = {
  _id?: string;
  todoId?: string | null;
  action: string;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  meta?: Record<string, unknown> | null;
  createdAt?: string;
};

type SavedView = {
  _id?: string;
  name: string;
  query: Record<string, unknown>;
  icon?: string;
  pinned?: boolean;
  order?: number;
};

type TodoTemplate = {
  _id?: string;
  name: string;
  title: string;
  titleHtml?: string;
  description?: string;
  descriptionHtml?: string;
  priority?: TodoPriority;
  tags?: string[];
  subtasks?: Subtask[];
  estimate?: number | null;
  projectId?: string | null;
  recurrence?: TodoRecurrence;
  dueInDays?: number | null;
  useCount?: number;
  variantData?: VariantData;
};

type Todo = {
  _id?: string;
  title?: string;
  /** Inline marks only. Sanitized server-side; safe to render as HTML. */
  titleHtml?: string;
  /** The plaintext mirror of `descriptionHtml`, derived on the server. */
  description?: string;
  /** Sanitized rich text. Safe to render as HTML. */
  descriptionHtml?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  tags?: string[];
  subtasks?: Subtask[];
  dueDate?: string | null;
  completedAt?: string | null;
  pinned?: boolean;
  archived?: boolean;
  order?: number;
  recurrence?: TodoRecurrence;
  projectId?: string | null;
  startDate?: string | null;
  estimate?: number | null;
  timeSpent?: number;
  timerStartedAt?: string | null;
  blockedBy?: string[];
  /** Variant extras. Switching variants hides these; it never deletes them. */
  variantData?: VariantData;
  ownerId?: string;
  todoId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Todos = Array<Todo>;

type TodoMeta = {
  totalRecords?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
};

/** Query state for the todo list. Mirrored into the URL query string. */
type TodoFilter = {
  page?: number;
  limit?: number;
  q?: string;
  status?: TodoStatus[];
  priority?: TodoPriority[];
  tags?: string[];
  due?: "any" | "overdue" | "today" | "week" | "none";
  archived?: boolean;
  projectId?: string;
  blocked?: boolean;
  sort?: "createdAt" | "updatedAt" | "dueDate" | "startDate" | "priority" | "title" | "estimate" | "order";
  order?: "asc" | "desc";
};

type Paginated<T> = {
  data: T[];
  meta: TodoMeta;
};

type StatsSummary = {
  total: number;
  completed: number;
  pending: number;
  progress: number;
  overdue: number;
  dueToday: number;
  archived: number;
  trashed: number;
  pinned: number;
  completionRate: number;
  currentStreak: number;
  estimatedPoints: number;
  completedPoints: number;
  timeSpent: number;
};

type Stats = {
  summary: StatsSummary;
  byStatus: Array<{ name: TodoStatus; value: number }>;
  byPriority: Array<{ name: TodoPriority; value: number }>;
  completionTrend: Array<{ date: string; completed: number; created: number }>;
  topTags: Array<{ name: string; value: number }>;
};

type TagCount = { name: string; count: number };

// ---- object storage ----

type FileKind = "image" | "video" | "audio" | "document" | "pdf";
type FileScopeKind = "todo" | "project" | "template" | "user" | "variant";
type StorageTier = "base" | "10gb" | "25gb" | "50gb" | "100gb";
type PerFileTier = "base" | "plus";

/** One file in the object store. The bytes live in GridFS; this is the record. */
type StoredFile = {
  _id: string;
  scope: { kind: FileScopeKind; refId?: string | null };
  kind: FileKind;
  source?: "upload" | "generated";
  filename: string;
  mime: string;
  originalSize: number;
  storedSize: number;
  checksum?: string;
  compression?: { requested: boolean; applied: boolean; codec: string; ratio: number };
  /** Bit flags; see FILE_FLAGS in server/config/storage.js. */
  flags?: number;
  state: "pending" | "uploading" | "compressing" | "storing" | "ready" | "failed";
  error?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  pages?: number | null;
  createdAt?: string;
};

type StorageSummary = {
  usedBytes: number;
  quotaBytes: number;
  tier: StorageTier;
  perFileTier: PerFileTier;
  fileCount: number;
  caps: Record<FileKind, number>;
  tiers: Array<{ id: StorageTier; label: string; quotaBytes: number }>;
};

/** Which record a generated PDF belongs to. */
type PdfSubjectKind = "todo" | "project";

/** One rendered version. The bytes are a StoredFile; this is the version record. */
type GeneratedPdf = {
  _id: string;
  subject: { kind: PdfSubjectKind; refId: string };
  fileId: string;
  version: number;
  variant: string;
  template: string;
  filename: string;
  sizeBytes: number;
  snapshotHash: string;
  /** The title as it read when this version was made. */
  snapshotTitle: string;
  generatedBy: { userId?: string | null; name: string };
  generatedAt: string;
  renderMs: number;
  /**
   * Whether rendering the record *now* would produce the same document. Served
   * by the API rather than guessed at from timestamps.
   */
  current: boolean;
  createdAt?: string;
};
