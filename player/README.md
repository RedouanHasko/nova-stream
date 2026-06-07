# Nova Stream Player (web + LG webOS / Tizen TV)

React/Vite IPTV client for **Xtream Codes** APIs (live, VOD, series). On **LG webOS** the app uses a **low-memory catalog mode**: categories load at startup, stream lists load **per category** so large providers do not OOM the TV browser (~200–300 MB practical heap on many models).

## Research summary (LG + industry practice)

These points come from [webOS TV Developer](https://webostv.developer.lge.com/) docs, community threads, and Smart TV engineering guides. They are what this codebase is built around.

| Topic | Recommendation | How Nova Player implements it |
|--------|----------------|--------------------------------|
| **Memory** | Avoid huge JSON + React state; monitor RSS on device ([Resource Monitor](https://webostv.developer.lge.com/develop/tools/resource-monitor-dev-guide)); declare realistic `requiredMemory` in `appinfo.json` | TV mode: categories only at boot; per-category streams; no full-catalog IDB replay; `evictGlobalStreamCatalogFromMemory`; sliding window (60 live rows); bounded VOD/series category cache |
| **Lists / DOM** | Virtualize or cap visible rows; lazy images; revoke unused buffers | `MAX_VISIBLE_ROWS = 60`, lazy channel icons, `preload="metadata"` on webOS live video |
| **Live HLS** | Prefer **native** `<video src="*.m3u8">` — hardware HLS pipeline; avoid hls.js/Shaka on TV for live | `LiveTV` + `CinemaPlayer`: `platform === 'webos'` → direct panel URL, no hls.js |
| **VOD MKV** | webOS Chromium can decode H.264/H.265 + AAC/AC3/EAC3 in MKV via hardware when codec is supported | Native `<video src>` on webOS; no ffmpeg `stream-ts` on TV |
| **VOD HLS** | Same native path; optional `mediaOption` for adaptive/DRM ([mediaOption guide](https://webostv.developer.lge.com/develop/guides/mediaoption-parameter)) | Native `<video>` for `.m3u8` on webOS |
| **Browser dev** | Use local proxy + HLS remux (no TV hardware) | `npm run dev` → `/api/proxy`, `/api/hls/start`, hls.js for MKV in browser only |
| **Subtitles** | Native WebVTT in HLS; in-band MKV `textTracks`; avoid long ffmpeg extract on TV | `webosReadNativeTracks`, `trySwitchPlatformSubtitleTrack`, simulator skips heavy extract |
| **D-pad / remote** | Focus rings, spatial navigation, Back/Enter/Color keys | `data-tv-focusable`, `src/lib/remote.ts`, `tv-remote-key` events in Live/Movies/Series/Cinema |
| **Audio tracks** | `video.audioTracks` + Luna `selectTrack` best-effort | `platformPlayer.ts`, CinemaPlayer + Live mini-player |

**Limits to know:** Pure M3U playlists are not parsed yet (Xtream only). Simulator does not perfectly match every TV SoC decoder. HLS version support varies by webOS generation (v3–v7).

## webOS behavior (`data-tv="true"`)

Set in `index.html` when `PalmSystem`, `webOS`, webOS UA, or Tizen is detected (includes **webOS TV Simulator**).

1. **Startup**: Prefetch **categories only** (live / movies / series). Full stream arrays are **not** loaded into React state or replayed from IndexedDB.
2. **Lists**: Live / Movies / Series open **one category at a time**. The **All** sidebar entry is hidden on TV to avoid full-catalog fetches.
3. **Background refresh**: **Category metadata only** (not six full-catalog API calls).
4. **Sidebar counts**: Light per-category API calls → counts in `localStorage` only.
5. **Playback**: Native `<video>` for webOS HLS/MKV; panel URLs are **not** proxied on webOS (`wrapPlaybackUrlsForPlatform`).
6. **Browser dev (`npm run dev`)**: MKV uses HLS remux + hls.js; subtitles via embedded HLS tracks when possible; CORS via `localhost:4000/api/proxy`.

## M3U playlists

The setup UI accepts M3U URLs, but **catalog lists require Xtream** (`player_api.php`). Pure M3U has no parser yet.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Dependencies |
| `npm run dev` | Dev server + API (`http://localhost:4000`) — **not** a full TV test |
| `npm run build` | Production `dist/` |
| `npm run simulator:run` | Build + launch in **webOS TV 24 Simulator** (see below) |
| `npm run package:webos` | Build + IPK |
| `npm run deploy:webos` | Package, install, launch on paired TV (`TV17` in script) |

## Test on laptop: webOS TV Simulator (before real TV)

### 1. Install tools (one-time)

1. **webOS TV CLI** — [CLI installation](https://webostv.developer.lge.com/develop/tools/webos-tv-cli-installation). Verify: `ares -V`
2. **webOS TV 24 Simulator** — [Simulator installation](https://webostv.developer.lge.com/develop/tools/simulator-installation). Default path in this project:
   `C:\TV\Simulator\webOS_TV_24_Simulator_1.4.1`
3. If your simulator lives elsewhere, edit `simulator:open` in `package.json` (`-sp "..."`).

### 2. Build and launch

```powershell
cd C:\Users\red-h\Downloads\iptvpanel\player
npm install
npm run simulator:run
```

This runs `vite build` then:

```text
ares-launch -s 24 -sp "C:\TV\Simulator\webOS_TV_24_Simulator_1.4.1" "...\player\dist"
```

The simulator opens with **Web Inspector** attached (Chrome DevTools). Use it for console errors, memory timeline, and network.

### 3. Category sidebar + live playback tips

- **Categories**: Press **Left** from the channel/movie grid, or click the category rail, then **Up/Down** to move. The rail shows **Active** when it owns focus.
- **Live play**: If `.m3u8` fails in the simulator (`MediaError code 4`), the app auto-tries **`.ts`** then **`.mp4`**. On a real TV, **`.m3u8`** is usually first.
- **Posters**: On TV/simulator, images load as **absolute panel URLs** (`resolvePanelImageUrl` — fixes relative `/images/...` paths from Xtream).

### 4. What to verify in the simulator

| Check | Expected |
|-------|----------|
| TV mode | In console: `document.documentElement.dataset.tv === "true"` |
| Memory mode | Open Live → only one category loads; no **All** in sidebar |
| Navigation | Arrow keys move focus; Enter selects; Back returns |
| Live play | `.m3u8` plays in native `<video>` (Network shows direct panel URL, not `/api/stream-ts`) |
| Movie play | HLS/MKV uses native video on webOS path |
| Audio / subtitles | Player menus list tracks; switching updates playback (MKV/HLS in-band) |
| No desktop-only pipe | Console should **not** show endless `stream-ts` / ffmpeg loops on TV paths |

### 5. Simulator vs browser vs real TV

| Environment | Memory rules | Decoders | Good for |
|-------------|--------------|----------|----------|
| `npm run dev` + Chrome | Off (full catalog possible) | hls.js + server remux | UI/API debugging only |
| webOS Simulator | **On** (`data-tv`) | Closer to TV; still not identical SoC | D-pad, catalog OOM, native video |
| LG TV + Resource Monitor | **On** | Real hardware HLS/MKV | Final certification |

**Force TV mode in desktop Chrome (limited):**

```js
document.documentElement.setAttribute('data-tv', 'true');
location.reload();
```

This enables category-only lists but **does not** enable webOS hardware decoders.

### 6. Deploy to physical TV (after simulator)

1. Enable **Developer Mode** on the TV and add the device: `ares-setup-device` (name e.g. `TV17` to match `deploy:webos`).
2. `npm run deploy:webos` — packages `dist`, installs IPK, launches `com.novaplayer.app`.
3. On TV, open **Resource Monitor** (dev mode) while browsing Live → Movies → Series → full-screen player. Watch memory stay stable when switching categories.

## Packaging

`public/appinfo.json`: `requiredMemory: 256`, permissions `internet` + `media.operation`. Package with `npm run package:webos` / `ares-package dist`.

## TV list UI (`tv-channel-row`)

On webOS (`data-tv="true"`), **Live**, **Movies**, and **Series** share one list style:

- **`tv-channel-row`** / **`--focus`** / **`--selected`** — 82px rows, cyan focus ring, red gradient when selected
- **`tv-live-column`** — dark column background (`bg-black/20`) for sidebar + main list
- **Navbar** — `tv-nav-tab` uses the same focus/selection language as channel rows
- **Movies/Series on TV** — poster grid becomes a vertical channel-style list (`MovieCard` TV mode)

## Key source files

- `index.html` — `data-tv` detection, webOSTV.js loader
- `src/lib/isWebOsTv.ts` — TV catalog/memory flag
- `src/lib/streamPlaybackUrl.ts` — proxy only on non-webOS
- `src/lib/platformPlayer.ts` — native audio/subtitle + Luna helpers
- `src/context/PlaylistContext.tsx` — TV bootstrap and per-category fetch
- `src/views/LiveTV.tsx`, `Movies.tsx`, `Series.tsx`, `CinemaPlayer.tsx`
