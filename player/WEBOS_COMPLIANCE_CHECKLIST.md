# webOS TV Compliance Checklist

Audit date: 2026-06-05

This checklist captures the webOS TV requirements and project-specific audit notes for the `player` app. It is intentionally written as a working checklist so the next session can focus on fixes and integrations.

## Reference Sources

- LG webOS TV Developer: App templates and `appinfo.json` metadata
  - https://webostv.developer.lge.com/develop/getting-started/app-template
  - https://webostv.developer.lge.com/develop/tools/ide-configuring-json-file
- webOS OSE: `appinfo.json` field reference
  - https://www.webosose.org/docs/guides/development/configuration-files/appinfo-json/
- webOS TV Developer: app lifecycle and events
  - https://webostv.developer.lge.com/develop/guides/app-lifecycle-management
  - https://webostv.developer.lge.com/develop/references/webos-event
- webOS TV Developer: app resolution
  - https://webostv.developer.lge.com/develop/specifications/app-resolution
- webOS TV Developer: Resource Monitor, Beanviser, and debugging
  - https://webostv.developer.lge.com/develop/tools/resource-monitor-dev-guide
  - https://webostv.developer.lge.com/develop/tools/beanviser-introduction
  - https://webostv.developer.lge.com/develop/getting-started/app-debugging
- LG webOS TV community guidance on memory
  - https://forum.webostv.developer.lge.com/t/this-app-will-now-restart-to-free-up-memory/5605

## Official Requirements And Integration Points

### Package Metadata

- [x] A packaged web app must include `appinfo.json` at the package root.
- [x] Required metadata includes `id`, `version`, `vendor`, `type`, `main`, `title`, and `icon`.
- [x] `id` should be unique and reverse-domain style, for example `com.domain.app`.
- [x] `type` should be `web` for a packaged web app.
- [x] `main` must point to the launch HTML file relative to the package root.
- [x] `icon` and `largeIcon` should point to package assets.
- [ ] Use documented `requiredPermissions` for Luna/LS2 ACG permissions. `permissions` is not the documented webOS TV/OSE field.
- [ ] Add `resolution` when intentionally targeting `1920x1080` or `1280x720`.
- [ ] Confirm whether `requiredMemory` is appropriate for LG store/device validation.

Recommended manifest shape:

```json
{
  "id": "com.novaplayer.app",
  "version": "0.2.5",
  "vendor": "Nova Player",
  "type": "web",
  "main": "index.html",
  "title": "Nova Player",
  "icon": "images/favicon.png",
  "largeIcon": "images/favicon.png",
  "resolution": "1920x1080",
  "handlesRelaunch": true,
  "requiredPermissions": ["media.operation"]
}
```

### Resolution And Assets

- [x] webOS supports graphics display at `1920x1080` on UHD models and up to `1280x720` on FHD models.
- [x] Default graphics resolution is `1920x1080` if not overridden.
- [ ] For best coverage, consider two packages: `1920x1080` and `1280x720`.
- [ ] Use image assets sized close to display size. Avoid decoding oversized posters/logos on TV.
- [ ] Verify launcher icon dimensions and LG store asset requirements before submission.

### Lifecycle

- [x] Handle `webOSLaunch`.
- [x] Handle `webOSRelaunch`.
- [x] Set `handlesRelaunch: true` when the app handles relaunch manually.
- [x] Handle `visibilitychange` / `webkitvisibilitychange`.
- [x] Pause active media when hidden or suspended.
- [~] Ensure all long-running timers, intervals, and network activity are paused or reduced while hidden.

### Remote And Focus

- [x] Normalize LG/webOS remote keys, including arrows, OK/Enter, Back, media keys, and color keys.
- [x] Use TV focusable markers and custom focus styles.
- [x] Provide deterministic D-pad navigation in grid/list/header zones.
- [ ] Avoid duplicate global remote listeners.
- [ ] Confirm Back exits/returns correctly on all screens and modal states.

### Performance And Low-RAM Requirements

