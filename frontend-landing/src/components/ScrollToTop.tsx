import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronUp } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const scrollToHash = () => {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    window.requestAnimationFrame(scrollToHash);
  }, [location.hash, location.pathname]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: 20 }}
          onClick={scrollToTop}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-600/40 hover:bg-red-700 hover:scale-110 transition-all group"
          aria-label="Scroll to top"
        >
          <ChevronUp
            size={24}
            className="group-hover:-translate-y-1 transition-transform"
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
