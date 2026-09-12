"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  CheckCircle2,
  Clock,
  History,
  Link2Off,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  IconButton,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  useActivity,
  useComments,
  useCreateComment,
  useDeleteComment,
  useTimer,
} from "@/hooks/useProjects";
import { useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { useDebounced } from "@/hooks/useFilters";
import { cn, formatDuration, liveMinutes } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/date";
import { useVariant } from "@/hooks/useVariant";
import { dormantVariants } from "@/lib/variants";
import { VariantFieldList, type VariantValues } from "@/components/variant/VariantFields";

/**
 * The variant's own fields for one record, read-only.
 *
 * Below it, a collapsed panel per *dormant* variant - one this record carries
 * data for but which is not in force. Switching variants hides fields, it never
 * deletes them, and this is the visible proof of that: the data is still there
 * and still readable.
 */
export function VariantPanel({ todo }: { todo: Todo }) {
  const { variant, todoFields } = useVariant(todo.projectId);
  const values = (todo.variantData?.[variant.id] as VariantValues) || {};
  const dormant = dormantVariants(todo.variantData, variant.id);

  const filled = todoFields.some((field) => {
    const value = values[field.key];
    return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
  });

  if (!filled && dormant.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4">
        {filled && (
          <>
            <h2 className="text-sm font-semibold text-fg">{variant.label} details</h2>
            <VariantFieldList fields={todoFields} values={values} />
          </>
        )}

        {dormant.map(({ variant: other, values: otherValues }) => (
          <details key={other.id} className="rounded-lg border border-border bg-surface-sunken px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-fg-muted">
              Fields from {other.label} · {Object.keys(otherValues).length} kept
            </summary>
            <div className="pt-3">
              <VariantFieldList fields={other.todoFields} values={otherValues as VariantValues} muted />
              {other.todoFields.length === 0 && (
                // A variant whose definitions this build does not carry still
                // shows its data rather than pretending it is gone.
                <dl className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(otherValues).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{key}</dt>
                      <dd className="text-sm text-fg-muted">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

/** Start/stop button plus a live-ticking elapsed readout. */
export function TimerControl({ todo }: { todo: Todo }) {
  const { start, stop, isPending } = useTimer();
  const running = Boolean(todo.timerStartedAt);
  const [, forceTick] = React.useState(0);

  // Re-render once a minute so the running total stays honest.
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [running]);

  return (
    <div className="flex items-center gap-2.5">
      <Button
        size="sm"
        variant={running ? "danger" : "secondary"}
        loading={isPending}
        onClick={() => (running ? stop.mutate(todo._id as string) : start.mutate(todo._id as string))}
      >
        {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {running ? "Stop" : "Start timer"}
      </Button>

      <span className={cn("flex items-center gap-1.5 text-sm tabular-nums", running ? "text-danger" : "text-fg-muted")}>
        <Clock className="h-3.5 w-3.5" />
        {formatDuration(liveMinutes(todo))}
        {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />}
      </span>
    </div>
  );
}

/** Search-and-add picker for "blocked by" dependencies. */
export function DependencyPanel({ todo }: { todo: Todo }) {
  const toast = useToast();
  const updateTodo = useUpdateTodo();
  const [search, setSearch] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const debounced = useDebounced(search, 250);

  const blockedBy = todo.blockedBy || [];
  // Fetch the blockers themselves so we can show titles and status.
  const { data: blockers } = useTodos({ limit: 100 });
  const resolved = (blockers?.data || []).filter((t) => blockedBy.includes(t._id as string));

  const { data: candidates } = useTodos({ q: debounced || undefined, limit: 8 });
  const options = (candidates?.data || []).filter(
    (t) => t._id !== todo._id && !blockedBy.includes(t._id as string)
  );

  const save = (ids: string[]) => {
    updateTodo.mutate(
      { id: todo._id as string, input: { blockedBy: ids } },
      {
        onSuccess: () => {
          setSearch("");
          setAdding(false);
        },
        onError: (error) => toast.error("Could not update dependencies", { description: (error as Error).message }),
      }
    );
  };

  const openCount = resolved.filter((t) => t.status !== "completed").length;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Blocked by</h2>
            {openCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/25">
                <Ban className="h-3 w-3" />
                {openCount} open
              </span>
            )}
          </div>
          <IconButton label="Add dependency" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>

        {resolved.length === 0 && !adding && (
          <p className="text-sm text-fg-muted">Nothing is blocking this todo.</p>
        )}

        <ul className="space-y-1.5">
          {resolved.map((blocker) => (
            <li key={blocker._id} className="flex items-center gap-2.5 rounded-lg bg-surface-sunken px-3 py-2">
              <CheckCircle2
                className={cn(
                  "h-4 w-4 shrink-0",
                  blocker.status === "completed" ? "text-success" : "text-fg-subtle"
                )}
              />
              <Link
                href={`/dashboard/todo/${blocker._id}`}
                className={cn(
                  "min-w-0 flex-1 truncate text-sm hover:underline",
                  blocker.status === "completed" ? "text-fg-muted line-through" : "text-fg"
                )}
              >
                {blocker.title}
              </Link>
              <IconButton
                label={`Remove ${blocker.title}`}
                size="xs"
                onClick={() => save(blockedBy.filter((id) => id !== blocker._id))}
              >
                <Link2Off className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>

        {adding && (
          <div className="mt-3">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a todo to depend on…"
              leadingIcon={<Search className="h-4 w-4" />}
            />
            {options.length > 0 && (
              <ul className="mt-2 space-y-1">
                {options.map((option) => (
                  <li key={option._id}>
                    <button
                      type="button"
                      onClick={() => save([...blockedBy, option._id as string])}
                      className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-sunken"
                    >
                      {option.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {debounced && options.length === 0 && (
              <p className="mt-2 px-1 text-xs text-fg-subtle">No matching todos.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CommentsPanel({ todoId }: { todoId: string }) {
  const toast = useToast();
  const { data: comments, isLoading } = useComments(todoId);
  const createComment = useCreateComment(todoId);
  const deleteComment = useDeleteComment(todoId);
  const [draft, setDraft] = React.useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    createComment.mutate(text, {
      onSuccess: () => setDraft(""),
      onError: (error) => toast.error("Could not post comment", { description: (error as Error).message }),
    });
  };

  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <MessageSquare className="h-4 w-4 text-fg-subtle" />
          Notes
          {comments && comments.length > 0 && (
            <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-xs tabular-nums text-fg-muted">
              {comments.length}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {comments?.map((comment) => (
                <motion.li
                  key={comment._id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group rounded-lg bg-surface-sunken px-3 py-2.5"
                >
                  <p className="whitespace-pre-wrap text-sm text-fg">{comment.body}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-fg-subtle">
                      {relativeTime(comment.createdAt)}
                      {comment.editedAt ? " · edited" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteComment.mutate(comment._id as string)}
                      className="ml-auto rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Add a note…  (Enter to send)"
            maxLength={2000}
          />
          <Button onClick={submit} loading={createComment.isPending} disabled={!draft.trim()} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  status: "status",
  priority: "priority",
  dueDate: "due date",
  startDate: "start date",
  estimate: "estimate",
  projectId: "project",
  archived: "archived",
  pinned: "pinned",
  recurrence: "repeat",
  subtasks: "subtasks",
  tags: "tags",
};

function describe(entry: Activity) {
  if (entry.action === "created") return "created this todo";
  if (entry.action === "commented") return "added a note";
  if (entry.action === "timer_started") return "started the timer";
  if (entry.action === "timer_stopped") {
    const minutes = (entry.meta as { minutes?: number })?.minutes ?? 0;
    return `stopped the timer (+${formatDuration(minutes)})`;
  }

  const field = FIELD_LABEL[entry.field || ""] || entry.field;
  const format = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "empty";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    return String(value);
  };

  return `changed ${field} from ${format(entry.from)} to ${format(entry.to)}`;
}

export function ActivityPanel({ todoId }: { todoId: string }) {
  const { data: activity, isLoading } = useActivity(todoId);

  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <History className="h-4 w-4 text-fg-subtle" />
          Activity
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : !activity?.length ? (
          <p className="text-sm text-fg-muted">No activity recorded yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {activity.map((entry) => (
              <li key={entry._id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border-strong ring-4 ring-surface" />
                <p className="text-sm text-fg">{describe(entry)}</p>
                <p className="text-xs text-fg-subtle">{relativeTime(entry.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Empty-state helper reused by the project pages. */
export function NoProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      title="No projects yet"
      description="Projects group related todos and roll up their effort and time."
      action={
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      }
    />
  );
}
