/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { PlaylistProvider } from "./context/PlaylistContext";
import Home from "./views/Home";
import Settings from "./views/Settings";
import LiveTV from "./views/LiveTV";
import Movies from "./views/Movies";
import Series from "./views/Series";
import VideoPlayer from "./views/VideoPlayer";
import Radio from "./views/Radio";
import PlaylistSetup from "./views/PlaylistSetup";
import Account from "./views/Account";

import { useEffect, useRef } from "react";

// TV remote key mapping
const TV_KEY_MAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  // WebOS/Samsung color keys (keyCode fallback for older browsers)
  F1: "red", // Red
  F2: "green", // Green
  F3: "yellow", // Yellow
  F4: "blue", // Blue
  // Some TVs use color keyCode
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
};

export default function App() {
  // Broadcast TV remote events to window
  useEffect(() => {
    const onKeyDown = (e) => {
      let key =
        TV_KEY_MAP[e.key] || TV_KEY_MAP[e.code] || TV_KEY_MAP[e.keyCode];
      if (!key) return;
      const event = new CustomEvent("tv-remote-key", {
        detail: { key, original: e },
      });
      window.dispatchEvent(event);
      // Prevent default for navigation keys
      if (
        [
          "up",
          "down",
          "left",
          "right",
          "enter",
          "red",
          "green",
          "yellow",
          "blue",
        ].includes(key)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <PlaylistProvider>
      <Router>
        <Toaster position="top-center" richColors theme="dark" />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<LiveTV />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/series" element={<Series />} />
          <Route path="/radio" element={<Radio />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/player" element={<VideoPlayer />} />
          <Route path="/playlist-setup" element={<PlaylistSetup />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </Router>
    </PlaylistProvider>
  );
}
