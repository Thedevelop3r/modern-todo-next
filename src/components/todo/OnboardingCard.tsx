"use client";

import * as React from "react";
import Link from "next/link";
import { Command, Keyboard, Plus, Sparkles, Upload } from "lucide-react";
import { Button, Card, CardContent, useToast } from "@/components/ui";
import { useSampleData } from "@/hooks/useAccount";
import { useUiStore } from "@/store/state";

/**
 * Shown in place of the empty state when the account has no todos at all (as
 * opposed to no todos matching a filter). Offers the three ways to get going.
 */
export function OnboardingCard() {
  const toast = useToast();
  const sampleData = useSampleData();
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <Card>
      <CardContent className="space-y-5 py-8 text-center">
        <div>
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Sparkles className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-fg">Let&rsquo;s fill this up</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-muted">
            Start from scratch, bring todos in from another app, or drop in a sample project to look
            around first.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href="/dashboard/create-todo">
            <Button>
              <Plus className="h-4 w-4" />
              New todo
            </Button>
          </Link>

          <Button
            variant="secondary"
            loading={sampleData.isPending}
            onClick={() =>
              sampleData.mutate(undefined, {
                onSuccess: (result) =>
                  toast.success("Sample data added", {
                    description: `${result.todos} todos across ${result.projects} projects.`,
                  }),
                onError: (error: Error) =>
                  toast.error("Could not add sample data", { description: error.message }),
              })
            }
          >
            <Sparkles className="h-4 w-4" />
            Add sample data
          </Button>

          <Link href="/dashboard/settings/data">
            <Button variant="outline">
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-fg-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Command className="h-3.5 w-3.5" />
            Ctrl+K searches everything
          </span>
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="inline-flex items-center gap-1.5 hover:text-fg"
          >
            <Keyboard className="h-3.5 w-3.5" />
            See the shortcuts
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
