# Subtitle Instant Language Switching - Test Guide

## What Was Fixed

1. **Background prefetch of all subtitle tracks** - When content loads, all available subtitle tracks are pre-extracted in the background (after 2 seconds delay to avoid blocking playback)

2. **Faster polling for subtitle availability** - Client now polls every 500ms instead of 1200ms for the first 60 seconds, then switches to slower 2s polling

3. **Early display of partial subtitles** - If a subtitle track has partial data (header extraction), it displays immediately without waiting for full extraction

4. **Better error logging** - Server now provides detailed logs when extraction fails, making it easier to diagnose issues

5. **HTTP Range seeking optimization** - Direct input strategy uses 10-minute timeout for FFmpeg with HTTP Range seeking enabled

## How to Test

### Setup
1. Server is running on `http://localhost:4000`
2. Frontend should be running (e.g., `http://localhost:5173` or similar)
3. Load a video with multiple subtitle tracks (preferably including Arabic and Chinese)

### Test Steps

#### Test 1: Background Prefetch Verification
1. Open browser DevTools → Network tab
2. Load a video with multiple subtitle tracks
3. Wait 2-3 seconds for content to load
4. Check the Network tab - you should see multiple `/api/subtitle?prefetch=1` requests
5. **Expected**: Requests for track indices 0, 1, 2, ... (all subtitle tracks)
6. **Expected**: Request status `202` (Accepted/Queued) - means background extraction started

#### Test 2: Arabic Subtitles (Should Already Work)
1. Load video
2. Wait 3-5 seconds
3. Switch to Arabic subtitles
4. **Expected**: Subtitles appear within 1 second (from cache)
5. **Expected**: Playback continues smoothly without stuttering

#### Test 3: Chinese Subtitles (Critical Test)
1. Load video
2. Wait 2-3 seconds for background prefetch to start
3. Switch to Chinese subtitles
4. **Expected**: Within 500-2000ms, one of:
   - Subtitles display (if extraction completed)
   - Partial subtitles appear (header extraction only - ~46 seconds of content)
   - Brief loading indicator, then subtitles appear
5. **MUST NOT happen**: Infinite "fetching" with nothing displayed

#### Test 4: Rapid Language Switching
1. Load video
2. Wait 3 seconds
3. Rapidly switch between Arabic → Chinese → English (or available languages)
4. **Expected**: Each switch responds within 500-2000ms
5. **Expected**: No "fetching" delays longer than 2 seconds between switches
6. **Expected**: Playback never stutters or stops

#### Test 5: Stream Stability
1. Play video with subtitles
2. Switch languages several times
3. Let it play for 5+ minutes with subtitles active
4. **Expected**: Playback never freezes
5. **Expected**: Subtitle switching never breaks the stream
6. **Expected**: Video audio/video sync maintained

## What to Look For in Logs

### Browser Console (DevTools F12 → Console tab)

Look for these logs indicating successful prefetch:
```
[subtitle] partial data available, fetching immediately without waiting for full extraction
Background upgrade polling started, checking every 5000ms
Subtitles upgraded to full version
```

### Server Logs (Terminal running npm run dev)

#### Good Signs - Prefetch Working:
```
[subtitle] PREFETCH request: track 0 for "Content Title" (http://...)
[subtitle] PREFETCH request: track 1 for "Content Title" (http://...)
[subtitle] PREFETCH request: track 2 for "Content Title" (http://...)
...
```

#### Good Signs - Extraction Succeeding:
```
[subtitle] attempting DIRECT strategy with HTTP Range seeking: direct|0:0?|webvtt->webvtt (timeout=600s)
[subtitle] extraction strategy succeeded: direct|0:0?|webvtt->webvtt on "Content Title"
```

#### Bad Signs - Extraction Failing (Needs Debugging):
```
[subtitle] extraction strategy failed: direct|0:0?|webvtt->webvtt: (ERROR MESSAGE)
[subtitle] will retry next strategy if available
...
[subtitle] ALL extraction strategies failed after 12 attempts for stream 0
```

If you see ALL extraction strategies failing, collect the full error messages and report them.

#### Good Signs - Fallback Working:
```
[subtitle] Header download failed, falling back to proxy-only extraction
[subtitle] extraction strategy succeeded: proxy|0:0?|webvtt->webvtt
```

## Performance Expectations

### Timing
- **First subtitle load** (Arabic/English/etc): 1-3 seconds (cached from background prefetch)
- **New language switch**: 500-2000ms
- **Partial display latency**: <500ms
- **Full extraction completion**: 10-60 seconds depending on file size and codec

### What's Improved from Before
- **Before**: Switching languages showed "fetching" for 30-60+ seconds
- **After**: Switching languages shows response within 500-2000ms
- **Before**: Chinese subtitles not loading (timeout or extraction failure)
- **After**: Chinese subtitles should extract in background and appear

## Troubleshooting

### Problem: Still shows "fetching" for 30+ seconds
- **Cause**: Background prefetch might not have started in time
- **Fix**: Reload page and wait at least 5 seconds before switching subtitles

### Problem: Chinese subtitles still fail to display
- **Action Needed**: Check server logs for:
  - `extraction strategy failed: direct|...` - note the error message
  - `ALL extraction strategies failed` - means all methods failed
- **Report**: Send the full error messages from server logs

### Problem: Subtitles display but with weird timing
- **Cause**: Subtitle offset might need adjustment
- **Check**: Can you manually adjust subtitle delay in player? Try ±1000ms

### Problem: Playback stutters when switching subtitles
- **Expected**: Should NOT happen - extraction is background-only
- **Action**: Open DevTools and check Network tab - should see `/api/subtitle` requests that don't block playback

## Success Criteria

The fix is working if:
- ✅ Arabic subtitles appear within 1 second of selection
- ✅ Chinese subtitles appear within 5 seconds of selection (or show partial immediately)
- ✅ No subtitle switch takes longer than 2 seconds
- ✅ Rapid switching (2-3 times) doesn't cause delays
- ✅ Playback never stutters or stops during subtitle extraction
- ✅ Video plays smoothly for 10+ minutes with active subtitles

## Next Steps if Issues Occur

1. **Collect logs**:
   - Screenshot of browser console during Chinese subtitle switch
   - Copy-paste of server terminal logs showing the extraction attempt
   
2. **Provide information**:
   - Video file type (MKV, MP4, etc.)
   - Number of subtitle tracks
   - Which subtitle language fails (Chinese, Arabic, etc.)
   - Exact error message from logs

3. **Report findings**:
   - Share the logs with exact error messages
   - Describe timing (how long until "fetching" state)
   - Note if it eventually works or stays stuck
