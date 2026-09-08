"use client";

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const todoKeys = {
  all: ["todos"] as const,
  list: (filter: TodoFilter) => ["todos", "list", filter] as const,
  detail: (id: string) => ["todos", "detail", id] as const,
  trash: (filter: TodoFilter) => ["trash", filter] as const,
  stats: ["stats"] as const,
  tags: ["tags"] as const,
};

/** Invalidate everything a write could have changed (counts, tags, charts). */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: todoKeys.all });
  queryClient.invalidateQueries({ queryKey: ["trash"] });
  queryClient.invalidateQueries({ queryKey: todoKeys.stats });
  queryClient.invalidateQueries({ queryKey: todoKeys.tags });
}

export function useTodos(filter: TodoFilter) {
  return useQuery({
    queryKey: todoKeys.list(filter),
    queryFn: () => api.listTodos(filter),
    // Keeps the current page visible while the next one loads, so paging and
    // typing in the search box do not flash an empty list.
    placeholderData: keepPreviousData,
  });
}

export function useTodo(id?: string) {
  return useQuery({
    queryKey: todoKeys.detail(id || ""),
    queryFn: () => api.getTodo(id as string),
    enabled: Boolean(id),
  });
}

export function useTrash(filter: TodoFilter) {
  return useQuery({
    queryKey: todoKeys.trash(filter),
    queryFn: () => api.listTrash(filter),
    placeholderData: keepPreviousData,
  });
}

export function useStats() {
  return useQuery({ queryKey: todoKeys.stats, queryFn: api.stats });
}

export function useTags() {
  return useQuery({ queryKey: todoKeys.tags, queryFn: api.tags, staleTime: 60_000 });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createTodo,
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Optimistic update: the change is painted immediately and rolled back if the
 * request fails, so toggling status or pinning feels instant.
 */
export function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Todo> }) => api.updateTodo(id, input),

    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.all });
      const previous = queryClient.getQueriesData<Paginated<Todo>>({ queryKey: ["todos", "list"] });

      previous.forEach(([key, page]) => {
        if (!page) return;
        queryClient.setQueryData<Paginated<Todo>>(key, {
          ...page,
          data: page.data.map((todo) => (todo._id === id ? { ...todo, ...input } : todo)),
        });
      });

      const previousDetail = queryClient.getQueryData<Todo>(todoKeys.detail(id));
      if (previousDetail) {
        queryClient.setQueryData<Todo>(todoKeys.detail(id), { ...previousDetail, ...input });
      }

      return { previous, previousDetail, id };
    },

    onError: (_err, _vars, context) => {
      context?.previous?.forEach(([key, page]) => queryClient.setQueryData(key, page));
      if (context?.previousDetail) {
        queryClient.setQueryData(todoKeys.detail(context.id), context.previousDetail);
      }
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTodo(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: todoKeys.all });
      const previous = queryClient.getQueriesData<Paginated<Todo>>({ queryKey: ["todos", "list"] });

      previous.forEach(([key, page]) => {
        if (!page) return;
        queryClient.setQueryData<Paginated<Todo>>(key, {
          ...page,
          data: page.data.filter((todo) => todo._id !== id),
        });
      });

      return { previous };
    },

    onError: (_err, _id, context) => {
      context?.previous?.forEach(([key, page]) => queryClient.setQueryData(key, page));
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

export function useDuplicateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateTodo(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useBulkTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.bulkTodos,
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useReorderTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reorderTodos,
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useRecoverTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.recoverTrashTodo(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTrashTodo(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.emptyTrash,
    onSuccess: () => invalidateAll(queryClient),
  });
}
