"use client";

import * as React from "react";
import { GripVertical, Plus, Repeat, X } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Field,
  Input,
  NativeSelect,
  Progress,
  RichTextEditor,
  Tag,
  Textarea,
} from "@/components/ui";
import { PRIORITIES, STATUSES, subtaskProgress } from "@/lib/utils";
import { ProjectPicker } from "./ProjectPicker";
import { fromDateInput, toDateInput } from "@/lib/date";
import { todoSchema } from "@/lib/validation";
import { displayHtml, htmlToText } from "@/lib/richtext";
import { useTags } from "@/hooks/useTodos";
import { useVariant } from "@/hooks/useVariant";
import { VariantFields, type VariantValues } from "@/components/variant/VariantFields";

export type TodoDraft = {
  title: string;
  /** Inline marks only; "" means the plain title is the whole story. */
  titleHtml: string;
  description: string;
  /** What the editor produces. The server derives `description` from it. */
  descriptionHtml: string;
  status: TodoStatus;
  priority: TodoPriority;
  tags: string[];
  subtasks: Subtask[];
  dueDate: string | null;
  startDate: string | null;
  estimate: number | null;
  projectId: string | null;
  recurrence: TodoRecurrence;
  pinned: boolean;
  /**
   * The active variant's extra fields, flat. The form never sees the other
   * variants' data and never sends it, which is how a save cannot drop it.
   */
  variantValues: VariantValues;
};

export const emptyDraft = (): TodoDraft => ({
  title: "",
  titleHtml: "",
  description: "",
  descriptionHtml: "",
  status: "pending",
  priority: "none",
  tags: [],
  subtasks: [],
  dueDate: null,
  startDate: null,
  estimate: null,
  projectId: null,
  recurrence: "none",
  pinned: false,
  variantValues: {},
});

export const draftFromTodo = (todo: Todo): TodoDraft => ({
  title: todo.title || "",
  titleHtml: todo.titleHtml || "",
  // A todo written before rich text existed has plaintext only, so the editor
  // is seeded from that rather than opening empty.
  description: todo.description || "",
  descriptionHtml: displayHtml(todo.descriptionHtml, todo.description),
  status: todo.status || "pending",
  priority: todo.priority || "none",
  tags: todo.tags || [],
  subtasks: (todo.subtasks || []).map((s) => ({ title: s.title, done: s.done })),
  dueDate: todo.dueDate || null,
  startDate: todo.startDate || null,
  estimate: todo.estimate ?? null,
  projectId: todo.projectId || null,
  recurrence: todo.recurrence || "none",
  pinned: todo.pinned || false,
  variantValues: {},
});

/** The same draft, with the active variant's stored values filled in. */
export const draftFromTodoFor = (todo: Todo, variantId: string): TodoDraft => ({
  ...draftFromTodo(todo),
  variantValues: (todo.variantData?.[variantId] as VariantValues) || {},
});