- [x] Official guidance: TVs have lower specs than PCs. Keep memory usage low.
- [x] LG community guidance recommends keeping app memory under about `250 MB`.
- [x] Use Resource Monitor for real-time CPU, memory, storage, and network monitoring.
- [x] Use Beanviser for process-level CPU/memory, memory leak, and long-run stability testing.
- [x] Package non-minified builds when using Web Inspector debugging.
- [x] Lazy-load heavy routes with `React.lazy`.
- [x] Use smaller initial render counts on webOS for VOD and Series grids.
- [x] Avoid global "All" VOD/Series catalog loads on webOS.
- [x] Keep only the active VOD/Series category in memory on webOS.
- [x] Use IndexedDB and memory-cache caps.
- [x] Limit image decode concurrency.
- [~] App startup still triggers all three section fetch helpers after activation; current helpers mostly fetch categories only in TV mode, but this should be measured on real hardware.
- [~] Several components still use `motion/react` animations directly. Global CSS reduces durations on TV, but a full pass should remove unnecessary animations/blurs/shadows on webOS.
- [ ] Add automated memory pressure smoke tests or a manual Resource Monitor checklist.

### Media Playback

- [x] Detect webOS/Tizen/web platforms.
- [x] Prefer native/platform playback where supported.
- [x] Use native direct playback for webOS MKV/VOD where supported; reserve ffmpeg/remux paths for browser/dev compatibility or explicit fallback.
- [x] Use same-origin proxy/remux endpoints for browser development.
- [x] Pause media on app visibility loss.
- [x] Live streams ignore VOD-style seek requests and disable skip controls.
- [x] Browser HLS-remux VOD seeking restarts the remux session at the requested content timestamp instead of seeking inside a stale local segment window.
- [x] HLS-remux sessions are sequence-guarded client-side and cleaned server-side so rapid seeks cannot attach to stale manifests or segment files.
- [x] Tizen Live TV uses the native TV playback path like webOS instead of hls.js/MSE.
- [x] Packaged webOS/Tizen playback blocks ffmpeg-backed `/api/stream-ts` fallback paths and fails clearly when the TV native decoder cannot play a stream.
- [x] Browser VOD direct-file playback restores same-origin `/api/proxy` fallback for cross-origin streams.
- [~] MKV/HLS remux and subtitle extraction are complex and must be tested on real webOS hardware with single-connection providers.
- [~] Recent fix maps HLS remux to video + first audio only for startup stability; subtitle UX needs follow-up validation.
- [ ] Verify supported AV formats against each target webOS version.
- [ ] Verify fallback behavior when ffmpeg/remux backend is unavailable in packaged mode.

### Storage, Network, And Cache

- [x] Use persistent caches for catalogs, activation, and subtitles.
- [x] Use category-only cache hydration on webOS to avoid large stream arrays in memory.
- [x] Use request deduplication for expensive fetches.
- [x] Use localStorage for small settings and favorites.
- [~] Disk subtitle and track caches can grow; add cleanup policy / max size.
- [~] `.nova-api-cache.json`, `cache/subtitles`, and `hls-live` are runtime artifacts and should not be packaged or committed.
- [ ] Confirm package excludes dev/server runtime caches and generated subtitle files.

### Build And Packaging

- [x] Vite `base: "./"` supports packaged `file://` relative assets.
- [x] Production build targets `es2017` for older TV web engines.
- [x] Build scripts include parity verification before `ares-package`.
- [x] `public/appinfo.json` should be copied to `dist/appinfo.json` by Vite.
- [~] Current `npm run lint` / `tsc --noEmit` has unrelated existing TypeScript errors. This should be fixed before release packaging.
- [ ] Run `npm run build:parity` after the TypeScript errors are fixed.
- [ ] Install and test the `.ipk` on a physical low-RAM LG TV, not only simulator.

## Project Audit Notes

### Files Reviewed

- `public/appinfo.json`
- `package.json`
- `index.html`
- `vite.config.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/lib/remote.ts`
- `src/lib/tv.ts`
- `src/lib/isWebOsTv.ts`
- `src/lib/animationControl.ts`
- `src/lib/imageOptimization.ts`
- `src/lib/streamPlaybackUrl.ts`
- `src/lib/platformPlayer.ts`
- `src/context/PlaylistContext.tsx`
- `src/services/iptvService.ts`
- `src/views/LiveTV.tsx`
- `src/views/Movies.tsx`
- `src/views/Series.tsx`
- `src/views/CinemaPlayer.tsx`
- `server.ts`

### Compliant / Good

