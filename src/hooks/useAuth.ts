"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export const meKey = ["me"] as const;

/** Current user. `enabled: false` lets pages opt out of the guard fetch. */
export function useMe(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: meKey,
    queryFn: api.me,
    retry: false,
    staleTime: 60_000,
    ...options,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: api.login,
    onSuccess: (user) => {
      queryClient.setQueryData(meKey, user);
      router.push("/dashboard");
    },
  });
}

export function useRegister() {
  return useMutation({ mutationFn: api.register });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      // Clear regardless of outcome: the user asked to be signed out.
      queryClient.clear();
      router.push("/");
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (user) => queryClient.setQueryData(meKey, user),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updatePreferences,
    onSuccess: (user) => queryClient.setQueryData(meKey, user),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: api.changePassword });
}

export const isAuthError = (error: unknown) => error instanceof ApiError && error.status === 401;
