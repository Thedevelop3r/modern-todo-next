"use client";

import * as React from "react";
import { useMe } from "./useAuth";
import { useProjects } from "./useProjects";
import {
  getVariant,
  lowerTerm,
  priorityLabel as priorityLabelFor,
  statusLabel as statusLabelFor,
  term,
  variantFields,
  type TermKey,
  type Variant,
} from "@/lib/variants";

/**
 * The variant in force, and everything a component needs to render under it.
 *
 * Pass a project id where one is in scope: a project may override the account's
 * variant, which is how one account runs a School project alongside a General
 * one. Nothing here branches on the id - callers ask for a label or a field
 * list and render the answer.
 */
export function useVariant(projectId?: string | null) {
  const { data: user } = useMe({ enabled: true });
  // Already in the cache on every dashboard page; the sidebar lists them.
  const { data: projects } = useProjects();

  const project = projectId ? projects?.find((candidate) => candidate._id === projectId) : undefined;

  const variant: Variant = React.useMemo(
    () => getVariant(project?.applicationType || user?.preferences?.applicationType),
    [project?.applicationType, user?.preferences?.applicationType]
  );

  return React.useMemo(
    () => ({
      variant,
      /** `t("todo", "many")` - the only way a noun reaches the screen. */
      t: (key: TermKey, count: "one" | "many" = "one") => term(variant, key, count),
      lower: (key: TermKey, count: "one" | "many" = "one") => lowerTerm(variant, key, count),
      statusLabel: (status: TodoStatus) => statusLabelFor(variant, status),
      priorityLabel: (priority: TodoPriority) => priorityLabelFor(variant, priority),
      todoFields: variantFields(variant, "todo"),
      projectFields: variantFields(variant, "project"),
    }),
    [variant]
  );
}
