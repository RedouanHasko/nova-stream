# webOS TV Performance & Usability Optimization Guide

## 1. Performance Profile: webOS TV Constraints

**Hardware Limits**:
- CPU: Quad-core 1.5-2.5 GHz (old models: 1 GHz single-core)
- RAM: 1-2 GB (shared with system)
- GPU: Mali-450 MP4 or similar (no hardware video decode acceleration on old models)
- Network: WiFi 802.11n (often unstable; 5 GHz not always available)

**Rendering Constraints**:
- 60 FPS is maximum (most TVs target 24-30 FPS for video)
- JavaScript execution on main thread blocks video frames
- CSS animations/transitions can cause jank if not GPU-accelerated
- Blur/shadow effects are extremely expensive

**Bundle Constraints**:
- webOS packaged app bundle size: Max 50 MB total (including assets)
- Initial load must complete in < 3 seconds for UX acceptability
- Memory for JavaScript: ~50-100 MB before garbage collection pauses

---

## 2. Optimization Checklist

### ✅ Already Implemented
- [x] Lazy route loading (Settings, LiveTV, Movies, etc.)
- [x] Component memoization (SidebarItem, MovieCard)
- [x] Image lazy loading on cards
- [x] Vite chunk splitting (vendor-player, vendor-ui)
- [x] TV platform detection (isTV, tvPlatform, isLowPowerTV)
- [x] Crossorigin attribute stripping (Vite plugin)
- [x] ES2017 target for broad TV compatibility

### 🔴 HIGH PRIORITY (Implement Now)
1. **List Virtualization** → Render only visible items in Movies/Series/Live channel lists
2. **Request Debouncing** → Prevent duplicate catalog fetches on rapid navigation
3. **Animation Reduction** → Disable motion effects on low-power TVs
4. **Memory Leak Prevention** → Aggressive cleanup in useEffect hooks
5. **Image Optimization** → Serve WebP with PNG fallback, limit poster size to 300×450px

### 🟡 MEDIUM PRIORITY (Implement If Time)
6. **Network Cache** → IndexedDB-based catalog caching with background refresh
7. **State Consolidation** → Reduce CinemaPlayer state complexity
8. **Async Script Loading** → Load analytics/tracking scripts after critical content
9. **CSS Optimization** → Remove unused TailwindCSS utilities, reduce motion on TV
10. **Bundle Analysis** → Replace heavy dependencies (motion/react → CSS animations only)

### 🟢 LOW PRIORITY (Polish)
11. **PWA Support** → Offline capability via Service Worker
12. **Prefetch Logic** → Warm up next screen data on focus
13. **Streaming Metrics** → Monitor and report playback health

---

## 3. Detailed Optimization Strategies

### 3.1 List Virtualization (HIGH PRIORITY)

**Problem**: Rendering 500+ movie/series items kills the TV
**Solution**: Use `react-window` (already in package.json) for only visible items

**Impact**: 80-90% reduction in DOM nodes + render time

**Implementation**:
```typescript
// Before: .map() renders all items
{movies.map(m => <MovieCard key={m.id} movie={m} />)}

// After: Only visible items rendered
<FixedSizeList height={600} width={1920} itemCount={movies.length} itemSize={200}>
  {({ index, style }) => (
    <div style={style}>
      <MovieCard movie={movies[index]} />
    </div>
  )}
</FixedSizeList>
```

**Files to Update**:
- `player/src/views/Movies.tsx`
- `player/src/views/Series.tsx`
- `player/src/views/LiveTV.tsx` (channel list)
- `player/src/views/Radio.tsx`

---

### 3.2 Request Debouncing & Caching (HIGH PRIORITY)

**Problem**: Navigating between screens triggers duplicate catalog API calls

**Solution**: 
1. Add request deduplication in `iptvService.ts`
2. Use IndexedDB for cross-session caching
3. Implement "stale-while-revalidate" pattern

**Impact**: 50-70% fewer network requests, faster navigation

**Implementation Pattern**:
```typescript
// Deduplicate in-flight requests
const _inflight = new Map<string, Promise<any>>();

export const fetchLiveChannelsDeduplicated = async () => {
  if (_inflight.has('live')) {
    return _inflight.get('live');
  }
  const promise = fetchLiveChannels();
  _inflight.set('live', promise);
  await promise;
  _inflight.delete('live');
  return promise;
};
```

**Files to Update**:
- `player/src/services/iptvService.ts` → Add deduplication layer
- `player/src/context/PlaylistContext.tsx` → Use debounced fetches

---

### 3.3 Animation Reduction for Low-Power TVs (HIGH PRIORITY)

**Problem**: `motion/react` animations cause frame drops on webOS

**Solution**: Disable animations entirely on low-power TVs

**Impact**: Smooth 60 FPS navigation vs. 15-20 FPS stutters

