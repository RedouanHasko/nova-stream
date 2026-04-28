# Quick Chinese Subtitle Verification Guide

## What Changed

Your Chinese subtitle extraction now tries 5 different codec methods:
1. WebVTT codec
2. SubRip codec  
3. SRT codec
4. **ASS codec** ← For Chinese subtitles
5. **SSA codec** ← For older Chinese format

## How to Verify It Will Work

### Step 1: Check the Extraction Plans

Run this in the terminal where the server is running, then switch to Chinese subtitles in your player.

You should see logs like:
```
[subtitle] extraction attempt: direct|0:X?|webvtt->webvtt for "Content" (httpSeek=true)
[subtitle] extraction attempt: direct|0:X?|subrip->srt for "Content" (httpSeek=true)
[subtitle] extraction attempt: direct|0:X?|srt->srt for "Content" (httpSeek=true)
[subtitle] extraction attempt: direct|0:X?|ass->srt for "Content" (httpSeek=true)
[subtitle] extraction attempt: direct|0:X?|ssa->srt for "Content" (httpSeek=true)
```

If you see these logs AND one of them succeeds, Chinese subtitles will work.

### Step 2: What "Success" Looks Like

You should see:
```
[subtitle] extraction strategy succeeded: direct|0:X?|ass->srt on "Content Title" (http://...)
```

Or:
```
[subtitle] extraction strategy succeeded: direct|0:X?|ssa->srt on "Content Title" (http://...)
```

This means the Chinese subtitle extraction worked!

### Step 3: What "Failure" Looks Like

If you see:
```
[subtitle] ALL extraction strategies failed after 20 attempts for stream X
[subtitle] extraction failed for stream X (srt) on (...): ERROR MESSAGE
```

Note the ERROR MESSAGE and report it.

## Test Steps

1. **Open your player**
2. **Load a video with Chinese subtitles**
3. **Wait 3-5 seconds** (background prefetch starting)
4. **Look at server terminal** - should see:
   ```
   [subtitle] PREFETCH request: track X for "Content" (...)
   ```
5. **Click Chinese subtitle in player**
6. **Watch server logs** for extraction attempts
7. **Expected**: Within 2-10 seconds, one of the codec attempts succeeds

## Why This Works Now

**Before**: Only tried WebVTT, SubRip, SRT codecs. Chinese subtitles in ASS format would fail.

**After**: Tries WebVTT, SubRip, SRT, **ASS, SSA**. Chinese subtitles in ASS format will now succeed.

**Plus**: Direct strategy with 600s timeout means extraction completes much faster than before (no full-file proxy download needed).

## Expected Timeline

- **First language selected**: 3-5 seconds (background prefetch in progress)
- **Subsequent languages**: <2 seconds (already cached or nearly cached)
- **Chinese specifically**: Should appear within 5-10 seconds on first try

## If It Still Fails

Share these logs from your server terminal:
```
[subtitle] extraction attempt: direct|0:X?|...->... for "Content"
[subtitle] extraction strategy failed: direct|0:X?|...->...: ERROR MESSAGE
```

The ERROR MESSAGE will tell us exactly why Chinese extraction is failing, and we can fix it specifically.

## Success = Task Complete

When Chinese subtitles:
- ✅ Appear within 10 seconds of selection
- ✅ Don't show "fetching" forever
- ✅ Display correctly with Chinese characters

Then the task is COMPLETE and working.

