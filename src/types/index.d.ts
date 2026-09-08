type TodoStatus = "pending" | "progress" | "completed";
type TodoPriority = "none" | "low" | "medium" | "high" | "urgent";
type TodoRecurrence = "none" | "daily" | "weekly" | "monthly";
type TodoView = "list" | "grid" | "board" | "calendar";
type ThemePreference = "light" | "dark" | "system";
type Density = "comfortable" | "compact";

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
  createdAt?: string;
  updatedAt?: string;
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
  sort?: "createdAt" | "updatedAt" | "dueDate" | "priority" | "title";
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
};

type Stats = {
  summary: StatsSummary;
  byStatus: Array<{ name: TodoStatus; value: number }>;
  byPriority: Array<{ name: TodoPriority; value: number }>;
  completionTrend: Array<{ date: string; completed: number; created: number }>;
  topTags: Array<{ name: string; value: number }>;
};

type TagCount = { name: string; count: number };
