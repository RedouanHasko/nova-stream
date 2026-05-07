Smart TV integration notes

This document explains how the player integrates with Smart TV platform engines (Tizen, webOS) and how to test and package the app.

1) What we added
- `src/lib/platformPlayer.ts` — small helper that detects platform (Tizen/webOS) and exposes:
  - `trySwitchPlatformAudioTrack(video, index)` — attempts to call platform APIs (Tizen `webapis.avplay.setSelectTrack`) to switch audio
  - `trySwitchPlatformSubtitleTrack(video, index)` — attempts to call platform APIs (Tizen `webapis.avplay.setSelectTrack('TEXT', index)`) to switch subtitles

- `CinemaPlayer.tsx` and `LiveTV.tsx` now try platform-specific switching before falling back to HLS/HTML5/native approaches.

2) index.html
- The Tizen `webapis` script must be available on Tizen devices. Index now conditionally loads the platform script when running on Tizen.

3) Tizen specifics
- Include `<script src="$WEBAPIS/webapis/webapis.js"></script>` on Tizen platform. The helper attempts to load it automatically on Tizen user agents.
- Use `webapis.avplay.getTotalTrackInfo()` to enumerate tracks when possible and `webapis.avplay.setSelectTrack('AUDIO', index)` / `setSelectTrack('TEXT', index)` to switch.
- Packaging: when building the Tizen app bundle (wgt), ensure the `tizen-manifest.xml` lists required privileges if using additional APIs.

4) webOS specifics
- webOS exposes `window.webOS` and platform services via Luna. There is no single stable `setSelectTrack` API across all webOS models; richer integration may require Luna service calls (e.g., `com.webos.service.audio`) depending on the feature.
- For audio routing/volume control use `luna-send` or client-side `webOS.service.request` when available. We currently fall back to HTML5 APIs for webOS.

- We added best-effort Luna wrappers in `src/lib/platformPlayer.ts` (`webosRegisterTrack`, `webosUnregisterTrack`, `webosSetTrackVolume`, `webosGetTracks`, and automatic `selectTrack` attempts). These try multiple Luna endpoints and normalize results when possible; use device logs when testing because behavior varies across LG models.

5) Limitations and next steps
- We implemented synchronous best-effort helpers for Tizen and fallbacks for webOS. To fully support all models and edge cases we recommend:
  - Add AVPlay track enumeration wrappers in `platformPlayer` (call `getTotalTrackInfo`) and map to UI track lists.
  - Add webOS Luna service helpers for advanced audio routing and track control when applicable.
  - Add runtime feature-detection tests and logging to help debug device-specific behavior.
  - Add automated device tests on Tizen and webOS emulators or real devices.

6) How to test on device
- Tizen: package with Tizen SDK or use Developer Mode on a TV; deploy the `dist` web app and test audio/subtitle switching using the remote and the UI.
- webOS: use webOS TV SDK or Developer mode; test audio/subtitle switching; if features missing, use platform logs.

7) Browser/WebOS parity workflow (recommended)
- Goal: ship the exact same production JS/CSS bundle to browser preview and webOS package.
- Commands:
  - `npm run build:parity` builds the production bundle and verifies generated `dist/assets/*.js` and `dist/assets/*.css` integrity.
  - `npm run preview:parity` previews that same verified bundle in browser.
  - `npm run package:webos` packages that same verified bundle into IPK.
  - `npm run deploy:webos` packages + installs + launches on `TV17`.
- This avoids drift between a browser-tested build and the installed TV package.

If you want I can:
- Expand `platformPlayer` to enumerate tracks via `webapis.avplay.getTotalTrackInfo()` and expose them to the UI.
- Add webOS Luna helpers for audio routing and advanced track control.
- Add device-specific logging and a test checklist.
