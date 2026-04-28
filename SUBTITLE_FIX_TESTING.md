# Subtitle Extraction Fix - Testing Guide

## What Was Changed

The subtitle extraction pipeline now uses **HTTP Range seeking** (fast) instead of just proxy streaming (slow) when the server supports Range requests.

### Three extraction strategies (in order):
1. **header** - Read first 30MB of MKV file locally (fast, but often partial)
2. **direct** - ⭐️ NEW: HTTP Range seek within remote file (fast, complete) 
3. **proxy** - Stream entire file through proxy (slow, fallback only)

## How to Test

### Step 1: Ensure Player Server is Running
```bash
cd c:\Users\red-h\Downloads\iptvpanel\player
npm run dev
```

Should print:
```
Server running on http://localhost:4000
```

### Step 2: Select an Arabic Subtitle
1. Open player at http://localhost:4000
2. Play: "NF - The Bad Guys: Breaking In (2025) (US) - S1E1"
3. Click subtitle button
4. Select "Arabic" (idx:4)
5. Wait 5-10 seconds

### Step 3: Check Backend Logs
Look for these DEBUG lines in the terminal:

```
[subtitle] DEBUG: about to add direct input for rawUrl=http://line.dndnscloud.ru/...
[subtitle] DEBUG: added direct input, inputs.length=3
[subtitle] DEBUG: inputs finalized: header, direct, proxy
[subtitle] DEBUG: extractionPlans.length = 27, first 10 plan names: header|0:4?|webvtt->webvtt | header|0:4?|subrip->srt | ...
```

Then watch for extraction attempts:

```
[subtitle] extraction attempt: header|0:4?|webvtt->webvtt (httpSeek=false)
[subtitle] extraction strategy succeeded: header|0:4?|webvtt->webvtt on "NF - The Bad Guys..."
[subtitle] partial header extraction detected (46.1s/1530.5s), saving partial & trying full-stream extraction
[subtitle] extraction attempt: direct|0:4?|subrip->srt (httpSeek=true)  ⭐️ THIS IS THE KEY LINE
```

### Expected Behavior

**With the fix:**
- ✅ Partial header detected (46s out of 1530s)
- ✅ "direct" strategy attempts (with httpSeek=true)
- ✅ Full subtitles extracted via HTTP Range seeking
- ✅ Subtitles display on video

**Without the fix (old code):**
- Header partial detected
- JUMPS to proxy strategy
- Proxy times out after 240 seconds
- Subtitles never display

## What if It Still Doesn't Work?

1. **Check if "direct" line appears in logs**
   - If YES: The extraction is running, might just be slow
   - If NO: Backend might not have restarted, or there's a different issue

2. **Restart everything:**
   ```bash
   # Kill any Node processes
   Stop-Process -Name "node" -Force
   
   # Restart player server
   cd c:\Users\red-h\Downloads\iptvpanel\player
   npm run dev
   ```

3. **Share logs** with lines containing:
   - `[subtitle] DEBUG:`
   - `[subtitle] extraction attempt: direct|`
   - `[subtitle] partial header extraction detected`

## Key Files Changed

- `player/server.ts` - Added "direct" input strategy to extraction pipeline
- `player/src/views/CinemaPlayer.tsx` - Client-side subtitle polling upgrade
