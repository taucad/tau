import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@taucad/ui/utils/cn';

const HeroCanvasLazy = lazy(async () => {
  const m = await import('#routes/_index/hero-canvas.js');
  return { default: m.HeroCanvas };
});

/**
 * Static point-field poster. Server-rendered and the fallback whenever the live
 * canvas is unavailable (pre-hydration, off-viewport, reduced motion, or a
 * WebGL failure). Approximates the converged cloud with a masked dot pattern.
 */
function HeroPoster({ className }: { readonly className?: string }): React.JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-0 isolate overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/5 to-background',
        className,
      )}
    >
      <div
        className='absolute inset-0 opacity-70'
        style={{
          backgroundImage: 'radial-gradient(hsl(var(--primary)) 1px, transparent 1.4px)',
          backgroundSize: '14px 14px',
          maskImage: 'radial-gradient(ellipse 60% 60% at 50% 45%, black 30%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 45%, black 30%, transparent 72%)',
        }}
      />
      <div className='absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-accent/10' />
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  return reduced;
}

/**
 * Hero visual slot: the static poster with the live, pointer-reactive point
 * cloud (R5) layered on once it is safe and worthwhile to run — client-side,
 * in view, motion allowed, and WebGL healthy (R10). The poster stays mounted
 * underneath so a canvas failure degrades seamlessly.
 */
export function HeroVisual({ className }: { readonly className?: string }): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [errored, setErrored] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
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

  const handleError = useCallback(() => {
    setErrored(true);
  }, []);

  const showCanvas = visible && !reducedMotion && !errored;

  return (
    <div ref={sentinelRef} className={cn('relative isolate overflow-hidden rounded-2xl', className)}>
      <HeroPoster />
      {showCanvas ? (
        <Suspense fallback={null}>
          <div className='absolute inset-0'>
            <HeroCanvasLazy isReducedMotion={reducedMotion} onError={handleError} />
          </div>
        </Suspense>
      ) : null}
    </div>
  );
}
