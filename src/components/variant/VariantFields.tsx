"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { Badge, Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import type { VariantField } from "@/lib/variants";
import { formatDate } from "@/lib/date";

type ChecklistItem = { title: string; done: boolean };
type FieldValue = string | number | boolean | ChecklistItem[] | null | undefined;
export type VariantValues = Record<string, FieldValue>;

/**
 * The one renderer for every variant's extra fields.
 *
 * A `switch` over seven field types, each mapping to an existing ui primitive.
 * That closed set is the whole reason this stays generic: a new variant adds
 * JSON, not a component - and if a variant ever needs a type that is not here,
 * the answer is an eighth case, not a branch on the variant id.
 */
export function VariantFields({
  fields,
  values,
  onChange,
  idPrefix = "variant",
}: {
  fields: VariantField[];
  values: VariantValues;
  onChange: (key: string, value: FieldValue) => void;
  idPrefix?: string;
}) {
  if (!fields.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          hint={field.hint}
          htmlFor={`${idPrefix}-${field.key}`}
          className={field.type === "text" || field.type === "checklist" ? "sm:col-span-2" : undefined}
        >
          <VariantInput
            field={field}
            id={`${idPrefix}-${field.key}`}
            value={values[field.key]}
            onChange={(value) => onChange(field.key, value)}
          />
        </Field>
      ))}
    </div>
  );
}

function VariantInput({
  field,
  id,
  value,
  onChange,
}: {
  field: VariantField;
  id: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <Textarea
          id={id}
          rows={3}
          value={(value as string) || ""}
          maxLength={field.max || 4000}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          // "" is cleared, not zero - the two mean different things.
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
      );

    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={((value as string) || "").slice(0, 10)}
          onChange={(event) => onChange(event.target.value || null)}
        />
      );

    case "enum":
      return (
        <NativeSelect id={id} value={(value as string) || ""} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">—</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      );

    case "boolean":
      return (
        <div className="flex h-10 items-center gap-2">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
            label={field.label}
          />
          <span className="text-sm text-fg-muted">{field.placeholder || "Yes"}</span>
        </div>
      );

    case "checklist":
      return <ChecklistInput id={id} items={(value as ChecklistItem[]) || []} onChange={onChange} />;

    case "string":
    default:
      return (
        <Input
          id={id}
          value={(value as string) || ""}
          maxLength={field.max || 200}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function ChecklistInput({
  id,
  items,
  onChange,
}: {
  id: string;
  items: ChecklistItem[];
  onChange: (value: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...items, { title, done: false }]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="flex items-center gap-2">
          <Checkbox
            checked={item.done}
            onCheckedChange={(checked) =>
              onChange(items.map((entry, i) => (i === index ? { ...entry, done: Boolean(checked) } : entry)))
            }
            label={item.title}
          />
          <span className={item.done ? "flex-1 text-sm text-fg-muted line-through" : "flex-1 text-sm text-fg"}>
            {item.title}
          </span>
          <button
            type="button"
            aria-label={`Remove ${item.title}`}
            className="text-fg-subtle hover:text-danger"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={draft}
          placeholder="Add an item"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter belongs to this row, not to the form around it.
            event.preventDefault();
            add();
          }}
        />
        <button
          type="button"
          aria-label="Add item"
          className="rounded-lg p-2 text-fg-muted hover:bg-surface-sunken hover:text-fg"
          onClick={add}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** One field's value as text, for the read-only panels. */
export function formatVariantValue(field: VariantField, value: FieldValue): React.ReactNode {
  if (value === null || value === undefined || value === "") return "—";

  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatDate(value as string);
    case "enum":
      return field.options?.find((option) => option.value === value)?.label || String(value);
    case "checklist": {
      const items = value as ChecklistItem[];
      if (!items.length) return "—";
      return (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${item.title}-${index}`} className="flex items-center gap-1.5 text-sm">
              {item.done ? <Check className="h-3.5 w-3.5 text-success" /> : <span className="w-3.5" />}
              <span className={item.done ? "text-fg-muted line-through" : "text-fg"}>{item.title}</span>
            </li>
          ))}
        </ul>
      );
    }
    default:
      return String(value);
  }
}

/** The same fields, read-only - used on the detail page and for dormant variants. */
export function VariantFieldList({
  fields,
  values,
  muted,
}: {
  fields: VariantField[];
  values: VariantValues;
  muted?: boolean;
}) {
  const present = fields.filter((field) => {
    const value = values[field.key];
    return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
  });

  if (!present.length) return null;

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {present.map((field) => (
        <div key={field.key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{field.label}</dt>
          <dd className={muted ? "mt-1 text-sm text-fg-muted" : "mt-1 text-sm text-fg"}>
            {formatVariantValue(field, values[field.key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Values a dormant variant carries but whose field definitions we still know. */
export function DormantBadge({ count }: { count: number }) {
  return <Badge tone="neutral">{count} kept</Badge>;
}
