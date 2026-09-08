import { create } from "zustand";

const user: User = {
  name: "",
  email: "",
  token: "",
  isLoggedIn: false,
};

const todos: Todos = [];
const trash: Todos = [];

const useStore = create<StoreState>((set, get) => ({
  user: { ...user },
  todos: [...todos],
  trash: [...trash],
  todoPagination: {
    page: 1,
    limit: 10,
  },
  todoMeta: {
    totalRecords: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  },
  trashPagination: {
    page: 1,
    limit: 10,
  },
  trashMeta: {
    totalRecords: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  },

  updateTodoMeta: (todoMeta: TodoMeta) => {
    set((state: StoreState) => {
      return { ...state, todoMeta };
    });
  },

  updateTrashPagination: ({ page, limit }: { page: number; limit: number }) => {
    set((state: StoreState) => {
      return { ...state, trashPagination: { page, limit } };
    });
  },

  updateTrash: ({ trash, trashMeta }: { trash: Todos; trashMeta?: TodoMeta | undefined }) => {
    set((state: StoreState) => {
      const updatedTrash = [...trash].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateA > dateB ? -1 : 1;
      });
      if (trashMeta) {
        return { ...state, trash: updatedTrash, trashMeta };
      }
      return { ...state, trash: trash ? updatedTrash : state.trash };
    });
  },

  updatePagination: ({ page, limit }: { page: number; limit: number }) => {
    set((state: StoreState) => {
      return { ...state, todoPagination: { page, limit } };
    });
  },

  updateUser: ({ user, isLoggedIn }: { user: User | null; isLoggedIn: Boolean | null }) => {
    set((state: StoreState) => {
      let updatedUser = { ...state.user };
      if (user) {
        updatedUser = { ...updatedUser, ...user };
        isLoggedIn ? (updatedUser.isLoggedIn = true) : (updatedUser.isLoggedIn = false);
      }
      console.log(updatedUser);
      return { ...state, user: updatedUser };
    });
  },
  updateTodos: ({ todos, todoMeta }: { todos: Todos; todoMeta?: TodoMeta | undefined }) => {
    set((state: StoreState) => {
      const updatedTodos = [...todos].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateA > dateB ? -1 : 1;
      });
      if (todoMeta) {
        return { ...state, todos: updatedTodos, todoMeta };
      }
      return { ...state, todos: todos ? updatedTodos : state.todos };
    });
  },
}));

export { useStore };
