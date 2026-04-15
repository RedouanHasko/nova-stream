import { useState, useEffect } from "react";
import { Settings, Globe, Shield, Database, Loader2, CheckCircle } from "lucide-react";
import api from "../../../lib/api";

export function GlobalSettings() {
  const [appName, setAppName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (!mounted) return;
        const map = new Map((Array.isArray(settings) ? settings : []).map((s: any) => [s.key, s.value]));
        setAppName(map.get("app_name") || "");
        setSupportEmail(map.get("support_email") || "");
        setMaintenanceMode(map.get("maintenance_mode") === "true");
      } catch (e) {
        console.error("Failed to load settings", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await Promise.all([
        api.updateSetting("app_name", appName),
        api.updateSetting("support_email", supportEmail),
        api.updateSetting("maintenance_mode", String(maintenanceMode)),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">Global Application Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configure global parameters for the entire application.</p>
        </div>
        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="app-name" className="block text-sm font-medium leading-6 text-muted-foreground">Application Name</label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Globe className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  name="app-name"
                  id="app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Enter application name"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
            <div>
              <label htmlFor="support-email" className="block text-sm font-medium leading-6 text-muted-foreground">Support Email</label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Settings className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <input
                  type="email"
                  name="support-email"
                  id="support-email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="support@example.com"
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">System Maintenance</h3>
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground">Disable all access for non-admin users.</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20"
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Database Backup</p>
                  <p className="text-xs text-muted-foreground">Backup is managed by your database provider.</p>
                </div>
              </div>
              <button className="rounded-xl bg-foreground/5 px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors">
                Backup Now
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-500 font-medium">
              {error}
            </div>
          )}

          {saved && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-500 font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Settings saved successfully!
            </div>
          )}
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save Global Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
