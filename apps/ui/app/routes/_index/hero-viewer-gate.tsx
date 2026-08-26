import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { HeroViewerSkeleton } from '#routes/_index/section-skeletons.js';

const HeroViewerLazy = lazy(async () => {
  const m = await import('#routes/_index/hero-viewer.js');
  return { default: m.HeroViewer };
});

/**
 * Viewport-gated wrapper for HeroViewer.
 * Defers loading of Three.js, the runtime, and the OpenRSCAD kernel
 * until the section scrolls into view.
 */
export function LazyHeroViewer(): React.JSX.Element {
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
          <HeroViewerLazy />
        </Suspense>
      ) : (
        <HeroViewerSkeleton />
      )}
    </div>
  );
}
