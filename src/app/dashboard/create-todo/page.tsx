"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button, PageTransition, useToast } from "@/components/ui";
import { TodoForm, draftToInput, emptyDraft, validateDraft, type TodoDraft } from "@/components/todo/TodoForm";
import { useCreateTodo } from "@/hooks/useTodos";
import { useVariant } from "@/hooks/useVariant";
import { fromDateInput } from "@/lib/date";

export default function CreateTodoPage() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const createTodo = useCreateTodo();

  // The calendar links here with ?due=YYYY-MM-DD to pre-date a new todo.
  const [draft, setDraft] = React.useState<TodoDraft>(() => {
    const due = searchParams.get("due");
    return { ...emptyDraft(), dueDate: due ? fromDateInput(due) : null };
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  // The project chosen in the form can override the account's variant.
  const { variant, t } = useVariant(draft.projectId);

  const change = (patch: Partial<TodoDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    const { valid, errors: found } = validateDraft(draft);
    setErrors(found);
    if (!valid) {
      toast.error("Check the form", { description: Object.values(found)[0] });
      return;
    }

    createTodo.mutate(draftToInput(draft, variant.id), {
      onSuccess: (todo) => {
        toast.success(`${t("todo")} created`, { description: todo.title });
        router.push("/dashboard");
      },
      onError: (error) =>
        toast.error(`Could not create ${t("todo").toLowerCase()}`, { description: (error as Error).message }),
    });
  };

  return (
    <PageTransition className="mx-auto max-w-6xl space-y-5">
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
          <Button variant="ghost" onClick={() => router.push("/dashboard")}>
            Cancel
          </Button>
          <Button onClick={save} loading={createTodo.isPending}>
            <Save className="h-4 w-4" />
            Create todo
          </Button>
        </div>
      </div>

      <TodoForm draft={draft} onChange={change} errors={errors} />
    </PageTransition>
  );
}
