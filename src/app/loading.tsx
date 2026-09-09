import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <Spinner className="h-7 w-7" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
