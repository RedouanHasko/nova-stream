import { memo } from "react";
import { cn } from "../lib/utils";
import { motion } from "motion/react";
import { Lock } from "lucide-react";

interface SidebarItemProps {
  label: string;
  count?: number;
  active?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

const SidebarItem = memo(function SidebarItem({
  label,
  count,
  active,
  locked,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      tabIndex={0}
      className={cn(
        "flex items-center justify-between w-full px-4 py-3 text-left transition-all duration-200",
        "hover:bg-white/5 focus-visible:bg-white/10",
        active && "bg-white/10 border-l-4 border-primary",
      )}
    >
      <span
        className={cn(
          "text-lg flex items-center gap-2",
          active ? "text-white font-semibold" : "text-white/60",
        )}
      >
        {label}
        {locked && <Lock className="w-3 h-3 text-primary/70 shrink-0" />}
      </span>
      {count !== undefined && (
        <span className="text-sm text-white/40">{count}</span>
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
}

export default function Sidebar({
  items,
  activeId,
  onSelect,
  className,
}: SidebarProps) {
  return (
    <div
      className={cn(
        "flex flex-col bg-black/20 backdrop-blur-md border-r border-white/5 h-full overflow-y-auto",
        className,
      )}
    >
      <div className="flex flex-col py-4">
        {items.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.name}
            count={item.count}
            locked={item.locked}
            active={activeId === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
