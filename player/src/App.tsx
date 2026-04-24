/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { PlaylistProvider, usePlaylist } from "./context/PlaylistContext";
import { FloatingPlayerProvider } from "./context/FloatingPlayerContext";
import FloatingPlayer from "./components/FloatingPlayer";
import Home from "./views/Home";

import { lazy, Suspense, useEffect, useRef } from "react";

// Lazy-load heavy views so the initial bundle stays small on TV hardware
const Settings = lazy(() => import("./views/Settings"));
const LiveTV = lazy(() => import("./views/LiveTV"));
const Movies = lazy(() => import("./views/Movies"));
const Series = lazy(() => import("./views/Series"));
const VideoPlayer = lazy(() => import("./views/VideoPlayer"));
const CinemaPlayer = lazy(() => import("./views/CinemaPlayer"));
const Radio = lazy(() => import("./views/Radio"));
const PlaylistSetup = lazy(() => import("./views/PlaylistSetup"));
const Account = lazy(() => import("./views/Account"));
const Activation = lazy(() => import("./views/Activation"));

// TV remote key mapping — covers WebOS, Tizen, Android TV, Fire TV, and generic HbbTV
const TV_KEY_MAP: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Backspace: "back",
  Escape: "back",
  // LG WebOS back button
  "461": "back",
  XF86Back: "back",
  // WebOS/Samsung color keys
  F1: "red",
  F2: "green",
  F3: "yellow",
  F4: "blue",
  // Samsung Tizen / generic TV color keyCodes
  "403": "red",
  "404": "green",
  "405": "yellow",
  "406": "blue",
  // Media keys (common on TV remotes)
  MediaPlayPause: "playpause",
  MediaStop: "stop",
  MediaRewind: "rewind",
  MediaFastForward: "fastforward",
  // Samsung Tizen keyCodes for media
  "415": "play",
  "19": "pause",
  "413": "stop",
  "412": "rewind",
  "417": "fastforward",
  // Channel up/down (some remotes)
  ChannelUp: "channelup",
  ChannelDown: "channeldown",
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function GuardedRoutes() {
  const {
    activationStatus,
    isActivationLoading,
    activePlaylist,
    fetchLive,
    fetchVod,
    fetchSeries,
  } = usePlaylist();
  const startupWarmRef = useRef<string | null>(null);

  useEffect(() => {
    if (isActivationLoading || !activationStatus.activated) return;
    if (!activePlaylist || activePlaylist.type !== "xtream") return;
    if (startupWarmRef.current === activePlaylist.id) return;

    startupWarmRef.current = activePlaylist.id;
    // Start all catalog fetches immediately in background without blocking routes.
    void Promise.allSettled([fetchLive(), fetchVod(), fetchSeries()]);
  }, [
    activationStatus.activated,
    activePlaylist,
    fetchLive,
    fetchSeries,
    fetchVod,
    isActivationLoading,
  ]);

  if (isActivationLoading && !activationStatus.ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!activationStatus.activated) {
    return <Activation />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/live" element={<LiveTV />} />
      <Route path="/movies" element={<Movies />} />
      <Route path="/series" element={<Series />} />
      <Route path="/radio" element={<Radio />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/player" element={<VideoPlayer />} />
      <Route path="/watch" element={<CinemaPlayer />} />
      <Route path="/playlist-setup" element={<PlaylistSetup />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}

export default function App() {
  // Broadcast TV remote events to window
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        return;
      }

      let key =
        TV_KEY_MAP[e.key] ||
        TV_KEY_MAP[e.code] ||
        TV_KEY_MAP[String(e.keyCode)];
      if (!key) return;
      const event = new CustomEvent("tv-remote-key", {
        detail: { key, original: e },
      });
      window.dispatchEvent(event);
      // Prevent default for navigation keys to stop page scrolling / browser back
      if (
        [
          "up", "down", "left", "right", "enter", "back",
          "red", "green", "yellow", "blue",
          "playpause", "stop", "rewind", "fastforward",
          "channelup", "channeldown",
        ].includes(key)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const routeFallback = (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <FloatingPlayerProvider>
      <PlaylistProvider>
        <Router>
          <Toaster position="top-center" richColors theme="dark" />
          <Suspense fallback={routeFallback}>
            <GuardedRoutes />
          </Suspense>
          <FloatingPlayer />
        </Router>
      </PlaylistProvider>
    </FloatingPlayerProvider>
  );
}
