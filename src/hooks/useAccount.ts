"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { meKey } from "@/hooks/useAuth";
import { todoKeys } from "@/hooks/useTodos";
import { projectKeys } from "@/hooks/useProjects";

export const accountKeys = {
  sessions: ["account", "sessions"] as const,
  audit: (page: number) => ["account", "audit", page] as const,
};

export function useSessions() {
  return useQuery({ queryKey: accountKeys.sessions, queryFn: api.listSessions });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

/** Revoking everything invalidates this device too, so the cache is dropped. */
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeAllSessions,
    onSuccess: () => queryClient.clear(),
  });
}

export function useAuditLog(page = 1) {
  return useQuery({ queryKey: accountKeys.audit(page), queryFn: () => api.listAudit({ page }) });
}

export function useStartTwoFactor() {
  return useMutation({ mutationFn: api.startTwoFactor });
}

export function useEnableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.enableTwoFactor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.disableTwoFactor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
}

export function useExportTodos() {
  return useMutation({ mutationFn: (format: "json" | "csv") => api.exportTodos(format) });
}

export function useExportAccount() {
  return useMutation({ mutationFn: api.exportAccount });
}

/**
 * One mutation for both phases. A dry run touches nothing, so only a real
 * import invalidates the todo caches.
 */
export function useImportTodos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.importTodos,
    onSuccess: (summary) => {
      if (summary.dryRun) return;
      queryClient.invalidateQueries({ queryKey: todoKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useSampleData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createSampleData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => queryClient.clear(),
  });
}
