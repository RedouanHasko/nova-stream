import { useEffect } from "react";
import { usePlaylist } from "../context/PlaylistContext";
import { getLang } from "../lib/i18n";

export default function ThemeManager() {
  const { settings } = usePlaylist();

  useEffect(() => {
    const root = document.documentElement;

    // Apply accent color
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    };

    const rgb = hexToRgb(settings.accentColor);
    root.style.setProperty("--primary-rgb", rgb);
    root.style.setProperty("--primary-color", `rgb(${rgb})`);
    root.style.setProperty("--primary-hover", `rgba(${rgb}, 0.9)`);

    // Set lang attribute for font rendering
    const lang = getLang(settings.language || "english");
    root.lang = lang;

    // Apply background image
    if (settings.backgroundImage) {
      document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('${settings.backgroundImage}')`;
    } else {
      document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/images/img1.png')`;
    }
  }, [settings.accentColor, settings.backgroundImage, settings.language]);

  return null;
}
