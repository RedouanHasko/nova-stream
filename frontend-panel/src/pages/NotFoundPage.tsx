import { Link, useLocation } from "react-router";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          404 Error
        </p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Page Not Found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The route <span className="font-mono text-foreground">{location.pathname}</span> does not exist or is unavailable.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
