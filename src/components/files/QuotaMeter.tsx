"use client";

import { HardDrive } from "lucide-react";
import { NativeSelect, Progress, Skeleton, useToast } from "@/components/ui";
import { useSetStorageTier, useStorage } from "@/hooks/useFiles";
import { formatBytes } from "@/lib/utils";

/**
 * How much of the account's allowance is in use, and the controls to change it.
 *
 * The plan is self-serve because there is no billing yet - see
 * stripe-integration.txt for where a payment check belongs.
 */
export function QuotaMeter() {
  const toast = useToast();
  const { data, isLoading } = useStorage();
  const setTier = useSetStorageTier();

  if (isLoading || !data) return <Skeleton className="h-24 rounded-xl" />;

  const percent = data.quotaBytes > 0 ? Math.round((data.usedBytes / data.quotaBytes) * 100) : 0;
  const tone = percent >= 90 ? "warning" : percent >= 100 ? "warning" : "primary";

  const change = (input: Parameters<typeof setTier.mutate>[0]) =>
    setTier.mutate(input, {
      onError: (error) => toast.error("Could not change your plan", { description: (error as Error).message }),
    });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <HardDrive className="h-4 w-4 text-fg-subtle" />
          Storage
        </h2>
        <p className="text-xs tabular-nums text-fg-muted">
          {formatBytes(data.usedBytes)} of {formatBytes(data.quotaBytes)}
        </p>
      </div>

      <div className="mt-3">
        <Progress value={percent} tone={tone} showLabel />
      </div>

      <p className="mt-2 text-xs text-fg-subtle">
        {data.fileCount} file{data.fileCount === 1 ? "" : "s"} stored
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-fg">Plan</span>
          <NativeSelect
            value={data.tier}
            onChange={(event) => change({ tier: event.target.value as StorageTier })}
          >
            {data.tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label} — {formatBytes(tier.quotaBytes)}
              </option>
            ))}
          </NativeSelect>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-fg">Per-file limits</span>
          <NativeSelect
            value={data.perFileTier}
            onChange={(event) => change({ perFileTier: event.target.value as PerFileTier })}
          >
            <option value="base">Standard — 15 MB image, 100 MB video</option>
            <option value="plus">Extended — 25 MB image, 600 MB video</option>
          </NativeSelect>
        </label>
      </div>
    </div>
  );
}
