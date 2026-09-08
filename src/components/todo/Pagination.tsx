"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Windowed pager: always shows the first three, the last three, and a band
 * around the current page, with ellipses between. (Logic carried over from the
 * original Pagination component, restyled.)
 */
function pageWindow(totalPages: number, currentPage: number) {
  if (totalPages <= 9) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set<number>([1, 2, 3, totalPages - 2, totalPages - 1, totalPages]);
  for (let offset = -2; offset <= 2; offset++) {
    const page = currentPage + offset;
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  });
  return withGaps;
}

export function Pagination({
  currentPage,
  totalPages,
  totalRecords,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(totalPages, currentPage);

  const buttonClass = (active: boolean) =>
    cn(
      "flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-fg shadow-sm"
        : "text-fg-muted hover:bg-surface-sunken hover:text-fg disabled:pointer-events-none disabled:opacity-40"
    );

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-2" aria-label="Pagination">
      {totalRecords !== undefined && (
        <p className="text-sm text-fg-muted">
          Page <span className="font-medium text-fg">{currentPage}</span> of {totalPages}
          <span className="text-fg-subtle"> · {totalRecords} total</span>
        </p>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className={buttonClass(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((page, index) =>
          page === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-fg-subtle">
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={buttonClass(page === currentPage)}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className={buttonClass(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
