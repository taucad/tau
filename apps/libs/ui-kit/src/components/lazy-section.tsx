import { useEffect, useRef, useState } from 'react';

type LazySectionProps = {
  readonly children: React.ReactNode;
  readonly minHeight: string;
  readonly className?: string;
  readonly rootMargin?: string;
  readonly fallback?: React.ReactNode;
};

/**
 * Viewport-gated wrapper that defers rendering of its children until
 * the placeholder scrolls into view. Reduces the initial SSR DOM node
 * count for below-the-fold sections.
 */
export function LazySection({
  children,
  minHeight,
  className,
  rootMargin,
  fallback,
}: LazySectionProps): React.JSX.Element {
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
      { threshold: 0.1, rootMargin },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  return (
    <div ref={sentinelRef} className={className} style={{ minHeight: isVisible ? undefined : minHeight }}>
      {isVisible ? children : (fallback ?? null)}
    </div>
  );
}
