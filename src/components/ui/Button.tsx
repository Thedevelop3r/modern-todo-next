"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:brightness-110 hover:shadow-md",
        secondary: "bg-surface-raised text-fg ring-1 ring-inset ring-border hover:bg-surface-sunken hover:ring-border-strong",
        outline: "bg-transparent text-fg ring-1 ring-inset ring-border-strong hover:bg-surface-sunken",
        ghost: "bg-transparent text-fg-muted hover:bg-surface-sunken hover:text-fg",
        danger: "bg-danger text-white shadow-sm hover:brightness-110",
        success: "bg-success text-white shadow-sm hover:brightness-110",
        subtle: "bg-primary-soft text-primary hover:brightness-95 dark:hover:brightness-125",
      },
      size: {
        xs: "h-7 px-2.5 text-xs",
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-lg transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
  {
    variants: {
      variant: {
        ghost: "text-fg-muted hover:bg-surface-sunken hover:text-fg",
        outline: "text-fg-muted ring-1 ring-inset ring-border hover:bg-surface-sunken hover:text-fg",
        solid: "bg-primary text-primary-fg shadow-sm hover:brightness-110",
        danger: "text-danger hover:bg-danger-soft",
      },
      size: { xs: "h-7 w-7", sm: "h-8 w-8", md: "h-10 w-10" },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, children, ...props }, ref) => (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  )
);
IconButton.displayName = "IconButton";

export { buttonVariants };
