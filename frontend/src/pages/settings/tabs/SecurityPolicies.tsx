import { Shield, Lock, UserCheck, AlertTriangle } from "lucide-react";

export function SecurityPolicies() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">System Security Policies</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configure global security rules and access controls.</p>
        </div>
        <div className="px-6 py-6 space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Password Requirements
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Minimum Length</p>
                  <p className="text-xs text-muted-foreground">Enforce at least 8 characters.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Special Characters</p>
                  <p className="text-xs text-muted-foreground">Require symbols and numbers.</p>
                </div>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Access Control
            </h3>
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Mandatory 2FA for Admins</p>
                  <p className="text-xs text-muted-foreground">Require two-factor authentication for all super admins.</p>
                </div>
              </div>
              <input type="checkbox" className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Session Timeout</p>
                  <p className="text-xs text-muted-foreground">Auto-logout after 30 minutes of inactivity.</p>
                </div>
              </div>
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20" />
            </div>
          </div>
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button type="button" className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors">
            Update Policies
          </button>
        </div>
      </div>
    </div>
  );
}
