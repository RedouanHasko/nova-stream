import React, { createContext, useContext, useRef, useState } from "react";

export interface FloatingStream {
  url: string;
  title: string;
  poster?: string;
  extension?: string;
  /** Series / movie state so the full player can be restored */
  playerState?: Record<string, any>;
}

interface FloatingPlayerContextValue {
  floatingStream: FloatingStream | null;
  openMiniPlayer: (stream: FloatingStream, startSec?: number) => void;
  closeMiniPlayer: () => void;
  /** The player writes current time here so FloatingPlayer can resume */
  miniCurrentTimeRef: React.MutableRefObject<number>;
}

const FloatingPlayerContext = createContext<FloatingPlayerContextValue | null>(
  null,
);

export function FloatingPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [floatingStream, setFloatingStream] =
    useState<FloatingStream | null>(null);
  const miniCurrentTimeRef = useRef<number>(0);

  const openMiniPlayer = (stream: FloatingStream, startSec = 0) => {
    miniCurrentTimeRef.current = startSec;
    setFloatingStream(stream);
  };

  const closeMiniPlayer = () => {
    miniCurrentTimeRef.current = 0;
    setFloatingStream(null);
  };

  return (
    <FloatingPlayerContext.Provider
      value={{ floatingStream, openMiniPlayer, closeMiniPlayer, miniCurrentTimeRef }}
    >
      {children}
    </FloatingPlayerContext.Provider>
  );
}

export function useFloatingPlayer() {
  const ctx = useContext(FloatingPlayerContext);
  if (!ctx)
    throw new Error(
      "useFloatingPlayer must be used inside FloatingPlayerProvider",
    );
  return ctx;
}
