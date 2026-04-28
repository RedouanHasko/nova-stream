# Quick Start Test - Chinese Subtitles

## What Was Fixed
The player now:
1. **Extracts Chinese (ASS/SSA) subtitles** by transcoding to WebVTT
2. **Uses HTTP Range seeking** for 600s timeout (no full file download needed)
3. **Shows partial subtitles immediately** (~46s header data) while full extraction continues
4. **Switches languages instantly** when you select a different track
5. **Prefetches all subtitle tracks** in the background

## How to Test

### Prerequisites
- A video file (MKV/MP4) with **multiple subtitle tracks including Chinese**
- Video should be on a remote server (HTTP/HTTPS) or local file
- Server running: `npm run dev` in `/player` directory (port 4000)

### Step 1: Open the Player
1. Navigate to: `http://localhost:3001` (frontend-panel)
2. Or: `http://localhost:5173` (player development)
3. Load your video with Chinese subtitles

### Step 2: Watch the Background Prefetch
1. Open browser DevTools: **F12 → Network tab**
2. Filter for: `subtitle`
3. You should see prefetch requests like:
   ```
   /api/subtitle?url=...&index=0&prefetch=1
   /api/subtitle?url=...&index=1&prefetch=1
   /api/subtitle?url=...&index=2&prefetch=1
   ```
   These start ~2-3 seconds after the video loads

### Step 3: Select Chinese Subtitle Track
1. Click on the **Subtitle menu**
2. Select the **Chinese subtitle track**
3. **Expected behavior**:
   - Subtitles appear within **5-10 seconds**
   - Chinese characters display correctly
   - No infinite "Fetching..." state
   - If partial (~46s), they auto-upgrade to full when ready

### Step 4: Check Server Logs
In the terminal running `npm run dev`, look for logs like:
```
[subtitle] extraction attempt: header|0:s:0?|ass->webvtt
[subtitle] extraction strategy succeeded
[subtitle] serving partial cache for "Video Title"
```

This confirms:
- ✅ ASS→WebVTT extraction was attempted
- ✅ It succeeded (not failed)
- ✅ Partial data was saved and served immediately

### Step 5: Test Language Switching
1. Select **Arabic** subtitle track → should appear instantly (5-10s max)
2. Select **Chinese** again → should appear instantly from cache
3. Select **English** → should appear instantly
4. **No 30-60 second delays** like before

## Success Criteria

✅ **All of the following must be true:**
- Chinese subtitles appear within 5-10 seconds
- Characters display correctly (not garbled)
- Language switching is fast (<10s per switch)
- No infinite "Fetching..." loops
- Server logs show `ass->webvtt` extraction succeeded

## If It Fails

### Problem: "Fetching..." never completes (Chinese)
**Check server logs for:**
```
[subtitle] extraction strategy failed: [error details]
```
If you see this, the FFmpeg command failed. Screenshot the error and the video details.

### Problem: Takes 30+ seconds to appear
**Normal for first load** (HTTP Range seeking takes 3-5s, transcoding 2-3s). Should be <10s total.
If >30s, check: Is it on a slow network? Is HTTP Range seeking working? (check logs for "FFmpeg Range seek")

### Problem: Characters are garbled
**Try switching format:** Edit player/server.ts line ~2022, change `codec: "webvtt"` to `codec: "subrip"` and restart server. This will use SubRip codec instead. Restart and retry.

## Video File Requirements

### Ideal Test Video
- **Format**: MKV or MP4
- **Codecs**: 
  - Video: H.264 or H.265
  - Audio: AAC or MP3
  - Subtitles: **ASS/SSA** (for Chinese), WebVTT, SRT
- **Multiple tracks**: At least 2-3 subtitle languages including Chinese
- **Duration**: 30+ minutes (so HTTP Range seeking has meaning)
- **Size**: 500MB-2GB (large enough that full download would take time)

### Example Sources
- Chinese movies/series on streaming sites (often have ASS subtitles)
- Anime MKV files (commonly use ASS for Japanese/Chinese)
- Test files: Create with FFmpeg: `ffmpeg -f lavfi -i color=c=blue:s=1920x1080:d=300 -f lavfi -i sine=f=1000:d=300 test.mp4`
  Then add subtitles with: `ffmpeg -i test.mp4 -i subs.ass -c copy test-with-subs.mp4`

## Troubleshooting Commands

### Check if server is running
```powershell
netstat -an | findstr :4000
```
Should show: `TCP 0.0.0.0:4000 0.0.0.0:0 LISTENING`

### Restart server
```powershell
cd c:\Users\red-h\Downloads\iptvpanel\player
npm run dev
```

### Check FFmpeg is installed
```powershell
ffmpeg -version
ffprobe -version
```

### View recent logs
In the terminal where `npm run dev` is running, look at the console output. Logs starting with `[subtitle]` are relevant.

## Questions?

If subtitles still don't work, provide:
1. Server log output showing the extraction attempt
2. Video file name/source
3. Exact subtitle language that failed
4. Browser Network tab screenshot

Then we can debug further!
