import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, tagColor } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-fg-muted ring-border",
        primary: "bg-primary/10 text-primary ring-primary/25",
        success: "bg-success/12 text-success ring-success/25",
        warning: "bg-warning/12 text-warning ring-warning/25",
        danger: "bg-danger/12 text-danger ring-danger/25",
        info: "bg-info/12 text-info ring-info/25",
      },
      size: {
        xs: "px-1.5 py-0.5 text-[10px]",
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** A tag chip, coloured deterministically from its label. */
export function Tag({
  label,
  onRemove,
  onClick,
  active,
  className,
}: {
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-transform",
        tagColor(label),
        onClick && "cursor-pointer hover:scale-105",
        active && "ring-2 ring-primary",
        className
      )}
    >
      #{label}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full opacity-60 transition-opacity hover:opacity-100"
        >
          &times;
        </button>
      )}
    </Comp>
  );
}
