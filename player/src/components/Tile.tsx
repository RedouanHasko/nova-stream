import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { forwardRef } from "react";

interface TileProps {
  icon: LucideIcon;
  label: string;
  subLabel?: string;
  onClick?: () => void;
  className?: string;
  large?: boolean;
  isLoading?: boolean;
  loadProgress?: number;
}

const Tile = forwardRef<HTMLButtonElement, TileProps>(function Tile({
  icon: Icon,
  label,
  subLabel,
  onClick,
  className,
  large,
  isLoading,
  loadProgress = 0,
}, ref) {
  const clampedProgress = Math.max(0, Math.min(100, loadProgress));
  const showLoadingState = isLoading || clampedProgress > 0;
  const showLoadingLabel = isLoading || (clampedProgress > 0 && clampedProgress < 100);

  return (
    <motion.button
      ref={ref as any}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      tabIndex={0}
      className={cn(
        "relative overflow-hidden flex flex-col items-center justify-center gap-2 rounded-xl transition-all duration-200",
        "border border-white/10 shadow-lg shadow-black/40 backdrop-blur-md",
        large ? "aspect-square w-full" : "aspect-video w-full",
        className,
      )}
      style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
    >
      <div className="absolute inset-0 bg-white/[0.03]" />
      <motion.div
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        initial={false}
        animate={{ height: `${clampedProgress}%`, opacity: showLoadingState ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
        style={{ backgroundColor: "rgba(var(--primary-rgb), 0.72)" }}
      >
        <motion.div
          className="absolute inset-x-0 top-0 h-px bg-white/30"
          animate={{ x: ["-10%", "10%", "-10%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      <div className="absolute inset-0 bg-black/10" />

      <Icon
        className={cn(
          "relative z-10 text-white drop-shadow-[0_4px_14px_rgba(0,0,0,0.35)]",
          large ? "w-16 h-16" : "w-8 h-8",
        )}
      />
      <div className="relative z-10 flex flex-col items-center">
        <span
          className={cn(
            "font-semibold tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
            large ? "text-2xl" : "text-lg",
          )}
        >
          {label}
        </span>
        {showLoadingLabel ? (
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
});

export default Tile;
