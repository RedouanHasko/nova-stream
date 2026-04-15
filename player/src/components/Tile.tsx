import { motion } from "motion/react";
import { LucideIcon, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

interface TileProps {
  icon: LucideIcon;
  label: string;
  subLabel?: string;
  onClick?: () => void;
  className?: string;
  large?: boolean;
  isLoading?: boolean;
}

export default function Tile({
  icon: Icon,
  label,
  subLabel,
  onClick,
  className,
  large,
  isLoading,
}: TileProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl transition-all duration-200",
        "border border-white/10 shadow-lg shadow-black/40",
        large ? "aspect-square w-full" : "aspect-video w-full",
        className,
      )}
      style={{ backgroundColor: "rgba(var(--primary-rgb), 0.8)" }}
    >
      {isLoading ? (
        <Loader2
          className={cn(
            "text-white animate-spin",
            large ? "w-12 h-12" : "w-6 h-6",
          )}
        />
      ) : (
        <Icon className={cn("text-white", large ? "w-16 h-16" : "w-8 h-8")} />
      )}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "font-semibold tracking-wide",
            large ? "text-2xl" : "text-lg",
          )}
        >
          {label}
        </span>
        {isLoading ? (
          <span className="text-[10px] opacity-60 font-medium uppercase tracking-widest">
            Loading...
          </span>
        ) : subLabel ? (
          <span className="text-[10px] opacity-60 font-medium uppercase tracking-widest">
            {subLabel}
          </span>
        ) : null}
      </div>
    </motion.button>
  );
}
