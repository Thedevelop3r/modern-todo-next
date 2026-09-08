import { API_ENDPOINT } from "./api_endpoint";

// The API lives at a same-origin path, so requests are built as relative URLs
// rather than through `new URL()`, which needs an absolute base.
const withQuery = (path: string, filter: TodoFilter) => {
  const query = new URLSearchParams();
  Object.keys(filter).forEach((key) => query.append(key, String(filter[key])));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
};

const getAllTodos = async ({ filter }: { filter: TodoFilter }) => {
  const options: RequestInit = {
    method: "GET",
    credentials: "include",
  };
  return fetch(withQuery(API_ENDPOINT.todo, filter), options);
};

const refreshTodos = async ({ filter }: { filter: TodoFilter }) => {
  return getAllTodos({
    filter: filter,
  });
};

const deleteTodo = async (todoId: string | undefined) => {
  return fetch(`${API_ENDPOINT.todo}/${todoId}`, {
    method: "DELETE",
    credentials: "include",
  });
};

const getTodo = async (todoId: string) => {
  return fetch(`${API_ENDPOINT.todo}/${todoId}`, {
    method: "GET",
    credentials: "include",
  });
};

const getTrash = async ({ filter }: { filter: TodoFilter }) => {
  const options: RequestInit = {
    method: "GET",
    credentials: "include",
  };
  return fetch(withQuery(API_ENDPOINT.trash, filter), options);
};
const recoverTrashTodo = async (todoId?: string) => {
  return fetch(`${API_ENDPOINT.trash}/${todoId}`, {
    method: "PUT",
    credentials: "include",
  });
};
const deleteTrashTodo = async (todoId?: string) => {
  return fetch(`${API_ENDPOINT.trash}/${todoId}`, {
    method: "DELETE",
    credentials: "include",
  });
};

const getUser = async () => {
  return fetch(API_ENDPOINT.me, {
    method: "GET",
    credentials: "include",
  });
};

const getProfile = async () => {
  return fetch(`${API_ENDPOINT.me}`, {
    method: "GET",
    credentials: "include",
  });
};

const updateUserProfile = async (user: User | null) => {
  return fetch(`${API_ENDPOINT.updateUser}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(user),
  });
};

const updateTodo = async (todoId: string, todo: Todo | null) => {
  return fetch(`${API_ENDPOINT.todo}/${todoId}`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(todo),
  });
};

const capitalizeEachWord = (str: string) => {
  return str.replace(/\w\S*/g, (w) => w.replace(/^\w/, (c) => c.toUpperCase()));
};

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const STATUS_MAP: STATUS_MAP_ = {
  completed: "bg-green-500",
  progress: "bg-yellow-500",
  pending: "bg-red-500",
};

export {
  STATUS_MAP,
  getTrash,
  recoverTrashTodo,
  deleteTrashTodo,
  updateUserProfile,
  getAllTodos,
  refreshTodos,
  deleteTodo,
  getUser,
  capitalizeEachWord,
  capitalizeFirstLetter,
  getTodo,
  updateTodo,
  getProfile,
};
