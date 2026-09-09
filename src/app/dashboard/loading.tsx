import { TodoCardSkeleton } from "@/components/ui";

/** Skeletons rather than a spinner: the shape of what is coming is the hint. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <TodoCardSkeleton key={index} />
      ))}
    </div>
  );
}
