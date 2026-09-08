/**
 * The single typed entry point to the API.
 *
 * Paths are relative because the Express app is mounted at /api on the same
 * origin by the custom server (see server.js) - there is no host to configure.
 */

export const API_BASE = "/api";

export const API_ENDPOINT = {
  base: API_BASE,
  login: `${API_BASE}/user/login`,
  register: `${API_BASE}/user/register`,
  logout: `${API_BASE}/user/logout`,
  me: `${API_BASE}/user/me`,
  updateUser: `${API_BASE}/user/update`,
  password: `${API_BASE}/user/password`,
  preferences: `${API_BASE}/user/preferences`,
  todo: `${API_BASE}/todo`,
  trash: `${API_BASE}/trash`,
  stats: `${API_BASE}/stats`,
  tags: `${API_BASE}/tags`,
  project: `${API_BASE}/project`,
  view: `${API_BASE}/view`,
  template: `${API_BASE}/template`,
  account: `${API_BASE}/account`,
};

/** Error carrying the API's status code so callers can branch on it. */
export class ApiError extends Error {
  status: number;
  details?: Array<{ path: string; message: string }>;
  /** Seconds to wait, present on a 429. */
  retryAfter?: number;
  /** The id the API logged this request under, for a bug report. */
  requestId?: string;

  constructor(
    message: string,
    status: number,
    options: { details?: Array<{ path: string; message: string }>; retryAfter?: number; requestId?: string } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options.details;
    this.retryAfter = options.retryAfter;
    this.requestId = options.requestId;
  }

  get isRateLimited() {
    return this.status === 429;
  }
}