- [x] `public/appinfo.json` exists and has a valid app id, version, vendor, type, main, title, icon, and largeIcon.
- [x] `handlesRelaunch` is enabled.
- [x] `main.tsx` listens to `webOSLaunch`, `webOSRelaunch`, and visibility events.
- [x] `main.tsx` pauses media elements when hidden.
- [x] `index.html` marks TV mode early for webOS/Tizen user agents and platform globals.
- [x] `vite.config.ts` uses relative base paths and strips `crossorigin` for packaged TV mode.
- [x] Heavy views are lazy-loaded in `App.tsx`.
- [x] VOD and Series avoid full "All" catalog loads on webOS and fetch per-category on demand.
- [x] VOD and Series keep only one category cache in RAM on webOS.
- [x] `PlaylistContext` hydrates categories-only on webOS and evicts global stream catalogs from memory.
- [x] `IPTVService` caps memory cache and has a webOS category-only cache path.
- [x] Old full-catalog IndexedDB entries are purged when the webOS category-only cache path runs.
- [x] Image loading is queued and thumbnails are smaller in browser/proxy mode.
- [x] TV remote navigation covers common LG key codes including Back `461`.
- [x] Browser-dev keyboard navigation maps arrows, Enter, Escape/Back, media keys, channel keys, color keys, and `1/2/3/4` or `R/G/Y/B` color-button aliases.
- [x] Shared remote dispatch sends one Select event per key press, preserves Backspace/Enter inside text fields, and scrolls newly focused controls into view.
- [x] Activation, Playlist Setup, Account, Settings, Movies, Series, Radio, Home modals, Live TV, and Cinema Player have route-level Back/Select/D-pad handling.
- [x] Recent playback origin fix avoids localhost/127.0.0.1 CORS mismatch in browser dev.
- [x] `FloatingPlayer` uses direct native playback on webOS instead of `/api/proxy` or hls.js.
- [x] `CinemaPlayer` uses direct native MKV playback on webOS before dev-server remux paths.
- [x] Xtream Live, Movie, and Series URLs are built through canonical helpers (`/live`, `/movie`, `/series`) with container-extension preservation.
- [x] webOS/Tizen playback wrappers keep direct stream URLs for native hardware decoders; browser dev still uses same-origin proxy for CORS.
- [x] webOS live playback no longer falls back to local `/api/stream-ts`; packaged TV playback stays on native direct URLs.
- [x] Packaged webOS/Tizen subtitle selection uses native/platform text tracks exposed by the TV media engine and does not fall back to local ffmpeg extraction/remux.
- [x] Player seek handling is separated by media mode: live ignores seek, native/HLS VOD seeks on the engine timeline, MPEG-TS fallback restarts at the effective timestamp when outside buffer, and HLS-remux restarts a clean session at the effective timestamp.
- [x] Browser HLS-remux session cache tracks its seek offset and rebuilds manifests/segments when the requested offset changes, preventing stale playback windows after user scrubbing.
- [x] Cinema player avoids packaged-TV LAN ffmpeg fallbacks after native decode failures; webOS/Tizen stay on direct native/platform playback paths.
- [x] Native audio/subtitle switching now checks browser-exposed `audioTracks`/`textTracks` before falling back to platform-specific track APIs.
- [x] Radio station data is capped/sanitized for TV memory safety and stale station requests/audio are cleaned up on page exit.
- [x] Radio skips remote station logo image loads on webOS/Tizen to avoid image CORS/tracking noise and reduce memory.
- [x] Live TV D-pad navigation is highlight-only on webOS; playback starts on Select/Enter to avoid decoder churn while browsing.
- [x] Live TV aborts stale EPG requests and caps its in-memory seen-channel map.
- [x] WebOS skips full startup category-count indexing; counts are learned from opened categories.
- [x] `Settings` uses the same `motion/react` runtime as the rest of the app instead of loading a second animation library.
- [x] TV mode disables fixed body background attachment to reduce compositing pressure.

### Missing / Needs Fix

- [x] `public/appinfo.json` uses documented `"requiredPermissions"` instead of `"permissions"`.
  - Current:
    ```json
    "permissions": ["internet", "media.operation"]
    ```
  - Recommended:
    ```json
    "requiredPermissions": ["media.operation"]
    ```
  - Note: Internet access is normally not listed as an appinfo ACG. Keep only actual LS2 ACG permissions used by webOS service calls.

