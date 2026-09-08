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
};

/** Error carrying the API's status code so callers can branch on it. */
export class ApiError extends Error {
  status: number;
  details?: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
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
    throw new ApiError(payload?.message || response.statusText || "Request failed", response.status, payload?.details);
  }

  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  // ---- auth / account ----
  login: (input: { email: string; password: string }) =>
    request<User>(API_ENDPOINT.login, { method: "POST", body: body(input) }),

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

  // ---- insights ----
  stats: () => request<Stats>(API_ENDPOINT.stats),

  tags: () => request<TagCount[]>(API_ENDPOINT.tags),
};
