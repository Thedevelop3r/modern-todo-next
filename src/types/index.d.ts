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
};

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
  color: ProjectColor;
  archived?: boolean;
  order?: number;
  todoCount?: number;
  completedCount?: number;
  estimateTotal?: number;
  timeSpentTotal?: number;
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
  description?: string;
  priority?: TodoPriority;
  tags?: string[];
  subtasks?: Subtask[];
  estimate?: number | null;
  projectId?: string | null;
  recurrence?: TodoRecurrence;
  dueInDays?: number | null;
  useCount?: number;
};

type Todo = {
  _id?: string;
  title?: string;
  description?: string;
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
