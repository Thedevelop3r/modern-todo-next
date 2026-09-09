import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Compass className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Nothing lives here</h1>
        <p className="mt-2 text-sm text-fg-muted">
          The page you asked for does not exist, or the todo behind it has been deleted.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg shadow-sm transition-[filter] hover:brightness-110"
        >
          <Home className="h-4 w-4" />
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
