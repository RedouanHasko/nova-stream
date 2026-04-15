import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { MoreVertical, Send, Edit2, Trash2 } from "lucide-react";
import { useI18n } from "../../contexts/I18nContext";

interface ActionMenuProps {
  onTransfer: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ActionMenu({ onTransfer, onEdit, onDelete }: ActionMenuProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedMenu = menuRef.current?.contains(target);
      const clickedTrigger = triggerRef.current?.contains(target);

      if (!clickedMenu && !clickedTrigger) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 148;
    const viewportPadding = 12;
    const shouldOpenUpward =
      window.innerHeight - rect.bottom < menuHeight + viewportPadding &&
      rect.top > menuHeight;

    const top = shouldOpenUpward
      ? Math.max(viewportPadding, rect.top - menuHeight - 8)
      : Math.min(
          window.innerHeight - menuHeight - viewportPadding,
          rect.bottom + 8,
        );

    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, rect.right - menuWidth),
    );

    setOpenUpward(shouldOpenUpward);
    setMenuPosition({ top, left });
  };

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <motion.button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!isOpen) {
            updateMenuPosition();
          }
          setIsOpen((current) => !current);
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        className={`rounded-lg p-2 transition-colors duration-200 ${
          isOpen
            ? "bg-foreground/5 text-foreground"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        }`}
      >
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0, scale: isOpen ? 1.08 : 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          <MoreVertical className="h-5 w-5" />
        </motion.div>
      </motion.button>
      {typeof document !== "undefined"
        ? createPortal(
            <>
              <motion.div
                initial={false}
                animate={{ opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={`fixed inset-0 z-40 ${
                  isOpen ? "pointer-events-auto" : "pointer-events-none"
                }`}
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                ref={menuRef}
                initial={false}
                animate={{
                  opacity: isOpen ? 1 : 0,
                  scale: isOpen ? 1 : 0.9,
                  y: isOpen ? 0 : openUpward ? 6 : -6,
                }}
                transition={{
                  type: "spring",
                  stiffness: 360,
                  damping: 28,
                  mass: 0.8,
                }}
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  pointerEvents: isOpen ? "auto" : "none",
                }}
                className={`fixed z-50 w-40 rounded-xl border border-border bg-card py-1 shadow-lg will-change-transform ${
                  openUpward ? "origin-bottom-right" : "origin-top-right"
                }`}
              >
                <button
                  onClick={() => {
                    onTransfer();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-foreground/5"
                >
                  <Send className="h-4 w-4" /> {t("Transfer Credits")}
                </button>
                <button
                  onClick={() => {
                    onEdit();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-foreground/5"
                >
                  <Edit2 className="h-4 w-4" /> {t("Edit")}
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-4 w-4" /> {t("Delete")}
                </button>
              </motion.div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
