import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SidebarProvider } from "../../contexts/SidebarContext";
import { useI18n } from "../../contexts/I18nContext";

export function DashboardLayout() {
  const { t } = useI18n();

  return (
    <SidebarProvider>
      <div className="relative flex h-screen overflow-hidden bg-background transition-colors duration-300">
        <Sidebar />
        <div className="flex w-full flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-6 sm:pb-10">
            <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6">
              <div className="flex-1">
                <Outlet />
              </div>

              <footer className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-center text-xs text-muted-foreground shadow-sm backdrop-blur-sm sm:px-5 sm:py-4">
                {t(
                  "Welcome to NOVA Panel — manage your workspace with ease. If you face any issue, please report it through the support link we will provide here soon.",
                )}
              </footer>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
