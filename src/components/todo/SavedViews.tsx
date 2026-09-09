"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
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
  useToast,
} from "@/components/ui";
import { useCreateView, useDeleteView, useSavedViews } from "@/hooks/useLibrary";
import { serializeFilter } from "@/hooks/useFilters";

/**
 * Saves the current filter under a name and replays it later. Because filters
 * already live in the URL, a saved view is just a stored query object.
 */
export function SavedViewsMenu({ filter, activeCount }: { filter: TodoFilter; activeCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const { data: views } = useSavedViews();
  const createView = useCreateView();
  const deleteView = useDeleteView();

  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const apply = (view: SavedView) => {
    const params = serializeFilter(view.query as TodoFilter);
    const query = params.toString();
    router.push(query ? `/dashboard?${query}` : "/dashboard");
  };

  const save = () => {
    if (!name.trim()) return;
    // Page number is deliberately not saved - a view should always open at the top.
    const { page, ...query } = filter;

    createView.mutate(
      { name: name.trim(), query: query as Record<string, unknown> },
      {
        onSuccess: (view) => {
          toast.success("View saved", { description: view.name });
          setSaveOpen(false);
          setName("");
        },
        onError: (error) => toast.error("Could not save view", { description: (error as Error).message }),
      }
    );
  };

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" size="md">
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">Views</span>
          </Button>
        </MenuTrigger>

        <MenuContent className="min-w-[14rem]">
          <MenuLabel>Saved views</MenuLabel>

          {views?.length ? (
            views.map((view) => (
              <MenuItem
                key={view._id}
                icon={<Bookmark className="h-4 w-4" />}
                onSelect={() => apply(view)}
              >
                <span className="flex-1 truncate">{view.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${view.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteView.mutate(view._id as string, {
                      onSuccess: () => toast.success("View deleted"),
                    });
                  }}
                  className="ml-2 rounded p-0.5 text-fg-subtle hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </MenuItem>
            ))
          ) : (
            <p className="px-2.5 py-2 text-sm text-fg-subtle">No saved views yet</p>
          )}

          <MenuSeparator />
          <MenuItem
            icon={<BookmarkPlus className="h-4 w-4" />}
            disabled={activeCount === 0}
            onSelect={() => setSaveOpen(true)}
          >
            {activeCount === 0 ? "Filter something first" : "Save current filter…"}
          </MenuItem>
        </MenuContent>
      </Menu>

      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save this view"
        description="The current filters are stored under a name you choose."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={createView.isPending} disabled={!name.trim()}>
              Save view
            </Button>
          </>
        }
      >
        <Field label="Name" required htmlFor="view-name">
          <Input
            id="view-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Overdue work"
            maxLength={60}
          />
        </Field>
      </Modal>
    </>
  );
}
