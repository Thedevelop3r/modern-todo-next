"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, CheckCircle2, FolderOpen, Pencil, Pin, Tag as TagIcon, Trash2, X } from "lucide-react";
import {
  Button,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui";
import { PRIORITIES, STATUSES, PROJECT_COLORS, cn } from "@/lib/utils";
import { useVariant } from "@/hooks/useVariant";
import { useProjects } from "@/hooks/useProjects";

export type BulkAction = { action: string; value?: unknown };

/** Floating action bar shown while todos are multi-selected. */
export function BulkBar({
  count,
  onClear,
  onAction,
  busy,
}: {
  count: number;
  onClear: () => void;
  onAction: (action: BulkAction) => void;
  busy?: boolean;
}) {
  const [tagValue, setTagValue] = React.useState("");
  const { data: projects } = useProjects();
  const { statusLabel, priorityLabel } = useVariant();

  const applyTag = () => {
    const value = tagValue.trim();
    if (!value) return;
    onAction({ action: "tag", value });
    setTagValue("");
  };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="pointer-events-none sticky bottom-4 z-30 flex justify-center"
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised p-2 shadow-lg">
            <span className="px-2 text-sm font-semibold text-fg">
              {count} selected
            </span>

            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" />
                  Status
                </Button>
              </MenuTrigger>
              <MenuContent align="center">
                <MenuLabel>Set status</MenuLabel>
                {STATUSES.map((status) => (
                  <MenuItem key={status} onSelect={() => onAction({ action: "status", value: status })}>
                    {statusLabel(status)}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuLabel>Set priority</MenuLabel>
                {PRIORITIES.map((priority) => (
                  <MenuItem key={priority} onSelect={() => onAction({ action: "priority", value: priority })}>
                    {priorityLabel(priority)}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>

            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busy}>
                  <TagIcon className="h-4 w-4" />
                  Tag
                </Button>
              </MenuTrigger>
              <MenuContent align="center">
                <div className="p-1.5">
                  <Input
                    value={tagValue}
                    onChange={(e) => setTagValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyTag();
                      }
                    }}
                    placeholder="Tag name…"
                    className="h-9"
                  />
                  <Button size="sm" block className="mt-2" onClick={applyTag}>
                    Add tag
                  </Button>
                </div>
              </MenuContent>
            </Menu>

            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={busy}>
                  <FolderOpen className="h-4 w-4" />
                  Project
                </Button>
              </MenuTrigger>
              <MenuContent align="center">
                <MenuLabel>Move to project</MenuLabel>
                <MenuItem onSelect={() => onAction({ action: "project", value: null })}>No project</MenuItem>
                {projects?.map((project) => (
                  <MenuItem
                    key={project._id}
                    icon={<span className={cn("h-2 w-2 rounded-full", PROJECT_COLORS[project.color].dot)} />}
                    onSelect={() => onAction({ action: "project", value: project._id })}
                  >
                    {project.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>

            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction({ action: "edit" })}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>

            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction({ action: "pin" })}>
              <Pin className="h-4 w-4" />
              Pin
            </Button>

            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction({ action: "archive" })}>
              <Archive className="h-4 w-4" />
              Archive
            </Button>

            <Button variant="ghost" size="sm" disabled={busy} className="text-danger hover:bg-danger-soft" onClick={() => onAction({ action: "delete" })}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>

            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
