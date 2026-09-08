import { API_ENDPOINT } from "./api_endpoint";

const getAllTodos = async ({ filter }: { filter: TodoFilter }) => {
  const options: RequestInit = {
    method: "GET",
    credentials: "include",
  };
  const url = new URL(API_ENDPOINT.todo);
  const query = Object.keys(filter)
    .map((key) => {
      return key + "=" + filter[key];
    })
    .join("&");
  url.search = query;
  return fetch(url, options);
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
  const url = new URL(API_ENDPOINT.trash);
  const query = Object.keys(filter)
    .map((key) => {
      return key + "=" + filter[key];
    })
    .join("&");
  url.search = query;
  return fetch(url, options);
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
