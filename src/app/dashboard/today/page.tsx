"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, CalendarCheck, PartyPopper, Sun } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PageTransition,
  Progress,
  TodoCardSkeleton,
  useToast,
} from "@/components/ui";
import { TodoCard, type TodoCardActions } from "@/components/todo/TodoCard";
import { QuickAdd } from "@/components/todo/QuickAdd";
import { FocusTimer } from "@/components/todo/FocusTimer";
import { useDeleteTodo, useDuplicateTodo, useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { formatDate } from "@/lib/date";

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  pending: "progress",
  progress: "completed",
  completed: "pending",
};

/**
 * The "what should I do now" page: overdue first, then due today, then
 * anything pinned. Nothing else competes for attention.
 */
export default function TodayPage() {
  const toast = useToast();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const duplicateTodo = useDuplicateTodo();

  const overdue = useTodos({ due: "overdue", limit: 50, sort: "dueDate", order: "asc" });
  const today = useTodos({ due: "today", limit: 50 });
  const pinned = useTodos({ pinned: true, limit: 20 } as TodoFilter);

  const actions: TodoCardActions = {
    onToggleStatus: (todo) =>
      updateTodo.mutate(
        { id: todo._id as string, input: { status: NEXT_STATUS[todo.status || "pending"] } },
        { onError: (e) => toast.error("Could not update", { description: (e as Error).message }) }
      ),
    onTogglePin: (todo) => updateTodo.mutate({ id: todo._id as string, input: { pinned: !todo.pinned } }),
    onArchive: (todo) => updateTodo.mutate({ id: todo._id as string, input: { archived: !todo.archived } }),
    onDuplicate: (todo) => duplicateTodo.mutate(todo._id as string),
    onDelete: (todo) =>
      deleteTodo.mutate(todo._id as string, { onSuccess: () => toast.success("Moved to trash") }),
  };

  const isLoading = overdue.isLoading || today.isLoading;
  const overdueTodos = overdue.data?.data || [];
  const todayTodos = today.data?.data || [];

  // Pinned items already shown above are not repeated.
  const shown = new Set([...overdueTodos, ...todayTodos].map((t) => t._id));
  const pinnedTodos = (pinned.data?.data || []).filter((t) => !shown.has(t._id) && t.status !== "completed");

  const focusTotal = overdueTodos.length + todayTodos.length;
  const done = [...overdueTodos, ...todayTodos].filter((t) => t.status === "completed").length;
  const percent = focusTotal ? Math.round((done / focusTotal) * 100) : 0;

  return (
    <PageTransition className="mx-auto max-w-3xl space-y-5">
      <div className="grid gap-5 md:grid-cols-[1fr_240px]">
        <Card>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
                  <Sun className="h-5 w-5 text-warning" />
                  {formatDate(new Date(), "EEEE d MMMM")}
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {focusTotal === 0
                    ? "Nothing is due today. Enjoy it."
                    : `${focusTotal - done} of ${focusTotal} still to do.`}
                </p>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-fg">{percent}%</span>
            </div>
            {focusTotal > 0 && (
              <div className="mt-3">
                <Progress value={percent} tone={percent === 100 ? "success" : "primary"} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* The pomodoro sits with the day summary: both answer "what now?". */}
        <FocusTimer compact />
      </div>

      <QuickAdd />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <TodoCardSkeleton key={i} />
          ))}
        </div>
      ) : focusTotal === 0 && pinnedTodos.length === 0 ? (
        <EmptyState
          icon={<PartyPopper className="h-6 w-6" />}
          title="Nothing needs you today"
          description="No overdue work and nothing due. Add something, or take the win."
          action={
            <Link href="/dashboard">
              <Button variant="secondary">See all todos</Button>
            </Link>
          }
        />
      ) : (
        <>
          {overdueTodos.length > 0 && (
            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertTriangle className="h-4 w-4" />
                Overdue ({overdueTodos.length})
              </h3>
              <div className="flex flex-col gap-3">
                <AnimatePresence mode="popLayout">
                  {overdueTodos.map((todo) => (
                    <TodoCard key={todo._id} todo={todo} actions={actions} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {todayTodos.length > 0 && (
            <section>
              <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-fg">
                <CalendarCheck className="h-4 w-4 text-warning" />
                Due today ({todayTodos.length})
              </h3>
              <div className="flex flex-col gap-3">
                <AnimatePresence mode="popLayout">
                  {todayTodos.map((todo) => (
                    <TodoCard key={todo._id} todo={todo} actions={actions} />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {pinnedTodos.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-sm font-semibold text-fg">Pinned ({pinnedTodos.length})</h3>
              <div className="flex flex-col gap-3">
                {pinnedTodos.map((todo) => (
                  <TodoCard key={todo._id} todo={todo} actions={actions} compact />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageTransition>
  );
}
