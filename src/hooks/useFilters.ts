"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_FILTER, parseFilter, serializeFilter } from "@/lib/filters";

// Re-exported so callers can keep importing filter helpers from one place.
export { DEFAULT_FILTER, parseFilter, serializeFilter };

export function useTodoFilters(pageSize = 10) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filter = React.useMemo(
    () => parseFilter(new URLSearchParams(searchParams.toString()), pageSize),
    [searchParams, pageSize]
  );

  const setFilter = React.useCallback(
    (patch: Partial<TodoFilter>) => {
      // Any change other than paging returns to page 1 - staying on page 7 of a
      // freshly narrowed list would show nothing.
      const next: TodoFilter = { ...filter, ...patch };
      if (patch.page === undefined) next.page = 1;

      const params = serializeFilter(next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filter, pathname, router]
  );

  const reset = React.useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const activeCount =
    (filter.q ? 1 : 0) +
    (filter.status?.length || 0) +
    (filter.priority?.length || 0) +
    (filter.tags?.length || 0) +
    (filter.due && filter.due !== "any" ? 1 : 0) +
    (filter.projectId ? 1 : 0) +
    (filter.blocked ? 1 : 0);

  return { filter, setFilter, reset, activeCount };
}

/** Debounces a fast-changing value (the search box) before it hits the API. */
export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
