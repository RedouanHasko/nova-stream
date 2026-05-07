import { memo, useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import { Lock } from "lucide-react";

interface SidebarItemProps {
  label: string;
  count?: number;
  active?: boolean;
  tvHighlighted?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

const SidebarItem = memo(function SidebarItem({
  label,
  count,
  active,
  tvHighlighted,
  locked,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      data-tv-focusable
      tabIndex={0}
      className={cn(
        "tv-sidebar-item tv-channel-row group my-1 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-all duration-200",
        "border border-transparent hover:bg-white/6",
        active && "tv-channel-row--selected",
        tvHighlighted && !active && "tv-channel-row--focus",
      )}
    >
      <span
        className={cn(
          "text-base md:text-lg flex items-center gap-2 truncate",
          active ? "text-white font-semibold" : tvHighlighted ? "text-white/90" : "text-white/65",
        )}
      >
        {label}
        {locked && <Lock className="w-3 h-3 text-primary/70 shrink-0" />}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            active
              ? "bg-white/18 text-white"
              : "bg-white/10 text-white/70",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
});

interface SidebarProps {
  title?: string;
  items: { id: string; name: string; count?: number; locked?: boolean }[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  /** When true, the sidebar owns D-pad focus and navigates its own items */
  hasTVFocus?: boolean;
  /** Called when the user presses right — parent should move focus to the grid */
  onTVFocusRelease?: () => void;
  /** Called when the user presses up on the first item — parent should move focus to header */
  onTVFocusEscapeUp?: () => void;
}

export default function Sidebar({
  items,
  activeId,
  onSelect,
  className,
  hasTVFocus = false,
  onTVFocusRelease,
  onTVFocusEscapeUp,
}: SidebarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Index of the TV-cursor within the sidebar item list
  const [tvNavIndex, setTvNavIndex] = useState(0);

  // When TV focus arrives, snap the cursor to the currently active item
  useEffect(() => {
    if (hasTVFocus) {
      const idx = items.findIndex((it) => it.id === activeId);
      setTvNavIndex(idx >= 0 ? idx : 0);
    }
  }, [hasTVFocus, activeId, items]);

  // Scroll the highlighted item into view when index changes
  useEffect(() => {
    if (!hasTVFocus || !listRef.current) return;
    const btn = listRef.current.children[tvNavIndex] as HTMLElement | undefined;
    btn?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [tvNavIndex, hasTVFocus]);



  // TV remote handler — registered as child component so runs BEFORE the parent view's handler.
  // When hasTVFocus, we consume the relevant keys (stopImmediatePropagation) so the grid
  // does not also react to up/down/left/right/enter.
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e as any).detail) return;
      const key = (e as any).detail.key as string | undefined;
      if (!key) return;

      if (hasTVFocus) {
        // Consume all D-pad / select keys while sidebar owns focus
        if (["up", "down", "left", "right", "enter", "select"].includes(key)) {
          (e as CustomEvent).stopImmediatePropagation();
        }
        if (key === "up") {
          if (tvNavIndex <= 0) {
            onTVFocusEscapeUp?.();
            return;
          }
          setTvNavIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key === "down") {
          setTvNavIndex((i) => Math.min(items.length - 1, i + 1));
          return;
        }
        if (key === "enter" || key === "select") {
          const item = items[tvNavIndex];
          if (item) onSelect(item.id);
          return;
        }
        if (key === "left") {
          // sidebar never collapses
          return;
        }
        if (key === "right") {
          // Release TV focus back to the grid
          onTVFocusRelease?.();
          return;
        }
        return;
      }

      // No-op: sidebar does not respond to back/menu when not focused
    };

    window.addEventListener("tv-remote-key", handler as any);
    return () => {
      window.removeEventListener("tv-remote-key", handler as any);
    };
  }, [hasTVFocus, items, tvNavIndex, onSelect, onTVFocusRelease, onTVFocusEscapeUp]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "tv-category-rail flex flex-col bg-[linear-gradient(160deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] backdrop-blur-xl border-r border-white/10 h-full overflow-hidden",
        hasTVFocus && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_18px_36px_rgba(0,0,0,0.28)]",
        className,
      )}
      style={{ width: 332 }}
    >
      <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-white/8 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold tracking-[0.14em] uppercase text-white/55">
                Categories
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  hasTVFocus ? "bg-emerald-400/25 text-emerald-200" : "bg-white/10 text-white/55",
                )}
              >
                {hasTVFocus ? "Active" : "Ready"}
              </span>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto py-2 px-1">
            {items.map((item, idx) => (
              <SidebarItem
                key={item.id}
                label={item.name}
                count={item.count}
                locked={item.locked}
                active={activeId === item.id}
                tvHighlighted={hasTVFocus && idx === tvNavIndex}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </div>
        </div>
    </div>
  );
}
