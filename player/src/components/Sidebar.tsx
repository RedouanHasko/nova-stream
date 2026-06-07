import { memo, useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import { Lock } from "lucide-react";
import { useT } from "../lib/i18n";

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
  const t = useT();
  return (
    <button
      onClick={onClick}
      data-tv-focusable
      tabIndex={0}
      className={cn(
        "tv-channel-row flex items-center gap-3 w-full h-[82px] px-4 text-left transition-all my-1",
        "hover:bg-white/6",
        active && "tv-channel-row--selected",
        tvHighlighted && !active && "tv-channel-row--focus",
      )}
    >
      <div className="w-10 text-xs text-white/40 font-semibold tabular-nums shrink-0">
        {count !== undefined ? count : "—"}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "flex items-center gap-2 text-lg font-medium truncate",
            active ? "text-white" : "text-white/80",
          )}
        >
          {label}
          {locked && <Lock className="w-3.5 h-3.5 text-primary/70 shrink-0" />}
        </span>
        <span className="block text-[11px] text-white/35 uppercase tracking-wide">
          {t.category}
        </span>
      </div>
      {active && (
        <div className="flex items-center gap-1 px-2 py-1 bg-primary/20 rounded text-[10px] text-primary font-bold uppercase shrink-0">
          {t.active}
        </div>
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
  /** Called when focus enters the category rail (remote or pointer) */
  onTVFocusAcquire?: () => void;
}

export default function Sidebar({
  items,
  activeId,
  onSelect,
  className,
  hasTVFocus = false,
  onTVFocusRelease,
  onTVFocusEscapeUp,
  onTVFocusAcquire,
}: SidebarProps) {
  const t = useT();
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

  const focusItemAt = (index: number) => {
    if (!listRef.current) return;
    const safe = Math.max(0, Math.min(index, items.length - 1));
    const btn = listRef.current.children[safe] as HTMLElement | undefined;
    btn?.focus({ preventScroll: true });
    if (btn) {
      const targetTop =
        btn.offsetTop - listRef.current.clientHeight / 2 + btn.offsetHeight / 2;
      listRef.current.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }
  };

  // Keep DOM focus on the highlighted category row while the rail owns the remote.
  useEffect(() => {
    if (!hasTVFocus) return;
    focusItemAt(tvNavIndex);
  }, [hasTVFocus, tvNavIndex, items.length]);

  const focusIsInSidebar = () => {
    const active = document.activeElement as Node | null;
    return !!(containerRef.current && active && containerRef.current.contains(active));
  };

  // TV remote — capture phase so category up/down runs before page-level handlers.
  useEffect(() => {
    const handler = (e: Event) => {
      if (!(e as any).detail) return;
      const key = (e as any).detail.key as string | undefined;
      if (!key) return;

      const sidebarActive = hasTVFocus || focusIsInSidebar();

      if (sidebarActive) {
        // Consume all D-pad / select keys while sidebar owns focus
        if (["up", "down", "left", "right", "enter", "select"].includes(key)) {
          (e as CustomEvent).stopImmediatePropagation();
        }
        if (key === "up") {
          if (tvNavIndex <= 0) {
            onTVFocusEscapeUp?.();
            return;
          }
          const next = Math.max(0, tvNavIndex - 1);
          setTvNavIndex(next);
          focusItemAt(next);
          return;
        }
        if (key === "down") {
          const next = Math.min(items.length - 1, tvNavIndex + 1);
          setTvNavIndex(next);
          focusItemAt(next);
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

    window.addEventListener("tv-remote-key", handler as any, true);
    return () => {
      window.removeEventListener("tv-remote-key", handler as any, true);
    };
  }, [hasTVFocus, items, tvNavIndex, onSelect, onTVFocusRelease, onTVFocusEscapeUp]);

  // Sync TV nav index when user clicks or tabs into a category row.
  useEffect(() => {
    if (!hasTVFocus && focusIsInSidebar()) {
      onTVFocusAcquire?.();
    }
  }, [hasTVFocus, activeId, items, onTVFocusAcquire]);

  return (
    <div
      ref={containerRef}
      onFocusCapture={() => onTVFocusAcquire?.()}
      onMouseDownCapture={() => onTVFocusAcquire?.()}
      className={cn(
        "tv-live-column flex flex-col border-r border-white/5 h-full overflow-hidden bg-black/20",
        className,
      )}
      style={{ width: 332 }}
    >
      <div className="flex flex-col h-full">
          <div className="px-6 py-5 border-b border-white/5 bg-linear-to-b from-white/[0.02] to-transparent">
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">
              {t.categories}
            </h2>
            <span
              className={cn(
                "mt-1 inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                hasTVFocus ? "bg-emerald-500/10 text-emerald-500" : "text-white/30",
              )}
            >
              {hasTVFocus ? t.choosingCategory : t.ready}
            </span>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hide py-2 px-5">
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
