"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Field,
  Input,
  NativeSelect,
  PageTransition,
  Textarea,
  useToast,
} from "@/components/ui";
import { useCreateTemplate } from "@/hooks/useLibrary";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/utils";

type TemplateDraft = {
  name: string;
  title: string;
  description: string;
  priority: TodoPriority;
  tags: string;
  dueInDays: string;
};

const emptyDraft = (): TemplateDraft => ({
  name: "",
  title: "",
  description: "",
  priority: "none",
  tags: "",
  dueInDays: "",
});

/**
 * Creating a template is a full page rather than a dialog, matching
 * /dashboard/create-todo: the form is long enough that a modal cramped it on a
 * phone, and a page gives the work its own URL and back button.
 */
export default function NewTemplatePage() {
  const router = useRouter();
  const toast = useToast();
  const createTemplate = useCreateTemplate();

  const [draft, setDraft] = React.useState<TemplateDraft>(emptyDraft);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const change = (patch: Partial<TemplateDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "Give the template a name";
    if (!draft.title.trim()) found.title = "Give the todo a title";
    setErrors(found);

    if (Object.keys(found).length) {
      toast.error("Check the form", { description: Object.values(found)[0] });
      return;
    }

    createTemplate.mutate(
      {
        name: draft.name.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10),
        dueInDays: draft.dueInDays === "" ? null : Number(draft.dueInDays),
      },
      {
        onSuccess: () => {
          toast.success("Template saved");
          router.push("/dashboard/templates");
        },
        onError: (error) => toast.error("Could not save template", { description: (error as Error).message }),
      }
    );
  };

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.push("/dashboard/templates")}>
            Cancel
          </Button>
          <Button onClick={save} loading={createTemplate.isPending}>
            <Save className="h-4 w-4" />
            Save template
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            A starting point you can spin into a todo whenever you need it.
          </p>

          <Field label="Template name" required error={errors.name} htmlFor="tpl-name">
            <Input
              id="tpl-name"
              autoFocus
              value={draft.name}
              onChange={(e) => change({ name: e.target.value })}
              placeholder="Weekly report"
              maxLength={60}
              invalid={Boolean(errors.name)}
            />
          </Field>

          <Field label="Todo title" required error={errors.title} htmlFor="tpl-title">
            <Input
              id="tpl-title"
              value={draft.title}
              onChange={(e) => change({ title: e.target.value })}
              placeholder="Write the weekly report"
              maxLength={100}
              invalid={Boolean(errors.title)}
            />
          </Field>

          <Field label="Description" htmlFor="tpl-description">
            <Textarea
              id="tpl-description"
              rows={4}
              value={draft.description}
              onChange={(e) => change({ description: e.target.value })}
              maxLength={1500}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" htmlFor="tpl-priority">
              <NativeSelect
                id="tpl-priority"
                value={draft.priority}
                onChange={(e) => change({ priority: e.target.value as TodoPriority })}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Due in (days)" htmlFor="tpl-due" hint="Blank for no due date.">
              <Input
                id="tpl-due"
                type="number"
                min={0}
                max={3650}
                value={draft.dueInDays}
                onChange={(e) => change({ dueInDays: e.target.value })}
                placeholder="7"
              />
            </Field>
          </div>

          <Field label="Tags" htmlFor="tpl-tags" hint="Comma separated.">
            <Input
              id="tpl-tags"
              value={draft.tags}
              onChange={(e) => change({ tags: e.target.value })}
              placeholder="work, report"
            />
          </Field>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
