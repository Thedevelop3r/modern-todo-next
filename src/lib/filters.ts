/**
 * The todo list's filter state lives in the URL, so a filtered view is
 * linkable, survives a refresh, and works with browser back/forward.
 *
 * These are pure functions on purpose: they hold no React, which is what lets
 * `src/__tests__/filters.test.ts` run them under node's test runner.
 */

const asList = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

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

export function parseFilter(params: URLSearchParams, pageSize = 10): TodoFilter {
  return {
    page: Number(params.get("page")) || 1,
    limit: Number(params.get("limit")) || pageSize,
    q: params.get("q") || "",
    status: asList(params.get("status")) as TodoStatus[],
    priority: asList(params.get("priority")) as TodoPriority[],
    tags: asList(params.get("tags")),
    due: (params.get("due") as TodoFilter["due"]) || "any",
    projectId: params.get("projectId") || undefined,
    blocked: params.get("blocked") === "true" ? true : undefined,
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
  if (filter.projectId) params.set("projectId", filter.projectId);
  if (filter.blocked) params.set("blocked", "true");
  if (filter.sort && filter.sort !== "createdAt") params.set("sort", filter.sort);
  if (filter.order && filter.order !== "desc") params.set("order", filter.order);
  if (filter.page && filter.page > 1) params.set("page", String(filter.page));
  if (filter.limit && filter.limit !== 10) params.set("limit", String(filter.limit));
  return params;
}
