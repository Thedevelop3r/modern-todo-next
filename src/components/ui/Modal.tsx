"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./Button";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            {/*
              Centering lives on this wrapper, not on the dialog itself. Motion
              writes an inline `transform` on whatever it animates - and once
              `y` and `scale` settle at their defaults, that inline value is
              `none` - which would beat any `-translate-1/2` class and drop the
              dialog's top-left corner at the middle of the screen, running the
              footer off the bottom. Flex centering survives the animation.

              It is click-through so the overlay underneath still dismisses.
            */}
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  // Capped to the viewport and laid out as a column: the header and
                  // footer stay put while the body scrolls, so a tall dialog is never
                  // clipped off the top and bottom of the screen. `dvh` rather than
                  // `vh` so mobile browser chrome does not eat the footer.
                  className={cn(
                    "pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col",
                    "overflow-hidden rounded-2xl border border-border bg-surface-raised",
                    "shadow-xl focus:outline-none",
                    width
                  )}
                >
                  {(title || description) && (
                    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
                      <div>
                        {title && <Dialog.Title className="text-lg font-semibold text-fg">{title}</Dialog.Title>}
                        {description && (
                          <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description>
                        )}
                      </div>
                      <Dialog.Close asChild>
                        <IconButton label="Close">
                          <X className="h-4 w-4" />
                        </IconButton>
                      </Dialog.Close>
                    </div>
                  )}
                  {children && (
                    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-5">{children}</div>
                  )}
                  {footer && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
                      {footer}
                    </div>
                  )}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Promise-free confirm dialog used for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
