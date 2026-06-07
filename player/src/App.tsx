/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { PlaylistProvider, usePlaylist } from "./context/PlaylistContext";
import { FloatingPlayerProvider } from "./context/FloatingPlayerContext";
import FloatingPlayer from "./components/FloatingPlayer";
import Home from "./views/Home";

import { lazy, Suspense, useEffect, useRef } from "react";
import { injectAnimationPreferences } from "./lib/animationControl";

// Inject animation preferences for low-power TVs on startup
injectAnimationPreferences();

// Lazy-load heavy views so the initial bundle stays small on TV hardware
const Settings = lazy(() => import("./views/Settings"));
const LiveTV = lazy(() => import("./views/LiveTV"));
const Movies = lazy(() => import("./views/Movies"));
const Series = lazy(() => import("./views/Series"));
const CinemaPlayer = lazy(() => import("./views/CinemaPlayer"));
const Radio = lazy(() => import("./views/Radio"));
const PlaylistSetup = lazy(() => import("./views/PlaylistSetup"));
const Account = lazy(() => import("./views/Account"));
const Activation = lazy(() => import("./views/Activation"));

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
      <Route path="/player" element={<CinemaPlayer />} />
      <Route path="/watch" element={<CinemaPlayer />} />
      <Route path="/playlist-setup" element={<PlaylistSetup />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  );
}

export default function App() {
  const routeFallback = (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <FloatingPlayerProvider>
      <PlaylistProvider>
        <Router>
          <div style={{ minHeight: "100vh" }}>
          <Toaster position="top-center" richColors theme="dark" />
          <Suspense fallback={routeFallback}>
            <GuardedRoutes />
          </Suspense>
          <FloatingPlayer />
          </div>
        </Router>
      </PlaylistProvider>
    </FloatingPlayerProvider>
  );
}