- [x] `public/appinfo.json` has explicit `"resolution": "1920x1080"` for UHD/FHD graphics.
  - Consider a second `"resolution": "1280x720"` package for lower-end FHD devices if targeting LG store broadly.

- [ ] `requiredMemory: 256` needs validation.
  - LG community guidance recommends keeping runtime memory under about `250 MB`.
  - Confirm whether declaring `256` is accepted/desirable for the target devices/store.
  - Measure real RSS + GPU memory with Resource Monitor and Beanviser.

- [x] Remote initialization is no longer duplicated.
  - `main.tsx` owns `initTVRemote()`.

- [x] `App.tsx` no longer forces `<div data-tv="true">` in desktop browser mode.

- [x] `injectAnimationPreferences()` safely waits for `document.body` when needed.
  - It can run before `body` is available in some loading modes.
  - Add a DOM-ready guard or call after mount.

- [ ] Runtime caches should be excluded from packaging and commits.
  - `.nova-api-cache.json`
  - `cache/subtitles/*`
  - `hls-live/*`
  - Generated `.ipk` files

- [ ] Finish guarding TV-incompatible dev-server/backend configuration.
  - `CinemaPlayer` now prefers native webOS playback for MKV before ffmpeg-backed routes.
  - `FloatingPlayer` now uses native direct playback on webOS.
  - Live/VOD/Series direct URL paths are now canonicalized for Xtream.
  - Remaining work: package-time API base configuration and real hosted backend expectations.
  - Packaged webOS apps do not have the local Node/ffmpeg server.

- [x] Add webOS storage hygiene for stale large IndexedDB entries.
  - TV category-only cache startup now keeps category keys but purges old `get_live_streams`, `get_vod_streams`, and `get_series` full-catalog keys.

- [ ] Reduce packaged bundle weight.
  - Audit unused or desktop-only dependencies such as `@google/genai`, `react-window`, `video.js`, `shaka-player`, `hls.js`, and `mpegts.js`.
  - Keep heavy playback libraries dynamically imported and avoid loading them on the webOS-native path.
  - Current `npm run build` passes, but Vite still warns about large player chunks (`vendor-player`, `shaka-player`, and main `index`).

- [x] Add explicit player cleanup for route exit.
  - `CinemaPlayer` now tears down player engines, timers, subtitle fetches, and RAF work on unmount.

- [ ] Add explicit app close/termination cleanup.
  - Visibility handling pauses media, but add a `webOSClose` / close-style cleanup path where available.
  - Stop app-wide videos, abort network work, clear refresh intervals, and unregister Luna audio tracks.

- [ ] Resolve version and deployment drift.
  - `public/appinfo.json` is `0.2.5`.
  - `package.json` is `0.0.0`.
  - Some code/docs mention `1.0.0`.
  - `deploy:webos` hardcodes the generated IPK name and device id.

- [ ] Improve packaged activation/backend configuration.
  - Packaged `file://` mode depends on configured media/API base URLs.
  - Document or implement a TV-friendly LAN host setup/QR activation flow.

- [x] `npm run lint` is currently release-clean.
  - Latest check: `tsc --noEmit` passes.

- [ ] Media remux path needs physical-device soak testing.
  - Test MKV with many subtitle streams.
  - Test single-connection providers.
  - Test app suspend/resume while stream is active.
  - Test native audio/subtitle switching on webOS and Tizen.

- [ ] Add a real memory test protocol.
  - Open app from cold boot.
  - Browse Live, Movies, Series, Radio.
  - Open multiple categories in VOD/Series.
  - Play live stream for 30 minutes.
  - Play MKV series episode for 30 minutes.
  - Suspend/resume app 5 times.
  - Target: app stays below ~250 MB and does not trigger "restart to free memory".

## Suggested Next Fix Session Order

1. Validate `requiredMemory` with Resource Monitor / Beanviser on a real low-RAM LG TV.
2. Finish guarding packaged webOS from remaining dev-server-only `/api/*` playback fallbacks.
3. Add packaging ignore/cleanup for runtime cache files.
4. Reduce bundle weight and remove unused heavy dependencies from the packaged path.
5. Add a webOS memory test checklist script/manual runbook.
6. Run `npm run build:parity`, `npm run package:webos`, install on physical TV, and profile with Resource Monitor/Beanviser.
7. Tune animations/blurs/shadows and media remux based on real TV measurements.