/** "in 2 minutes" / "in 45 seconds", for a rate-limit message. */
export function formatRetryAfter(seconds?: number) {
  if (!seconds || seconds < 1) return "shortly";
  if (seconds < 60) return `in ${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

/**
 * Build a relative URL with a query string. `new URL()` cannot be used here
 * because these paths are relative; array values repeat the key.
 */
export function withQuery(path: string, params: Record<string, QueryValue> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => search.append(key, String(entry)));
      return;
    }
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers:
      options.body !== undefined
        ? { "Content-Type": "application/json", ...(options.headers || {}) }
        : options.headers,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const header = Number(response.headers.get("Retry-After"));
    throw new ApiError(payload?.message || response.statusText || "Request failed", response.status, {
      details: payload?.details,
      retryAfter: payload?.retryAfter ?? (Number.isFinite(header) ? header : undefined),
      requestId: payload?.requestId || response.headers.get("X-Request-Id") || undefined,
    });
  }

  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data);

/**
 * Downloads a generated file. The API answers with a body plus a
 * `Content-Disposition`, so the browser is handed a blob URL rather than being
 * navigated away - a navigation would drop the session cookie handling.
 */
async function download(path: string, fallbackName: string) {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) {
    const text = await response.text();
    let message = response.statusText;
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      /* a non-JSON error body is fine; keep the status text */
    }
    throw new ApiError(message, response.status, {
      requestId: response.headers.get("X-Request-Id") || undefined,
    });
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { name, size: blob.size };
}

export const api = {
  // ---- auth / account ----
  login: (input: { email: string; password: string; code?: string }) =>
    request<User & { twoFactorRequired?: boolean }>(API_ENDPOINT.login, {
      method: "POST",
      body: body(input),
    }),

  register: (input: { name: string; email: string; password: string }) =>
    request<User>(API_ENDPOINT.register, { method: "POST", body: body(input) }),

  logout: () => request<{ message: string }>(API_ENDPOINT.logout, { method: "POST" }),

  me: () => request<User>(API_ENDPOINT.me),

  updateProfile: (input: Partial<User>) =>
    request<User>(API_ENDPOINT.updateUser, { method: "PUT", body: body(input) }),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>(API_ENDPOINT.password, { method: "PUT", body: body(input) }),

  updatePreferences: (input: Partial<Preferences>) =>
    request<User>(API_ENDPOINT.preferences, { method: "PUT", body: body(input) }),

  // ---- data: export, import, sample ----
  exportTodos: (format: "json" | "csv" = "json") =>
    download(withQuery(`${API_ENDPOINT.account}/export/todos`, { format }), `modern-todo.${format}`),

  exportAccount: () => download(`${API_ENDPOINT.account}/export`, "modern-todo-account.json"),

  importTodos: (input: { format: "json" | "csv"; data: string; dryRun: boolean; skipDuplicates?: boolean }) =>
    request<ImportSummary>(`${API_ENDPOINT.account}/import`, { method: "POST", body: body(input) }),

  createSampleData: () =>
    request<{ todos: number; projects: number }>(`${API_ENDPOINT.account}/sample-data`, { method: "POST" }),

  // ---- sessions, 2FA, audit, deletion ----
  listSessions: () => request<Session[]>(`${API_ENDPOINT.account}/sessions`),

  revokeSession: (id: string) =>
    request<{ message: string; remaining: number }>(`${API_ENDPOINT.account}/sessions/${id}`, { method: "DELETE" }),

  revokeAllSessions: () =>
    request<{ message: string; revoked: number }>(`${API_ENDPOINT.account}/sessions/all`, { method: "DELETE" }),

  startTwoFactor: () =>
    request<{ secret: string; otpauthUri: string }>(`${API_ENDPOINT.account}/2fa/setup`, { method: "POST" }),

  enableTwoFactor: (code: string) =>
    request<{ message: string; recoveryCodes: string[] }>(`${API_ENDPOINT.account}/2fa/enable`, {
      method: "POST",
      body: body({ code }),
    }),

  disableTwoFactor: (password: string) =>
    request<{ message: string }>(`${API_ENDPOINT.account}/2fa/disable`, {
      method: "POST",
      body: body({ password }),
    }),

  listAudit: (options: { page?: number; limit?: number } = {}) =>
    request<Paginated<AuditEntry>>(withQuery(`${API_ENDPOINT.account}/audit`, options)),

  deleteAccount: (input: { password: string; confirm: string }) =>
    request<{ message: string; removed: Record<string, number> }>(API_ENDPOINT.account, {
      method: "DELETE",
      body: body(input),
    }),

  // ---- todos ----
  listTodos: (filter: TodoFilter = {}) =>
    request<Paginated<Todo>>(withQuery(API_ENDPOINT.todo, filter as Record<string, QueryValue>)),

  getTodo: (id: string) => request<Todo>(`${API_ENDPOINT.todo}/${id}`),

  createTodo: (input: Partial<Todo>) =>
    request<Todo>(API_ENDPOINT.todo, { method: "POST", body: body(input) }),

  updateTodo: (id: string, input: Partial<Todo>) =>
    request<Todo>(`${API_ENDPOINT.todo}/${id}`, { method: "PUT", body: body(input) }),

  deleteTodo: (id: string) => request<Todo>(`${API_ENDPOINT.todo}/${id}`, { method: "DELETE" }),

  duplicateTodo: (id: string) =>
    request<Todo>(`${API_ENDPOINT.todo}/${id}/duplicate`, { method: "POST" }),

  bulkTodos: (input: { ids: string[]; action: string; value?: unknown }) =>
    request<{ modified: number }>(`${API_ENDPOINT.todo}/bulk`, { method: "PATCH", body: body(input) }),

  reorderTodos: (input: { ids: string[] }) =>
    request<{ modified: number }>(`${API_ENDPOINT.todo}/reorder`, { method: "PUT", body: body(input) }),

  // ---- trash ----
  listTrash: (filter: TodoFilter = {}) =>
    request<Paginated<Todo>>(withQuery(API_ENDPOINT.trash, filter as Record<string, QueryValue>)),

  getTrashItem: (id: string) => request<Todo>(`${API_ENDPOINT.trash}/${id}`),

  recoverTrashTodo: (id: string) => request<Todo>(`${API_ENDPOINT.trash}/${id}`, { method: "PUT" }),

  deleteTrashTodo: (id: string) => request<Todo>(`${API_ENDPOINT.trash}/${id}`, { method: "DELETE" }),

  emptyTrash: () => request<{ deleted: number }>(API_ENDPOINT.trash, { method: "DELETE" }),

  // ---- projects ----
  listProjects: (includeArchived = false) =>
    request<Project[]>(withQuery(API_ENDPOINT.project, { archived: includeArchived || undefined })),

  createProject: (input: Partial<Project>) =>
    request<Project>(API_ENDPOINT.project, { method: "POST", body: body(input) }),

  updateProject: (id: string, input: Partial<Project>) =>
    request<Project>(`${API_ENDPOINT.project}/${id}`, { method: "PUT", body: body(input) }),

  deleteProject: (id: string) =>
    request<{ project: Project; unassigned: number }>(`${API_ENDPOINT.project}/${id}`, { method: "DELETE" }),

  reorderProjects: (ids: string[]) =>
    request<{ modified: number }>(`${API_ENDPOINT.project}/reorder`, { method: "PUT", body: body({ ids }) }),

  // ---- comments, activity, timers ----
  listComments: (todoId: string) => request<TodoComment[]>(`${API_ENDPOINT.todo}/${todoId}/comments`),

  createComment: (todoId: string, text: string) =>
    request<TodoComment>(`${API_ENDPOINT.todo}/${todoId}/comments`, { method: "POST", body: body({ body: text }) }),

  updateComment: (commentId: string, text: string) =>
    request<TodoComment>(`${API_ENDPOINT.todo}/comments/${commentId}`, { method: "PUT", body: body({ body: text }) }),

  deleteComment: (commentId: string) =>
    request<TodoComment>(`${API_ENDPOINT.todo}/comments/${commentId}`, { method: "DELETE" }),

  listActivity: (todoId: string) => request<Activity[]>(`${API_ENDPOINT.todo}/${todoId}/activity`),

  startTimer: (todoId: string) => request<Todo>(`${API_ENDPOINT.todo}/${todoId}/timer/start`, { method: "POST" }),

  stopTimer: (todoId: string) => request<Todo>(`${API_ENDPOINT.todo}/${todoId}/timer/stop`, { method: "POST" }),

  // ---- saved views ----
  listViews: () => request<SavedView[]>(API_ENDPOINT.view),

  createView: (input: Partial<SavedView>) =>
    request<SavedView>(API_ENDPOINT.view, { method: "POST", body: body(input) }),

  updateView: (id: string, input: Partial<SavedView>) =>
    request<SavedView>(`${API_ENDPOINT.view}/${id}`, { method: "PUT", body: body(input) }),

  deleteView: (id: string) => request<SavedView>(`${API_ENDPOINT.view}/${id}`, { method: "DELETE" }),

  // ---- templates ----
  listTemplates: () => request<TodoTemplate[]>(API_ENDPOINT.template),

  createTemplate: (input: Partial<TodoTemplate>) =>
    request<TodoTemplate>(API_ENDPOINT.template, { method: "POST", body: body(input) }),

  createTemplateFromTodo: (todoId: string, name?: string) =>
    request<TodoTemplate>(`${API_ENDPOINT.template}/from-todo`, {
      method: "POST",
      body: body({ todoId, name }),
    }),

  useTemplate: (id: string) => request<Todo>(`${API_ENDPOINT.template}/${id}/use`, { method: "POST" }),

  deleteTemplate: (id: string) =>
    request<TodoTemplate>(`${API_ENDPOINT.template}/${id}`, { method: "DELETE" }),

  // ---- tag maintenance ----
  renameTag: (from: string, to: string) =>
    request<{ modified: number }>(`${API_BASE}/tags/rename`, { method: "PUT", body: body({ from, to }) }),

  mergeTags: (sources: string[], target: string) =>
    request<{ modified: number }>(`${API_BASE}/tags/merge`, { method: "PUT", body: body({ sources, target }) }),

  deleteTag: (tag: string) =>
    request<{ modified: number }>(`${API_BASE}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }),

  // ---- insights ----
  stats: (options: { days?: number; projectId?: string } = {}) =>
    request<Stats>(withQuery(API_ENDPOINT.stats, options)),

  tags: () => request<TagCount[]>(API_ENDPOINT.tags),
};
