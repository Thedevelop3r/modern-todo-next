"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, CalendarClock, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tag,
} from "@/components/ui";
import { PRIORITIES, STATUSES, cn } from "@/lib/utils";
import { useVariant } from "@/hooks/useVariant";
import { useDebounced } from "@/hooks/useFilters";
import { useTags } from "@/hooks/useTodos";

const SORTS: Array<{ value: NonNullable<TodoFilter["sort"]>; label: string }> = [
  { value: "createdAt", label: "Created" },
  { value: "updatedAt", label: "Updated" },
  { value: "dueDate", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

const DUE_OPTIONS: Array<{ value: NonNullable<TodoFilter["due"]>; label: string }> = [
  { value: "any", label: "Any time" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Next 7 days" },
  { value: "none", label: "No due date" },
];

export function FilterBar({
  filter,
  setFilter,
  reset,
  activeCount,
  right,
}: {
  filter: TodoFilter;
  setFilter: (patch: Partial<TodoFilter>) => void;
  reset: () => void;
  activeCount: number;
  right?: React.ReactNode;
}) {
  const { data: tags } = useTags();
  const { statusLabel, priorityLabel } = useVariant();

  // Local state keeps typing responsive; the debounced value drives the query.
  const [search, setSearch] = React.useState(filter.q || "");
  const debouncedSearch = useDebounced(search, 350);
  const lastPushed = React.useRef(filter.q || "");

  React.useEffect(() => {
    if (debouncedSearch === lastPushed.current) return;
    lastPushed.current = debouncedSearch;
    setFilter({ q: debouncedSearch });
  }, [debouncedSearch, setFilter]);

  // Keep in step when the URL changes from elsewhere (palette, tag click, reset).
  React.useEffect(() => {
    const incoming = filter.q || "";
    if (incoming !== lastPushed.current) {
      lastPushed.current = incoming;
      setSearch(incoming);
    }
  }, [filter.q]);

  const toggleIn = (list: string[] | undefined, value: string) => {
    const current = list || [];
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <Input
            id="todo-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search todos…  (press /)"
            leadingIcon={<Search className="h-4 w-4" />}
            trailing={
              search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="rounded p-1 text-fg-subtle hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null
            }
          />
        </div>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="md">
              <Filter className="h-4 w-4" />
              Filter
              {activeCount > 0 && (
                <Badge tone="primary" size="xs">
                  {activeCount}
                </Badge>
              )}
            </Button>
          </MenuTrigger>
          <MenuContent className="min-w-[15rem]">
            <MenuLabel>Status</MenuLabel>
            {STATUSES.map((status) => (
              <MenuCheckboxItem
                key={status}
                checked={filter.status?.includes(status) || false}
                onCheckedChange={() => setFilter({ status: toggleIn(filter.status, status) as TodoStatus[] })}
              >
                {statusLabel(status)}
              </MenuCheckboxItem>
            ))}

            <MenuSeparator />
            <MenuLabel>Priority</MenuLabel>
            {PRIORITIES.filter((p) => p !== "none").map((priority) => (
              <MenuCheckboxItem
                key={priority}
                checked={filter.priority?.includes(priority) || false}
                onCheckedChange={() => setFilter({ priority: toggleIn(filter.priority, priority) as TodoPriority[] })}
              >
                {priorityLabel(priority)}
              </MenuCheckboxItem>
            ))}

            <MenuSeparator />
            <MenuLabel>Due</MenuLabel>
            {DUE_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                icon={<CalendarClock className={cn("h-4 w-4", filter.due === option.value && "text-primary")} />}
                onSelect={() => setFilter({ due: option.value })}
              >
                <span className={cn(filter.due === option.value && "font-semibold text-primary")}>{option.label}</span>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="md">
              <SlidersHorizontal className="h-4 w-4" />
              Sort
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Sort by</MenuLabel>
            {SORTS.map((option) => (
              <MenuItem key={option.value} onSelect={() => setFilter({ sort: option.value })}>
                <span className={cn(filter.sort === option.value && "font-semibold text-primary")}>{option.label}</span>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              icon={filter.order === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
              onSelect={() => setFilter({ order: filter.order === "asc" ? "desc" : "asc" })}
            >
              {filter.order === "asc" ? "Ascending" : "Descending"}
            </MenuItem>
          </MenuContent>
        </Menu>

        {right}
      </div>

      {/* Tag rail doubles as the tag filter. */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 12).map((tag) => (
            <Tag
              key={tag.name}
              label={tag.name}
              active={filter.tags?.includes(tag.name)}
              onClick={() => setFilter({ tags: toggleIn(filter.tags, tag.name) })}
            />
          ))}
        </div>
      )}

      {activeCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <span>
            {activeCount} filter{activeCount === 1 ? "" : "s"} active
          </span>
          <button type="button" onClick={reset} className="font-medium text-primary hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
