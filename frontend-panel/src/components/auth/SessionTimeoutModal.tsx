import { AlertTriangle, Clock3 } from "lucide-react";

interface SessionTimeoutModalProps {
  isOpen: boolean;
  countdown: number;
  idleMinutes: number;
  onStaySignedIn: () => void;
  onLogoutNow: () => void;
}

export function SessionTimeoutModal({
  isOpen,
  countdown,
  idleMinutes,
  onStaySignedIn,
  onLogoutNow,
}: SessionTimeoutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
        className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-full bg-amber-500/10 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="space-y-1">
            <h2
              id="session-timeout-title"
              className="text-lg font-semibold text-foreground"
            >
              Session timeout warning
            </h2>
            <p
              id="session-timeout-description"
              className="text-sm text-muted-foreground"
            >
              For security, inactive sessions are closed after {idleMinutes}{" "}
              minutes.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background/70 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock3 className="h-4 w-4 text-amber-500" />
            Automatic logout in <span className="font-bold">{countdown}s</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Click <strong>Stay signed in</strong> if you are still using the
            panel.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onLogoutNow}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Log out now
          </button>
          <button
            onClick={onStaySignedIn}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
