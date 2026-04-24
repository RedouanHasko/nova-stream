/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

const Login = lazy(() =>
  import("./pages/auth/Login").then((module) => ({ default: module.Login })),
);
const DashboardLayout = lazy(() =>
  import("./components/layout/DashboardLayout").then((module) => ({
    default: module.DashboardLayout,
  })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })),
);
const DeviceManagement = lazy(() =>
  import("./pages/devices/DeviceManagement").then((module) => ({
    default: module.DeviceManagement,
  })),
);
const ResellerHub = lazy(() =>
  import("./pages/resellers/ResellerHub").then((module) => ({
    default: module.ResellerHub,
  })),
);
const PlaylistManagement = lazy(() =>
  import("./pages/playlists/PlaylistManagement").then((module) => ({
    default: module.PlaylistManagement,
  })),
);
const Financials = lazy(() =>
  import("./pages/credits/Financials").then((module) => ({
    default: module.Financials,
  })),
);
const PurchasePlans = lazy(() => import("./pages/credits/PurchasePlans"));
const NotificationsPage = lazy(
  () => import("./pages/notifications/NotificationsPage"),
);
const SystemSettings = lazy(() =>
  import("./pages/settings/SystemSettings").then((module) => ({
    default: module.SystemSettings,
  })),
);
const ApplicationsManagement = lazy(() =>
  import("./pages/settings/ApplicationsManagement").then((module) => ({
    default: module.ApplicationsManagement,
  })),
);
const AuditLogs = lazy(() =>
  import("./pages/settings/AuditLogs").then((module) => ({
    default: module.AuditLogs,
  })),
);
const LandingPage = lazy(() =>
  import("./pages/public/LandingPage").then((module) => ({
    default: module.LandingPage,
  })),
);
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function AppLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      Loading panel…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <Suspense fallback={<AppLoadingFallback />}>
              <Routes>
                <Route path="/activate" element={<LandingPage />} />
                <Route path="/plans" element={<LandingPage />} />
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<DashboardLayout />}>
                    <Route index element={<Dashboard />} />

                    <Route path="devices" element={<DeviceManagement />} />
                    <Route path="resellers" element={<ResellerHub />} />
                    <Route path="playlists" element={<PlaylistManagement />} />
                    <Route path="credits" element={<Financials />} />
                    <Route path="credits/plans" element={<PurchasePlans />} />
                    <Route
                      path="notifications"
                      element={<NotificationsPage />}
                    />
                    <Route path="settings" element={<SystemSettings />} />
                    <Route path="apps" element={<ApplicationsManagement />} />
                    <Route path="audit-logs" element={<AuditLogs />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
