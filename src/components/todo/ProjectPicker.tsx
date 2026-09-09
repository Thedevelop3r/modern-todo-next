"use client";

import * as React from "react";
import { Check, FolderOpen, Plus } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { useCreateProject, useProjects } from "@/hooks/useProjects";
import { PROJECT_COLORS, PROJECT_COLOR_NAMES, cn } from "@/lib/utils";

/** Coloured dot + name, used wherever a project is shown inline. */
export function ProjectBadge({ project, className }: { project?: Project | null; className?: string }) {
  if (!project) return null;
  const color = PROJECT_COLORS[project.color] || PROJECT_COLORS.indigo;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border",
        color.chip,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", color.dot)} />
      {project.name}
    </span>
  );
}

export function ColorSwatches({
  value,
  onChange,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROJECT_COLOR_NAMES.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={color}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110",
            PROJECT_COLORS[color].dot,
            value === color && "ring-2 ring-fg ring-offset-2 ring-offset-surface"
          )}
        >
          {value === color && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

/** Dialog for creating a project; reused by the sidebar and the todo form. */
export function NewProjectModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: Project) => void;
}) {
  const toast = useToast();
  const createProject = useCreateProject();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<ProjectColor>("indigo");

  const reset = () => {
    setName("");
    setDescription("");
    setColor("indigo");
  };

  const submit = () => {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), description: description.trim(), color },
      {
        onSuccess: (project) => {
          toast.success("Project created", { description: project.name });
          onCreated?.(project);
          onOpenChange(false);
          reset();
        },
        onError: (error) => toast.error("Could not create project", { description: (error as Error).message }),
      }
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      description="Group related todos together."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={createProject.isPending} disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required htmlFor="project-name">
          <Input
            id="project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Website redesign"
            maxLength={60}
          />
        </Field>

        <Field label="Description" htmlFor="project-description">
          <Textarea
            id="project-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            maxLength={500}
          />
        </Field>

        <Field label="Colour">
          <ColorSwatches value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  );
}

/** Dropdown that assigns a todo to a project (or to none). */
export function ProjectPicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const { data: projects } = useProjects();
  const [newOpen, setNewOpen] = React.useState(false);
  const selected = projects?.find((p) => p._id === value);

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm text-fg transition-colors hover:border-border-strong"
          >
            {selected ? (
              <>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PROJECT_COLORS[selected.color].dot)} />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <>
                <FolderOpen className="h-4 w-4 shrink-0 text-fg-subtle" />
                <span className="text-fg-subtle">No project</span>
              </>
            )}
          </button>
        </MenuTrigger>

        <MenuContent align="start" className="min-w-[14rem]">
          <MenuLabel>Project</MenuLabel>
          <MenuItem onSelect={() => onChange(null)}>
            <span className={cn(!value && "font-semibold text-primary")}>No project</span>
          </MenuItem>

          {projects?.map((project) => (
            <MenuItem
              key={project._id}
              icon={<span className={cn("h-2 w-2 rounded-full", PROJECT_COLORS[project.color].dot)} />}
              onSelect={() => onChange(project._id as string)}
            >
              <span className={cn(value === project._id && "font-semibold text-primary")}>{project.name}</span>
            </MenuItem>
          ))}

          <MenuSeparator />
          <MenuItem icon={<Plus className="h-4 w-4" />} onSelect={() => setNewOpen(true)}>
            New project…
          </MenuItem>
        </MenuContent>
      </Menu>

      <NewProjectModal open={newOpen} onOpenChange={setNewOpen} onCreated={(p) => onChange(p._id as string)} />
    </>
  );
}
