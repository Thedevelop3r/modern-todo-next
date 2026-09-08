"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The todo list's filter state lives in the URL, so a filtered view is
 * linkable, survives a refresh, and works with browser back/forward.
 */

export const DEFAULT_FILTER: TodoFilter = {
  page: 1,
  limit: 10,
  q: "",
  status: [],
  priority: [],
  tags: [],
  due: "any",
  sort: "createdAt",
  order: "desc",
};

const asList = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

export function parseFilter(params: URLSearchParams, pageSize = 10): TodoFilter {
  return {
    page: Number(params.get("page")) || 1,
    limit: Number(params.get("limit")) || pageSize,
    q: params.get("q") || "",
    status: asList(params.get("status")) as TodoStatus[],
    priority: asList(params.get("priority")) as TodoPriority[],
    tags: asList(params.get("tags")),
    due: (params.get("due") as TodoFilter["due"]) || "any",
    sort: (params.get("sort") as TodoFilter["sort"]) || "createdAt",
    order: (params.get("order") as TodoFilter["order"]) || "desc",
  };
}

/** Only non-default values are written, keeping URLs short and readable. */
export function serializeFilter(filter: TodoFilter) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.status?.length) params.set("status", filter.status.join(","));
  if (filter.priority?.length) params.set("priority", filter.priority.join(","));
  if (filter.tags?.length) params.set("tags", filter.tags.join(","));
  if (filter.due && filter.due !== "any") params.set("due", filter.due);
  if (filter.sort && filter.sort !== "createdAt") params.set("sort", filter.sort);
  if (filter.order && filter.order !== "desc") params.set("order", filter.order);
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  if (filter.limit && filter.limit !== 10) params.set("limit", String(filter.limit));
  return params;
}

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
    (filter.due && filter.due !== "any" ? 1 : 0);

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
