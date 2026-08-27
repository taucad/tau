import type { ComponentProps } from 'react';
import { useEffect, useImperativeHandle, useRef } from 'react';

import { cn } from '#utils/ui.utils.js';

type OmniScrollerProperties = ComponentProps<'div'> & {
  readonly viewportSelector?: string;
};

export const OmniScroller = ({
  className,
  ref,
  viewportSelector,
  ...properties
}: OmniScrollerProperties): React.JSX.Element => {
  const rootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => rootRef.current!);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      if (event.defaultPrevented || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        return;
      }

      const viewport = viewportSelector ? (event.target as Element).closest<HTMLElement>(viewportSelector) : root;

      if (!viewport || !root.contains(viewport) || viewport.scrollWidth <= viewport.clientWidth) {
        return;
      }

      const nextScrollLeft = Math.max(
        0,
        Math.min(viewport.scrollLeft + event.deltaY, viewport.scrollWidth - viewport.clientWidth),
      );

      if (nextScrollLeft === viewport.scrollLeft) {
        return;
      }

      viewport.scrollLeft = nextScrollLeft;
      event.preventDefault();
    };

    root.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      root.removeEventListener('wheel', handleWheel);
    };
  }, [viewportSelector]);

  return (
    <div
      ref={rootRef}
      data-slot='omni-scroller'
      className={cn(
        !viewportSelector &&
          'scroll-auto overflow-x-auto overflow-y-hidden overscroll-x-contain [transform:translate3d(0,0,0)] [will-change:scroll-position]',
        className,
      )}
      {...properties}
    />
  );
};
