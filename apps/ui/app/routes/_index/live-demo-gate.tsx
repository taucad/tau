import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HeroViewerSkeleton } from '#routes/_index/section-skeletons.js';

const LiveDemoLazy = lazy(async () => {
  const m = await import('#routes/_index/live-demo-section.js');
  return { default: m.LiveDemoSection };
});

/**
 * Viewport-gated wrapper for the live demo. Defers loading Three.js, the
 * runtime, and the JSCAD kernel until the section scrolls into view (mirrors
 * the legacy `hero-viewer-gate`).
 */
export function LazyLiveDemo(): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={sentinelRef} className='min-h-[200px]'>
      {isVisible ? (
        <Suspense fallback={<HeroViewerSkeleton />}>
          <LiveDemoLazy />
        </Suspense>
      ) : (
        <HeroViewerSkeleton />
      )}
    </div>
  );
}
