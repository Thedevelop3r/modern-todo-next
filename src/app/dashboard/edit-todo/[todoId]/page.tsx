"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Save } from "lucide-react";
import { Button, PageTransition, Spinner, useToast } from "@/components/ui";
import { TodoForm, draftFromTodo, emptyDraft, validateDraft, type TodoDraft } from "@/components/todo/TodoForm";
import { useTodo, useUpdateTodo } from "@/hooks/useTodos";

export default function EditTodoPage({ params }: { params: { todoId: string } }) {
  const router = useRouter();
  const toast = useToast();
  const { todoId } = params;

  const { data: todo, isLoading, isError, error } = useTodo(todoId);
  const updateTodo = useUpdateTodo();

  const [draft, setDraft] = React.useState<TodoDraft>(emptyDraft);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef(false);

  // Seed the form once, so refetches do not overwrite in-progress edits.
  React.useEffect(() => {
    if (todo && !loaded.current) {
      loaded.current = true;
      setDraft(draftFromTodo(todo));
    }
  }, [todo]);

  const change = (patch: Partial<TodoDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    const { valid, errors: found } = validateDraft(draft);
    setErrors(found);
    if (!valid) {
      toast.error("Check the form", { description: Object.values(found)[0] });
      return;
    }

    updateTodo.mutate(
      { id: todoId, input: draft },
      {
        onSuccess: () => {
          toast.success("Changes saved");
          router.push(`/dashboard/todo/${todoId}`);
        },
        onError: (err) => toast.error("Could not save", { description: (err as Error).message }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-fg-muted">{(error as Error).message}</p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push("/dashboard")}>
          Back to todos
        </Button>
      </div>
    );
  }

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
          <Button variant="secondary" onClick={() => router.push(`/dashboard/todo/${todoId}`)}>
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button onClick={save} loading={updateTodo.isPending}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      </div>

      <TodoForm draft={draft} onChange={change} errors={errors} />
    </PageTransition>
  );
}
