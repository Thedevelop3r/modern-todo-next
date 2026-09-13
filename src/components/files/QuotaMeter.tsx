"use client";

import { HardDrive } from "lucide-react";
import { NativeSelect, Progress, Skeleton, useToast } from "@/components/ui";
import { useSetStorageTier, useStorage } from "@/hooks/useFiles";
import { formatBytes } from "@/lib/utils";

/**
 * The per-kind limits worth showing, in display order. PDFs are stored as the
 * `document` kind, so that is the cap an uploaded PDF is actually held to.
 */
const CAP_ROWS: Array<[FileKind, string]> = [
  ["image", "Images"],
  ["video", "Videos"],
  ["audio", "Audio"],
  ["document", "PDFs"],
];

const largestCap = (caps?: Partial<Record<FileKind, number>>) => Math.max(0, ...Object.values(caps || {}));

/**
 * How much of the account's allowance is in use, and the controls to change it.
 *
 * Every plan, per-file tier, label and size here comes from GET
 * /api/files/quota - server/config/storage.js is the only place tiers are
 * defined. Billing is not wired up, so changing the plan is only offered where
 * the server says it will accept the change.
 */
export function QuotaMeter() {
  const toast = useToast();
  const { data, isLoading } = useStorage();
  const setTier = useSetStorageTier();

  if (isLoading || !data) return <Skeleton className="h-24 rounded-xl" />;

  const percent = data.quotaBytes > 0 ? Math.round((data.usedBytes / data.quotaBytes) * 100) : 0;
  const tone = percent >= 90 ? "warning" : "primary";

  const tiers = data.tiers || [];
  const perFileTiers = data.perFileTiers || [];
  const plan = tiers.find((tier) => tier.id === data.tier);
  const perFile = perFileTiers.find((tier) => tier.id === data.perFileTier);

  const change = (input: Parameters<typeof setTier.mutate>[0], label: string) =>
    setTier.mutate(input, {
      onSuccess: () => toast.success(`Switched to ${label}`),
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

      {/* The plan is only changeable where the server says so - it is off until
          billing exists, so the current plan is shown as text instead of a
          control that would answer 403. */}
      {data.selfServeTiers ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-fg">Plan</span>
            <NativeSelect
              value={data.tier}
              disabled={setTier.isPending}
              onChange={(event) => {
                const next = tiers.find((tier) => tier.id === event.target.value);
                if (next) change({ tier: next.id }, `the ${next.label} plan`);
              }}
            >
              {/* A tier the server no longer offers is still what this account is
                  on, so it is shown - but cannot be chosen again. */}
              {!plan && (
                <option value={data.tier} disabled>
                  {data.tier} — {formatBytes(data.quotaBytes)}
                </option>
              )}
              {tiers.map((tier) => (
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
              disabled={setTier.isPending}
              onChange={(event) => {
                const next = perFileTiers.find((tier) => tier.id === event.target.value);
                if (next) change({ perFileTier: next.id }, `${next.label} file limits`);
              }}
            >
              {!perFile && (
                <option value={data.perFileTier} disabled>
                  {data.perFileTier}
                </option>
              )}
              {perFileTiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.label} — up to {formatBytes(largestCap(tier.caps))} per file
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
      ) : (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-fg">Plan</dt>
            <dd className="text-sm text-fg-muted">
              {plan?.label || data.tier} — {formatBytes(data.quotaBytes)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-fg">Per-file limits</dt>
            <dd className="text-sm text-fg-muted">
              {perFile?.label || data.perFileTier} — up to {formatBytes(largestCap(data.caps))} per file
            </dd>
          </div>
        </dl>
      )}

      {/* The caps this account is held to right now - `caps` is what the upload
          path enforces, so it is shown rather than the selected tier's table. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
        {CAP_ROWS.map(([kind, label]) => (
          <div key={kind} className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="text-xs tabular-nums text-fg-muted">up to {formatBytes(data.caps?.[kind] || 0)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
