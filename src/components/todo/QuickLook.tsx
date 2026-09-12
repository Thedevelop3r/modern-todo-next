"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Pencil } from "lucide-react";
import { Button, Modal, Progress, RichTextView, Tag } from "@/components/ui";
import {
  BlockedBadge,
  DueBadge,
  EstimateBadge,
  PriorityBadge,
  StartBadge,
  StatusBadge,
  TimeBadge,
} from "./TodoBits";
import { ProjectBadge } from "./ProjectPicker";
import { useProjects } from "@/hooks/useProjects";
import { formatDateTime } from "@/lib/date";
import { subtaskProgress } from "@/lib/utils";

/**
 * Read-only peek at a todo, opened with Space from the list. It renders the
 * todo already in the cache, so there is no request and no loading state.
 */
export function QuickLook({
  todo,
  open,
  onOpenChange,
}: {
  todo?: Todo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: projects } = useProjects();
  const project = projects?.find((p) => p._id === todo?.projectId);
  const progress = subtaskProgress(todo?.subtasks);

  if (!todo) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={todo.title}
      description={`Created ${formatDateTime(todo.createdAt)}`}
      footer={
        <>
          <Link href={`/dashboard/edit-todo/${todo._id}`}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Link href={`/dashboard/todo/${todo._id}`}>
            <Button size="sm">Open</Button>
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={todo.status} />
          <PriorityBadge priority={todo.priority} />
          <DueBadge todo={todo} />
          <StartBadge todo={todo} />
          <BlockedBadge count={todo.blockedBy?.length || 0} />
          <EstimateBadge estimate={todo.estimate} />
          <TimeBadge todo={todo} />
          <ProjectBadge project={project} />
          {todo.tags?.map((tag) => (
            <Tag key={tag} label={tag} />
          ))}
        </div>

        {todo.description || todo.descriptionHtml ? (
          <RichTextView html={todo.descriptionHtml} text={todo.description} />
        ) : (
          <p className="text-sm text-fg-subtle">No description.</p>
        )}

        {progress && (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
              <span>Subtasks</span>
              <span className="tabular-nums">
                {progress.done}/{progress.total}
              </span>
            </div>
            <Progress value={progress.percent} tone={progress.percent === 100 ? "success" : "primary"} />
            <ul className="mt-3 space-y-1.5">
              {todo.subtasks?.map((subtask, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-fg-muted">
                  {subtask.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-fg-subtle" />
                  )}
                  <span className={subtask.done ? "line-through decoration-fg-subtle" : undefined}>
                    {subtask.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-fg-subtle">Press Space to close · Enter opens the full page</p>
      </div>
    </Modal>
  );
}
