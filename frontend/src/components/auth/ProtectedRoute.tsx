import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../contexts/AuthContext";

interface ProtectedRouteProps {
  allowedRoles?: ("superadmin" | "reseller" | "subreseller")[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isAuthReady, user } = useAuth();

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-sm">
          Restoring your secure session...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
