"use client";

import * as React from "react";
import { Check, LayoutGrid } from "lucide-react";
import { Badge, PageTransition, useToast } from "@/components/ui";
import { Section, SettingsTabs } from "@/components/settings/SettingsSection";
import { VariantIcon } from "@/components/variant/VariantIcon";
import { VariantNotice } from "@/components/variant/VariantNotice";
import { useMe, useUpdatePreferences } from "@/hooks/useAuth";
import { DEFAULT_VARIANT, VARIANTS, type Variant } from "@/lib/variants";
import { cn } from "@/lib/utils";

/** One variant in the gallery, shaped like the theme cards next door. */
function VariantCard({
  variant,
  selected,
  onSelect,
}: {
  variant: Variant;
  selected: boolean;
  onSelect: () => void;
}) {
  const extras = variant.todoFields.length + variant.projectFields.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-border-strong"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-primary text-primary-fg" : "bg-surface-sunken text-fg-muted"
        )}
      >
        <VariantIcon name={variant.icon} className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">{variant.label}</span>
          {selected && <Check className="h-3.5 w-3.5 text-primary" />}
        </span>
        <span className="mt-0.5 block text-xs text-fg-muted">{variant.description}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral" size="xs">
            {variant.terms.todo.many}
          </Badge>
          <Badge tone="neutral" size="xs">
            {variant.terms.project.many}
          </Badge>
          {extras > 0 && (
            <Badge tone="primary" size="xs">
              {extras} extra field{extras === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
      </span>
    </button>
  );
}

export default function ApplicationSettingsPage() {
  const toast = useToast();
  const { data: user } = useMe();
  const updatePreferences = useUpdatePreferences();

  const active = user?.preferences?.applicationType || DEFAULT_VARIANT;

  const select = (id: string) => {
    if (id === active) return;
    updatePreferences.mutate(
      { applicationType: id },
      {
        onError: (error) => toast.error("Could not save preference", { description: (error as Error).message }),
        onSuccess: () => toast.success(`Now running as ${VARIANTS.find((v) => v.id === id)?.label}`),
      }
    );
  };

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <SettingsTabs />

      {/* Whatever the active type has to say for itself, said where it is chosen. */}
      <VariantNotice />

      <Section
        icon={<LayoutGrid className="h-4 w-4" />}
        title="Application type"
        description="Changes what things are called and which extra fields records carry. A project can override this for its own work."
      >
        <div className="grid gap-2">
          {VARIANTS.map((variant) => (
            <VariantCard
              key={variant.id}
              variant={variant}
              selected={variant.id === active}
              onSelect={() => select(variant.id)}
            />
          ))}
        </div>

        {/* The one thing people actually worry about when they switch. */}
        <p className="text-xs text-fg-muted">
          Switching hides the fields of the type you leave; it never deletes them. They stay on the record and reappear
          if you switch back — and until then they are listed on each record&apos;s detail page.
        </p>
      </Section>
    </PageTransition>
  );
}
