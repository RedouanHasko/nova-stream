# Smart TV Release Readiness

This file tracks the requirements that must pass before Nova Player is considered ready for real smart TV release across webOS, Samsung Tizen, Android TV, and generic low-memory TV browsers.

## Supported Package Targets

- **webOS**: build with `npm run package:webos`, then install the generated `.ipk` with LG `ares-install`.
- **Samsung Tizen**: build with `npm run package:tizen`, then install the generated `.wgt` with Tizen Studio or `tizen install`.
- **Android TV**: requires a native Android TV shell that hosts the web app in a TV-safe `WebView` or a native player shell. A browser-only ZIP is not an Android TV install package.

## Samsung Tizen Requirements

- `public/config.xml` is copied into `dist/config.xml` and defines the Tizen web app package.
- External IPTV, activation, weather, and image endpoints are allowed through `<access origin="*" subdomains="true" />`.
- `tv.inputdevice` privilege is declared so the app can register Samsung media keys.
- Background support stays disabled because Samsung pauses hidden apps and expects video apps to release resources when hidden.
- Remote media keys are registered at runtime through `tizen.tvinputdevice.registerKey()`.

## Low-Memory Target

Treat every TV package as low-memory until physical profiling proves otherwise.

- Target total app footprint: **200 MB or lower** for the user's requested safety ceiling.
- JavaScript heap target: **120 MB or lower**.
- Do not keep multiple large catalogs, poster grids, or decoder sessions in memory.
- Do not pre-buffer aggressively while seeking; keep future seek buffering short.
- Release video/audio engines, object URLs, timers, requests, and subtitle resources on route exit and app hide.

## Required Physical Device Tests

Run this checklist on at least one low-end device per OS:

1. Cold launch from installed package.
2. Activate app and connect playlist.
3. Browse Live, Movies, Series, Radio, Settings, and Account.
4. Open several VOD and Series categories without triggering full catalog memory growth.
5. Play Live TV for 30 minutes.
6. Play a movie and a series episode for 30 minutes each.
7. Seek VOD repeatedly and verify playback recovers without stuck reconnecting states.
8. Switch audio and subtitle tracks where the stream provides them.
9. Suspend/resume the app five times during playback.
10. Confirm memory remains under the target and the OS does not restart/kill the app.

## Platform Notes

- **Tizen**: prefer AVPlay for live/VOD playback, track selection, adaptive streaming, and future DRM support.
- **webOS**: prefer native HTML media where supported and avoid local ffmpeg/backend fallbacks in packaged mode.
- **Android TV**: a production release needs a native Android TV package with Leanback launcher metadata, lifecycle callbacks, `isLowRamDevice()` handling, and media resource release in `onStop()`.

## Release Rule

Do not call the app "ready for all TVs" until the packaged builds pass the physical-device test matrix. Emulator/simulator success is not enough for memory, decoder, subtitle, or remote-control confidence.
