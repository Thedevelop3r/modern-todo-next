"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const surfaceClasses =
  "z-50 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-surface-raised p-1 shadow-lg data-[state=open]:animate-slide-up";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={6} className={cn(surfaceClasses, className)}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={(e) => {
        e.preventDefault();
        onSelect?.();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
        danger
          ? "text-danger data-[highlighted]:bg-danger-soft"
          : "text-fg data-[highlighted]:bg-surface-sunken",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
      )}
    >
      {icon && <span className="shrink-0 text-fg-subtle">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg outline-none transition-colors data-[highlighted]:bg-surface-sunken"
    >
      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-fg" : "border-border-strong")}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-border" />;

export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
    {children}
  </DropdownMenu.Label>
);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-fg shadow-md"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[rgb(var(--surface-raised))]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  children,
  align = "start",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 rounded-xl border border-border bg-surface-raised p-3 shadow-lg", className)}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
