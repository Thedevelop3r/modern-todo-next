"use client";

import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { useVariant } from "@/hooks/useVariant";

/**
 * The standing notice the active variant declares, if it declares one.
 *
 * Registry data, so it appears wherever this component is placed and cannot be
 * forgotten on the next page someone adds. A variant with nothing to say
 * renders nothing at all.
 */
export function VariantNotice({ className }: { className?: string }) {
  const { variant } = useVariant();
  const notice = variant.notice;

  if (!notice) return null;

  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/12 text-warning">
          <Info className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">{notice.title}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{notice.body}</p>
        </div>
      </CardContent>
    </Card>
  );
}