/** Free-text tag entry with suggestions from the user's existing tags. */
function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = React.useState("");
  const { data: existing } = useTags();

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/^#/, "").slice(0, 24);
    if (!tag || value.includes(tag) || value.length >= 10) return;
    onChange([...value, tag]);
    setInput("");
  };

  const suggestions = (existing || [])
    .map((t) => t.name)
    .filter((name) => !value.includes(name) && name.includes(input.trim().toLowerCase()))
    .slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <Tag key={tag} label={tag} onRemove={() => onChange(value.filter((t) => t !== tag))} />
        ))}
      </div>

      <Input
        className="mt-2"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          // Enter or comma commits; backspace on an empty field pops the last tag.
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(input)}
        placeholder={value.length >= 10 ? "Tag limit reached" : "Add a tag and press Enter…"}
        disabled={value.length >= 10}
      />

      {input && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <Tag key={name} label={name} onClick={() => add(name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskEditor({ value, onChange }: { value: Subtask[]; onChange: (subtasks: Subtask[]) => void }) {
  const [input, setInput] = React.useState("");
  const progress = subtaskProgress(value);

  const add = () => {
    const title = input.trim();
    if (!title || value.length >= 50) return;
    onChange([...value, { title, done: false }]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      {progress && (
        <div className="flex items-center gap-3 pb-1">
          <Progress value={progress.percent} tone={progress.percent === 100 ? "success" : "primary"} />
          <span className="shrink-0 text-xs tabular-nums text-fg-muted">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}

      {value.map((subtask, index) => (
        <div key={index} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
          <GripVertical className="h-4 w-4 shrink-0 text-fg-subtle" />
          <Checkbox
            checked={subtask.done}
            onCheckedChange={(done) =>
              onChange(value.map((s, i) => (i === index ? { ...s, done } : s)))
            }
            label={subtask.title}
          />
          <input
            value={subtask.title}
            onChange={(e) => onChange(value.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)))}
            className={`flex-1 bg-transparent text-sm text-fg outline-none ${subtask.done ? "text-fg-muted line-through" : ""}`}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove ${subtask.title}`}
            className="rounded p-1 text-fg-subtle transition-colors hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a subtask…"
          disabled={value.length >= 50}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!input.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function TodoForm({
  draft,
  onChange,
  errors,
}: {
  draft: TodoDraft;
  onChange: (patch: Partial<TodoDraft>) => void;
  errors: Record<string, string>;
}) {
  // The project in the draft can override the account's variant, so the labels
  // and the extra fields follow whatever the todo is being filed under.
  const { statusLabel, priorityLabel, todoFields, variant } = useVariant(draft.projectId);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-4">
            <Field label="Title" required error={errors.title} htmlFor="todo-title">
              <RichTextEditor
                id="todo-title"
                profile="inline"
                value={draft.titleHtml}
                onChange={(html) =>
                  // The plaintext half is kept in step locally so validation and
                  // the character count work before the round trip; the server
                  // derives it again from the markup on write.
                  onChange({ titleHtml: html, title: htmlToText(html).slice(0, 100) })
                }
                placeholder="What needs doing?"
                invalid={Boolean(errors.title)}
                maxLength={100}
              />
              <p className="mt-1.5 text-right text-xs text-fg-subtle">{draft.title.length}/100</p>
            </Field>

            <Field label="Description" error={errors.description} htmlFor="todo-description">
              <RichTextEditor
                id="todo-description"
                rows={8}
                value={draft.descriptionHtml}
                onChange={(html) => onChange({ descriptionHtml: html, description: htmlToText(html) })}
                placeholder="Add any detail worth remembering…"
                invalid={Boolean(errors.description)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="mb-3 text-sm font-semibold text-fg">Subtasks</h3>
            <SubtaskEditor value={draft.subtasks} onChange={(subtasks) => onChange({ subtasks })} />
          </CardContent>
        </Card>

        {/* Nothing here knows which variant is active - the registry does. */}
        {todoFields.length > 0 && (
          <Card>
            <CardContent>
              <h3 className="mb-3 text-sm font-semibold text-fg">{variant.label} details</h3>
              <VariantFields
                fields={todoFields}
                values={draft.variantValues}
                idPrefix="todo-variant"
                onChange={(key, value) =>
                  onChange({ variantValues: { ...draft.variantValues, [key]: value } })
                }
              />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-4">
            <Field label="Status" htmlFor="todo-status">
              <NativeSelect
                id="todo-status"
                value={draft.status}
                onChange={(e) => onChange({ status: e.target.value as TodoStatus })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Priority" htmlFor="todo-priority">
              <NativeSelect
                id="todo-priority"
                value={draft.priority}
                onChange={(e) => onChange({ priority: e.target.value as TodoPriority })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabel(priority)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Due date" htmlFor="todo-due">
              <Input
                id="todo-due"
                type="date"
                value={toDateInput(draft.dueDate)}
                onChange={(e) => onChange({ dueDate: fromDateInput(e.target.value) })}
              />
              {draft.dueDate && (
                <button
                  type="button"
                  onClick={() => onChange({ dueDate: null })}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Clear due date
                </button>
              )}
            </Field>

            <Field label="Project" htmlFor="todo-project">
              <ProjectPicker value={draft.projectId} onChange={(projectId) => onChange({ projectId })} />
            </Field>

            <Field label="Start date" htmlFor="todo-start" hint="When work can begin.">
              <Input
                id="todo-start"
                type="date"
                value={toDateInput(draft.startDate)}
                onChange={(e) => onChange({ startDate: fromDateInput(e.target.value) })}
              />
            </Field>

            <Field label="Estimate" htmlFor="todo-estimate" hint="Effort in points. Leave blank for none.">
              <Input
                id="todo-estimate"
                type="number"
                min={0}
                max={1000}
                value={draft.estimate ?? ""}
                onChange={(e) =>
                  onChange({ estimate: e.target.value === "" ? null : Number(e.target.value) })
                }
                placeholder="e.g. 3"
              />
            </Field>

            <Field
              label="Repeat"
              htmlFor="todo-recurrence"
              hint={
                draft.recurrence !== "none" ? (
                  <span className="flex items-center gap-1.5">
                    <Repeat className="h-3 w-3" />
                    A new copy appears when you complete this one.
                  </span>
                ) : null
              }
            >
              <NativeSelect
                id="todo-recurrence"
                value={draft.recurrence}
                onChange={(e) => onChange({ recurrence: e.target.value as TodoRecurrence })}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </NativeSelect>
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5 pt-1">
              <Checkbox checked={draft.pinned} onCheckedChange={(pinned) => onChange({ pinned })} label="Pin to top" />
              <span className="text-sm text-fg">Pin to top</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="mb-3 text-sm font-semibold text-fg">Tags</h3>
            <TagInput value={draft.tags} onChange={(tags) => onChange({ tags })} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Validates a draft with the shared schema, returning per-field messages. */
/**
 * The draft as the API takes it.
 *
 * `variantValues` is flat in the form and nested under the active variant on
 * the wire, because the server writes it as `variantData.<id>.<key>` dot paths
 * - the only form that is additive and the only one Mongoose persists for a
 * Mixed path. The form never holds another variant's values, so a save cannot
 * drop them.
 */
export function draftToInput(draft: TodoDraft, variantId: string) {
  const { variantValues, ...rest } = draft;
  if (!variantValues || Object.keys(variantValues).length === 0) return rest;
  return { ...rest, variantData: { [variantId]: variantValues } };
}

export function validateDraft(draft: TodoDraft) {
  const result = todoSchema.safeParse(draft);
  if (result.success) return { valid: true as const, errors: {} as Record<string, string> };

  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  });
  return { valid: false as const, errors };
}
