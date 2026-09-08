"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todoKeys } from "./useTodos";

export const projectKeys = {
  all: ["projects"] as const,
  list: (includeArchived: boolean) => ["projects", { includeArchived }] as const,
};

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: projectKeys.list(includeArchived),
    queryFn: () => api.listProjects(includeArchived),
    staleTime: 30_000,
  });
}

/** Project writes change todo counts, so both caches are invalidated. */
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: projectKeys.all });
  queryClient.invalidateQueries({ queryKey: todoKeys.all });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Project> }) => api.updateProject(id, input),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => invalidate(queryClient),
  });
}

// ---- comments ----

export const commentKeys = {
  list: (todoId: string) => ["comments", todoId] as const,
  activity: (todoId: string) => ["activity", todoId] as const,
};

export function useComments(todoId?: string) {
  return useQuery({
    queryKey: commentKeys.list(todoId || ""),
    queryFn: () => api.listComments(todoId as string),
    enabled: Boolean(todoId),
  });
}

export function useActivity(todoId?: string) {
  return useQuery({
    queryKey: commentKeys.activity(todoId || ""),
    queryFn: () => api.listActivity(todoId as string),
    enabled: Boolean(todoId),
  });
}

export function useCreateComment(todoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.createComment(todoId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(todoId) });
      queryClient.invalidateQueries({ queryKey: commentKeys.activity(todoId) });
    },
  });
}

export function useUpdateComment(todoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.updateComment(id, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.list(todoId) }),
  });
}

export function useDeleteComment(todoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.list(todoId) }),
  });
}

// ---- timers ----

/**
 * Only one timer runs at a time server-side, so a start/stop invalidates every
 * todo list rather than patching a single row.
 */
export function useTimer() {
  const queryClient = useQueryClient();

  const settle = () => {
    queryClient.invalidateQueries({ queryKey: todoKeys.all });
    queryClient.invalidateQueries({ queryKey: projectKeys.all });
  };

  const start = useMutation({ mutationFn: (id: string) => api.startTimer(id), onSuccess: settle });
  const stop = useMutation({ mutationFn: (id: string) => api.stopTimer(id), onSuccess: settle });

  return { start, stop, isPending: start.isPending || stop.isPending };
}
