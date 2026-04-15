import { Palette, Globe, Image as ImageIcon } from "lucide-react";

export function ResellerBranding() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">Reseller Branding</h2>
          <p className="mt-1 text-sm text-muted-foreground">Customize how your sub-resellers and clients see your brand.</p>
        </div>
        <div className="px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="brand-name" className="block text-sm font-medium leading-6 text-muted-foreground">Brand Name</label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Globe className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <input type="text" name="brand-name" id="brand-name" placeholder="My Premium IPTV" className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium leading-6 text-muted-foreground">Brand Logo</label>
              <div className="mt-2 flex items-center gap-x-3">
                <div className="h-12 w-12 rounded-xl bg-foreground/5 flex items-center justify-center border border-dashed border-border">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <button type="button" className="rounded-xl bg-foreground/5 px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-foreground/10 transition-colors">
                  Change
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="primary-color" className="block text-sm font-medium leading-6 text-muted-foreground">Primary Accent Color</label>
              <div className="mt-2 flex items-center gap-x-3">
                <div className="h-10 w-10 rounded-xl bg-foreground border border-border"></div>
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Palette className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <input type="text" name="primary-color" id="primary-color" defaultValue="#000000" className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button type="button" className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors">
            Save Branding
          </button>
        </div>
      </div>
    </div>
  );
}
