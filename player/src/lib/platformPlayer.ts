// Platform-specific player helpers for smart TVs (Tizen, webOS)
type PlatformName = 'tizen' | 'webos' | 'web' | 'unknown';

const detectPlatform = (): PlatformName => {
  if (typeof window === 'undefined') return 'unknown';
  const w = window as any;
  try {
    if (w?.webapis && typeof w.webapis.avplay === 'object') return 'tizen';
    if (typeof w.webOS !== 'undefined' || typeof w.PalmSystem !== 'undefined') return 'webos';
    if (/Tizen/i.test(navigator.userAgent)) return 'tizen';
    if (/webOS|Web0S|webos/i.test(navigator.userAgent)) return 'webos';
    return 'web';
  } catch {
    return 'unknown';
  }
};

export const getPlatformName = (): PlatformName => detectPlatform();

export const platformSupportsEngine = (): boolean => {
  const p = getPlatformName();
  return p === 'tizen' || p === 'webos';
};

type PlatformPlayerHandle = {
  stop: () => void;
  setSelectAudio?: (index: number) => void;
  setSelectSubtitle?: (index: number) => void;
  getTracks?: () => any[];
};

// Start playback using platform engine (AVPlay on Tizen). Returns a handle
// that can be used to stop playback or select tracks. Best-effort: may throw
// or return null if not supported.
export const startPlatformPlayback = (
  url: string,
  startTime = 0,
  onEvent?: (ev: { type: string; data?: any }) => void,
): PlatformPlayerHandle | null => {
  try {
    const p = getPlatformName();
    const w = window as any;
    if (p === 'tizen' && w?.webapis?.avplay) {
      const avplay = w.webapis.avplay;
      try {
        // Stop prior if any
        try { avplay.stop(); } catch {}
        try { avplay.close(); } catch {}
      } catch {}

      try {
        avplay.open(url);
      } catch (e) {
        try { avplay.close(); } catch {}
        throw e;
      }

      // Set listeners if available
      try {
        avplay.setListener({
          onbufferingstart: () => onEvent && onEvent({ type: 'bufferingstart' }),
          onbufferingprogress: (percent: number) => onEvent && onEvent({ type: 'bufferingprogress', data: percent }),
          onbufferingcomplete: () => onEvent && onEvent({ type: 'bufferingcomplete' }),
          oncurrentplaytime: (ms: number) => onEvent && onEvent({ type: 'currentplaytime', data: ms }),
          onevent: (eventType: string, eventData: any) => onEvent && onEvent({ type: eventType, data: eventData }),
          onerror: (err: any) => onEvent && onEvent({ type: 'error', data: err }),
          ondrmevent: (drm: any) => onEvent && onEvent({ type: 'drm', data: drm }),
          onstreamcompleted: () => onEvent && onEvent({ type: 'ended' }),
        });
      } catch {}

      try {
        // prepareAsync may not be available; prefer prepare
        if (typeof avplay.prepare === 'function') avplay.prepare();
        else if (typeof avplay.prepareAsync === 'function') avplay.prepareAsync(() => {}, () => {});
      } catch {}

      try {
        if (startTime && typeof avplay.seekTo === 'function') {
          avplay.seekTo(Number(startTime) * 1000);
        }
        if (typeof avplay.play === 'function') avplay.play();
      } catch (e) {}

      const handle: PlatformPlayerHandle = {
        stop: () => {
          try { avplay.stop(); } catch {}
          try { avplay.close(); } catch {}
        },
        setSelectAudio: (index: number) => {
          try { avplay.setSelectTrack('AUDIO', Number(index)); } catch {}
        },
        setSelectSubtitle: (index: number) => {
          try { avplay.setSelectTrack('TEXT', Number(index)); } catch {}
        },
        getTracks: () => {
          try {
            const info = avplay.getTotalTrackInfo();
            return info || [];
          } catch { return []; }
        },
      };

      return handle;
    }

    // webOS: no reliable unified player wrapper implemented here — return null.
    return null;
  } catch {
    return null;
  }
};