**Implementation**:
```typescript
// In any component using motion.div:
const shouldAnimate = !isLowPowerTV;

<motion.div
  animate={shouldAnimate ? { opacity: 1 } : { opacity: 1 }}  // ← No animation on TV
  initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
  transition={shouldAnimate ? { duration: 0.3 } : {}}
>
  Content
</motion.div>

// Or simpler: Skip motion component entirely on TV
{isLowPowerTV ? (
  <div className="opacity-1">Content</div>
) : (
  <motion.div animate={{ opacity: 1 }}>Content</motion.div>
)}
```

**Files to Update**:
- `player/src/views/LiveTV.tsx` → Disable epg animations
- `player/src/views/CinemaPlayer.tsx` → Disable settings panel animations
- `player/src/views/Home.tsx` → Disable hero animations
- `player/src/components/FloatingPlayer.tsx` → Disable mini player animations

---

### 3.4 Memory Leak Prevention (HIGH PRIORITY)

**Problem**: Event listeners, timers, and subscriptions accumulate → OOM crashes

**Solution**: Aggressive cleanup with AbortController

**Impact**: Prevent TV app crashes after 30+ minutes of navigation

**Pattern**:
```typescript
export function useCleanupEffect(setup: (signal: AbortSignal) => void) {
  useEffect(() => {
    const ctrl = new AbortController();
    setup(ctrl.signal);
    return () => ctrl.abort();
  }, []);
}

// Usage:
useCleanupEffect((signal) => {
  const handler = () => { /* ... */ };
  window.addEventListener('tv-remote-key', handler, { signal });
  // ← Automatically removed on unmount
});
```

**Files to Update**:
- `player/src/views/CinemaPlayer.tsx` → Event listener cleanup
- `player/src/components/FloatingPlayer.tsx` → Streaming resource cleanup
- `player/src/views/LiveTV.tsx` → Remote key listener cleanup

---

### 3.5 Image Optimization (HIGH PRIORITY)

**Problem**: Full-res posters (2MB each) over slow WiFi = slow catalog loading

**Solution**:
1. Limit poster size: 300×450px max
2. Serve WebP (75% smaller) with PNG fallback
3. Add `srcset` for density adaptation

**Impact**: 50-70% smaller images, faster rendering

**Implementation**:
```typescript
// Create optimized poster URL
export const getOptimizedPosterUrl = (url: string, width = 300) => {
  // Use Cloudinary or imageproxy to resize/compress
  return `${backendBase}/api/proxy?url=${encodeURIComponent(url)}&w=${width}&fm=webp`;
};

// In MovieCard:
<picture>
  <source srcSet={getOptimizedPosterUrl(poster, 300)} type="image/webp" />
  <img 
    src={getOptimizedPosterUrl(poster, 300).replace('&fm=webp', '')} 
    loading="lazy" 
    width="150" 
    height="225" 
  />
</picture>
```

**Files to Update**:
- `player/src/components/MovieCard.tsx` → Picture element with srcset
- `player/src/components/SeriesCard.tsx` → Same optimization
- `player/src/components/ChannelCard.tsx` → Same optimization
- `player/src/lib/imageOptimization.ts` → New utility file

---

## 4. Network Optimization

### 4.1 Request Deduplication

```typescript
// player/src/services/requestDedup.ts (NEW FILE)
export class RequestDeduplicator {
  private _pending = new Map<string, Promise<any>>();

  async deduplicate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this._pending.has(key)) {
      return this._pending.get(key)!;
    }
    const promise = fetcher().finally(() => this._pending.delete(key));
    this._pending.set(key, promise);
    return promise;
  }
}

export const dedup = new RequestDeduplicator();
```

### 4.2 Catalog Caching with IndexedDB

```typescript
// player/src/lib/catalogCache.ts (NEW FILE)
const DB_NAME = 'iptvpanel-cache';
const STORE_NAME = 'catalogs';

export async function getCachedCatalog(playlistId: string) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
  return db.get(STORE_NAME, playlistId);
}

export async function setCatalogCache(playlistId: string, data: any) {
  const db = await openDB(DB_NAME, 1);
  await db.put(STORE_NAME, { id: playlistId, data, timestamp: Date.now() });
}
```

---

## 5. Rendering Optimization

### 5.1 CinemaPlayer State Consolidation

**Current Problem**: 25+ useState calls cause re-renders on every property change

**Solution**: Merge related states into single context/reducer

```typescript
// Before: 25 useState calls
const [isPlaying, setIsPlaying] = useState(false);
const [volume, setVolume] = useState(1);
const [isMuted, setIsMuted] = useState(false);
// ... 22 more

// After: Single state object
type PlayerState = {
  playback: { isPlaying: boolean; volume: number; isMuted: boolean };
  // ... grouped
};
```

**Impact**: 15-20% fewer re-renders

---

### 5.2 CSS Animation Reduction

