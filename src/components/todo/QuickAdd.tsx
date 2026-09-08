"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CornerDownLeft, Plus, Sparkles } from "lucide-react";
import { Badge, Button, Input, useToast } from "@/components/ui";
import { useCreateTodo } from "@/hooks/useTodos";
import { useCreateProject, useProjects } from "@/hooks/useProjects";
import { parseQuickAdd } from "@/lib/quickAdd";
import { formatDate } from "@/lib/date";

const HINTS = [
  { token: "tomorrow", meaning: "due date" },
  { token: "!high", meaning: "priority" },
  { token: "#tag", meaning: "tag" },
  { token: "@project", meaning: "project" },
  { token: "~3", meaning: "estimate" },
];

/**
 * One-line todo entry. Everything the parser recognises is shown back to the
 * user before they commit, so the magic is never a surprise.
 */
export function QuickAdd({ defaultProjectId }: { defaultProjectId?: string | null }) {
  const toast = useToast();
  const createTodo = useCreateTodo();
  const createProject = useCreateProject();
  const { data: projects } = useProjects();
  const [value, setValue] = React.useState("");

  const parsed = React.useMemo(() => parseQuickAdd(value), [value]);
  const ready = parsed.title.length > 0;

  const submit = async () => {
    if (!ready) return;

    let projectId = defaultProjectId ?? null;

    // @Name matches an existing project case-insensitively, or creates one.
    if (parsed.projectName) {
      const existing = projects?.find(
        (p) => p.name.toLowerCase() === parsed.projectName?.toLowerCase()
      );
      if (existing) {
        projectId = existing._id as string;
      } else {
        try {
          const created = await createProject.mutateAsync({ name: parsed.projectName, color: "indigo" });
          projectId = created._id as string;
          toast.info(`Created project "${created.name}"`);
        } catch {
          toast.error("Could not create that project", { description: "The todo was added without one." });
        }
      }
    }

    createTodo.mutate(
      {
        title: parsed.title,
        dueDate: parsed.dueDate,
        priority: parsed.priority || "none",
        tags: parsed.tags,
        estimate: parsed.estimate,
        projectId,
      },
      {
        onSuccess: (todo) => {
          setValue("");
          toast.success("Todo added", { description: todo.title });
        },
        onError: (error) => toast.error("Could not add todo", { description: (error as Error).message }),
      }
    );
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") setValue("");
          }}
          placeholder="Add a todo…  try: pay rent tomorrow !high #home"
          leadingIcon={<Sparkles className="h-4 w-4" />}
          trailing={
            value ? (
              <kbd className="rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
            ) : null
          }
        />
        <Button onClick={submit} loading={createTodo.isPending} disabled={!ready}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>

      <AnimatePresence>
        {value && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-1.5 pt-2 text-xs">
              {parsed.matched.length > 0 ? (
                <>
                  <span className="text-fg-subtle">Understood:</span>
                  {parsed.matched.map((m) => (
                    <Badge key={`${m.kind}-${m.label}`} tone="primary" size="xs">
                      {m.kind === "due" && parsed.dueDate
                        ? `due ${formatDate(parsed.dueDate, "d MMM")}`
                        : m.label}
                    </Badge>
                  ))}
                  <span className="text-fg-subtle">·</span>
                  <span className="text-fg-muted">
                    title: <span className="font-medium text-fg">{parsed.title || "(empty)"}</span>
                  </span>
                </>
              ) : (
                <span className="text-fg-subtle">
                  Tips:{" "}
                  {HINTS.map((hint, index) => (
                    <React.Fragment key={hint.token}>
                      {index > 0 && " · "}
                      <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[10px] text-fg-muted">
                        {hint.token}
                      </code>{" "}
                      {hint.meaning}
                    </React.Fragment>
                  ))}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