// --- webOS Luna helpers (best-effort wrappers) ---
// Returns the Luna trackId string on success or null on failure.
export const webosRegisterTrack = async (streamType = 'default'): Promise<string | null> => {
  try {
    const w = window as any;
    if (!w?.webOS || !w.webOS.service) return null;
    return await new Promise((resolve) => {
      try {
        w.webOS.service.request('luna://com.webos.service.audio', {
          method: 'registerTrack',
          parameters: { streamType },
          onSuccess: (res: any) => {
            if (res && res.returnValue && res.trackId) resolve(res.trackId);
            else resolve(null);
          },
          onFailure: () => resolve(null),
        });
      } catch (e) { resolve(null); }
    });
  } catch { return null; }
};

export const webosUnregisterTrack = async (trackId: string): Promise<boolean> => {
  try {
    const w = window as any;
    if (!w?.webOS || !w.webOS.service) return false;
    return await new Promise((resolve) => {
      try {
        w.webOS.service.request('luna://com.webos.service.audio', {
          method: 'unregisterTrack',
          parameters: { trackId },
          onSuccess: (res: any) => resolve(Boolean(res && res.returnValue)),
          onFailure: () => resolve(false),
        });
      } catch (e) { resolve(false); }
    });
  } catch { return false; }
};

export const webosSetTrackVolume = async (trackId: string, volume: number): Promise<boolean> => {
  try {
    const w = window as any;
    if (!w?.webOS || !w.webOS.service) return false;
    return await new Promise((resolve) => {
      try {
        w.webOS.service.request('luna://com.webos.service.audio', {
          method: 'setTrackVolume',
          parameters: { trackId, volume },
          onSuccess: (res: any) => resolve(Boolean(res && res.returnValue)),
          onFailure: () => resolve(false),
        });
      } catch (e) { resolve(false); }
    });
  } catch { return false; }
};

