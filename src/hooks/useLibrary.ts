"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todoKeys } from "./useTodos";

export const libraryKeys = {
  views: ["views"] as const,
  templates: ["templates"] as const,
};

// ---- saved views ----

export function useSavedViews() {
  return useQuery({ queryKey: libraryKeys.views, queryFn: api.listViews, staleTime: 60_000 });
}

export function useCreateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createView,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.views }),
  });
}

export function useUpdateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SavedView> }) => api.updateView(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.views }),
  });
}

export function useDeleteView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteView(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.views }),
  });
}

// ---- templates ----

export function useTemplates() {
  return useQuery({ queryKey: libraryKeys.templates, queryFn: api.listTemplates, staleTime: 60_000 });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.templates }),
  });
}

export function useTemplateFromTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ todoId, name }: { todoId: string; name?: string }) =>
      api.createTemplateFromTodo(todoId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.templates }),
  });
}

/** Instantiating a template creates a todo, so both caches move. */
export function useUseTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.useTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoKeys.all });
      queryClient.invalidateQueries({ queryKey: libraryKeys.templates });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryKeys.templates }),
  });
}

// ---- tag maintenance ----

/** Tag edits rewrite todos in bulk, so every todo query is invalidated. */
export function useTagActions() {
  const queryClient = useQueryClient();

  const settle = () => {
    queryClient.invalidateQueries({ queryKey: todoKeys.all });
    queryClient.invalidateQueries({ queryKey: todoKeys.tags });
  };

  return {
    rename: useMutation({
      mutationFn: ({ from, to }: { from: string; to: string }) => api.renameTag(from, to),
      onSuccess: settle,
    }),
    merge: useMutation({
      mutationFn: ({ sources, target }: { sources: string[]; target: string }) =>
        api.mergeTags(sources, target),
      onSuccess: settle,
    }),
    remove: useMutation({
      mutationFn: (tag: string) => api.deleteTag(tag),
      onSuccess: settle,
    }),
  };
}
