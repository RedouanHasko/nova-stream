# Nova Player for Windows

This package target wraps Nova Player in Tauri for Windows 10 and Windows 11.

## Goals

- Installable Windows desktop app.
- Uses the same app name and version as the TV packages:
  - Name: `Nova Player`
  - Version: `0.2.5`
  - Identifier: `com.novaplayer.app`
- Uses Tauri's Windows `offlineInstaller` WebView2 mode so users do not need to manually install WebView2 on other PCs.
- Uses the existing Vite/React player UI for the desktop shell.

## Commands

```powershell
npm run dev:windows
npm run package:windows
```

`npm run package:windows` builds the React app and then creates a Windows NSIS installer through Tauri.

## Required Build Tools

The developer/build machine needs:

- Rust toolchain
- Microsoft Visual Studio Build Tools with the C++ desktop workload
- Tauri CLI, installed through npm in this project

End-user PCs should not need these build tools.

## Runtime Packaging Notes

Tauri uses Microsoft WebView2 on Windows. The config uses:

```json
"webviewInstallMode": {
  "type": "offlineInstaller",
  "silent": true
}
```

This makes the installer larger, but it avoids asking users to manually install WebView2.

## Current Limitation

The first Tauri target packages the frontend app. Some current development features depend on the local Node server in `server.ts`, including proxy/remux endpoints and cache folders.

To make every feature work fully offline after installation, the next step is to bundle the backend as a Tauri sidecar or replace those endpoints with Rust/Tauri commands. Do not call the Windows package feature-complete until that sidecar/backend integration is done and tested.

## Icon

`public/appinfo.json` references `images/favicon.png`, but the actual icon asset is not currently present in the repository. Before final release, generate Tauri icons from the real app icon and place them under `src-tauri/icons/`.