// Try switching audio track using platform native APIs (synchronous where possible).
// Returns true if the platform-specific API handled the request, false otherwise.
export const trySwitchPlatformAudioTrack = (video: HTMLVideoElement | any, trackIndex: number): boolean => {
  try {
    const platform = getPlatformName();
    const w = window as any;
    if (platform === 'tizen' && w?.webapis?.avplay && typeof w.webapis.avplay.setSelectTrack === 'function') {
      try {
        w.webapis.avplay.setSelectTrack('AUDIO', Number(trackIndex));
        return true;
      } catch (e) {
        return false;
      }
    }
    // Try webOS Luna selectTrack where available
    if (platform === 'webos' && w?.webOS && typeof w.webOS.service === 'object') {
      try {
        // Best-effort: try several service endpoints (some devices differ)
        const tryEndpoints = [
          'luna://com.webos.media',
          'luna://com.webos.service.media',
          'luna://com.webos.service.player',
          'luna://com.webos.service.audio',
        ];
        for (const ep of tryEndpoints) {
          try {
            w.webOS.service.request(ep, {
              method: 'selectTrack',
              parameters: { type: 'audio', index: Number(trackIndex) },
              onSuccess: () => {},
              onFailure: () => {},
            });
            // Assume success (best-effort)
            return true;
          } catch (e) {
            // try next
          }
        }
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
};

// Try switching subtitle track using platform native APIs. TrackId < 0 means disable.
export const trySwitchPlatformSubtitleTrack = (video: HTMLVideoElement | any, trackIndex: number): boolean => {
  try {
    const platform = getPlatformName();
    const w = window as any;
    if (platform === 'tizen' && w?.webapis?.avplay && typeof w.webapis.avplay.setSelectTrack === 'function') {
      try {
        // For TEXT tracks, setSelectTrack('TEXT', index). Use -1 to disable if supported.
        w.webapis.avplay.setSelectTrack('TEXT', Number(trackIndex));
        return true;
      } catch (e) {
        return false;
      }
    }
    // Try webOS Luna selectTrack for subtitles
    if (platform === 'webos' && w?.webOS && typeof w.webOS.service === 'object') {
      try {
        const tryEndpoints = [
          'luna://com.webos.media',
          'luna://com.webos.service.media',
          'luna://com.webos.service.player',
        ];
        for (const ep of tryEndpoints) {
          try {
            w.webOS.service.request(ep, {
              method: 'selectTrack',
              parameters: { type: 'text', index: Number(trackIndex) },
              onSuccess: () => {},
              onFailure: () => {},
            });
            return true;
          } catch (e) {}
        }
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
};

// Try to enumerate tracks on webOS via Luna services (best-effort).
export const webosGetTracks = async (): Promise<any[]> => {
  try {
    const w = window as any;
    if (!w?.webOS || !w.webOS.service) return [];
    const endpoints = [
      { ep: 'luna://com.webos.media', method: 'getMediaTracks' },
      { ep: 'luna://com.webos.service.media', method: 'getMediaTracks' },
      { ep: 'luna://com.webos.service.player', method: 'getTracks' },
    ];
    for (const { ep, method } of endpoints) {
      try {
        // Wrap in promise
        // @ts-ignore
        const res = await new Promise((resolve) => {
          try {
            w.webOS.service.request(ep, {
              method,
              parameters: {},
              onSuccess: (r: any) => resolve(r),
              onFailure: () => resolve(null),
            });
          } catch (e) { resolve(null); }
        });
        if (res && (res.tracks || res.returnValue)) {
          // Normalize
          return res.tracks || res.items || res;
        }
      } catch {}
    }
    return [];
  } catch { return []; }
};

// Read native audio and text tracks exposed by the webOS Chromium HTML5 video element.
// webOS (2016+) supports MKV with H.264/H.265 + AAC/AC3/EAC3 natively via hardware decoder.
// The browser exposes audioTracks (AudioTrackList) and textTracks (TextTrackList) for in-band
// MKV tracks. Returns arrays suitable for populating the track picker UI.
export const webosReadNativeTracks = (videoEl: HTMLVideoElement): { audios: any[]; subtitles: any[] } => {
  const audios: any[] = [];
  const subtitles: any[] = [];
  try {
    const nativeAudio = (videoEl as any).audioTracks;
    if (nativeAudio && typeof nativeAudio.length === 'number') {
      for (let i = 0; i < nativeAudio.length; i++) {
        const t = nativeAudio[i];
        audios.push({ index: i, name: t.label || t.language || `Audio ${i + 1}`, lang: (t.language || '') });
      }
    }
  } catch {}
  try {
    const nativeSubs = videoEl.textTracks;
    if (nativeSubs && typeof nativeSubs.length === 'number') {
      for (let i = 0; i < nativeSubs.length; i++) {
        const t = nativeSubs[i];
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          subtitles.push({ index: i, name: t.label || t.language || `Subtitle ${i + 1}`, lang: (t.language || '') });
        }
      }
    }
  } catch {}
  return { audios, subtitles };
};

// Normalize platform track objects from AVPlay or webOS Luna into a consistent
// structure: { audios: Array<{index,name,lang,raw}>, subtitles: Array<{index,name,lang,raw}> }
export const normalizePlatformTracks = (tracks: any[]): { audios: any[]; subtitles: any[] } => {
  const audios: any[] = [];
  const subtitles: any[] = [];
  try {
    if (!Array.isArray(tracks)) return { audios, subtitles };
    for (const t of tracks) {
      try {
        const typ = String(t.type || t.trackType || t.kind || '').toLowerCase();
        const index = typeof t.index === 'number' ? t.index : (typeof t.track_num === 'number' ? t.track_num : (t.trackIndex ?? t.track_id ?? t.id ?? null));
        let extra: any = t.extra_info || t.extra || t.metadata || {};
        if (typeof extra === 'string') {
          try { extra = JSON.parse(extra || '{}'); } catch {}
        }
        const lang = extra?.language || extra?.track_lang || t.language || t.lang || t.languageCode || null;
        const name = extra?.title || extra?.language || t.name || t.label || (typ === 'audio' ? `Audio ${audios.length + 1}` : `Subtitle ${subtitles.length + 1}`);
        if (typ === 'audio') {
          audios.push({ index, name, lang, raw: t });
        } else if (typ === 'text' || typ === 'subtitle') {
          subtitles.push({ index, name, lang, raw: t });
        }
      } catch {}
    }
  } catch {}
  return { audios, subtitles };
};