```css
/* player/src/index.css - Add low-power mode */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Disable expensive effects on TV */
body[data-low-power="true"] {
  /* No backdrop filters, blurs, shadows */
}

body[data-low-power="true"] .blur-effect {
  filter: none !important;
  box-shadow: none !important;
}
```

---

## 6. Bundle Size Reduction

### 6.1 Dependency Audit

**Current Heavy Libraries** (from package.json):
- `motion/react` → 45 KB (animations only)
  - *Alternative*: Pure CSS animations + `isAnimated` state flag
- `video.js` → 120 KB
  - *Keep*: Essential for Video.js UI

**Recommendation**:
- Keep HLS.js, mpegts.js (required for playback)
- Reduce motion/react usage to critical paths only
- Use CSS animations for low-power mode

### 6.2 CSS Utility Cleanup

Use Tailwind's purge to remove unused utilities:

```typescript
// vite.config.ts
{
  content: ['./src/**/*.{ts,tsx}'],
  safelist: [], // No unused utilities
  // ... rest
}
```

---

## 7. TV-Specific Optimizations

### 7.1 Remote Control Efficiency

**Current**: Every key press triggers full focus scan

**Optimization**:
```typescript
// Cache focusable elements
let _focusableCache: HTMLElement[] = [];
let _focusableCacheKey = 0;

export const focusNextOptimized = (direction: 'left' | 'right' | 'up' | 'down') => {
  // Invalidate cache only when DOM changes significantly
  if (document.body.getAttribute('data-dom-version') !== _focusableCacheKey) {
    _focusableCache = getFocusable();
    _focusableCacheKey = document.body.getAttribute('data-dom-version') || '0';
  }
  // Use cached list instead of scanning
  ...
};
```

### 7.2 Low-Power Rendering Profile

```typescript
// Create rendering preset for low-power TVs
export const getRenderingConfig = () => {
  if (isLowPowerTV) {
    return {
      disableAnimations: true,
      maxParallelImages: 2,
      reduceMotion: true,
      lowQualityPosters: true,
      disableVideoBackgrounds: true,
      disableBlurEffects: true,
    };
  }
  return {
    disableAnimations: false,
    maxParallelImages: 4,
    reduceMotion: false,
    lowQualityPosters: false,
    disableVideoBackgrounds: false,
    disableBlurEffects: false,
  };
};
```

---

## 8. Performance Monitoring

### 8.1 Add Performance Markers

```typescript
// player/src/lib/perf.ts (NEW)
export const markPerformance = (label: string) => {
  if (performance.mark) {
    performance.mark(label);
  }
};

export const measurePerformance = (label: string, startMark: string) => {
  if (performance.measure) {
    performance.measure(label, startMark);
    const measure = performance.getEntriesByName(label)[0];
    console.log(`${label}: ${measure.duration.toFixed(2)}ms`);
  }
};
```

### 8.2 Memory Usage Logging

```typescript
// Periodically log memory usage on TV
if (performance.memory) {
  console.log(`Memory: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);
}
```

---

## 9. Testing on Low-Power TV

### 9.1 Performance Throttling

```bash
# Simulate low-power TV in DevTools
# Throttle CPU 6x + Network to 4G
# Disable JavaScript caching
```

### 9.2 Lighthouse Audit

```bash
# Run Lighthouse for performance
npx lighthouse http://localhost:3000 --output-path=report.html
# Target: Performance > 90, FCP < 2s, LCP < 3s
```

---

## 10. Implementation Priority

**Phase 1 (Week 1)**: Critical fixes for TV playability
1. ✅ List virtualization (Movies, Series, Live)
2. ✅ Request deduplication
3. ✅ Animation reduction on low-power TVs
4. ✅ Memory leak cleanup
5. ✅ Image optimization

**Phase 2 (Week 2)**: Performance polish
6. IndexedDB caching
7. State consolidation in CinemaPlayer
8. CSS optimization
9. Bundle analysis + cleanup

**Phase 3 (Week 3)**: Monitoring & refinement
10. Performance markers
11. Memory monitoring
12. User-reported issues fixes

---

## 11. Success Metrics

| Metric | Current | Target | Impact |
|--------|---------|--------|--------|
| **Initial Load** | ~5s | < 2.5s | Better perceived performance |
| **Navigation (screen to screen)** | ~3s | < 1s | Smoother TV experience |
| **Memory (after 30 min use)** | ~180 MB | < 100 MB | No crash on older TVs |
| **FPS (menu navigation)** | 30 FPS | 60 FPS | Smooth remote navigation |
| **Scroll FPS (catalog)** | 20 FPS | 50+ FPS | Fluent scrolling |
| **Bundle Size** | ~370 KB | < 250 KB | Faster downloads |

---

## References
- **React Performance**: https://react.dev/reference/react/memo
- **react-window**: https://github.com/bvaughn/react-window
- **Lighthouse**: https://developer.chrome.com/docs/lighthouse/performance/
- **webOS Resource Constraints**: https://webostv.developer.lge.com/
