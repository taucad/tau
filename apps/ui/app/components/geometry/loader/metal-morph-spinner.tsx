import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefCallback } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import {
  useDocumentHidden,
  useIsIntersecting,
  useReducedMotion,
} from '#components/geometry/loader/metal-morph-playback-gates.js';
import { getMetalMorphSpinnerService } from '#components/geometry/loader/metal-morph-spinner-service.js';
import { useTheme } from '#hooks/use-theme.js';

export type MetalMorphSpinnerProperties = Readonly<{
  className?: string;
  /** Stands in until the first frame arrives; without one the spinner is simply blank while it warms up. */
  fallback?: React.ReactNode;
}>;

/** Upper bound for the device pixel ratio a spinner asks the shared source to cover. */
const maxPixelRatio = 2;

/**
 * One inline liquid-metal spinner, painted from the page's shared renderer.
 *
 * Unlike {@link import('./metal-morph-loader.js').MetalMorphLoader} this owns no renderer and no GPU context:
 * it registers a plain 2D canvas with the spinner service, which copies every frame it draws into each
 * spinner on screen. A page may therefore show as many of these as it likes. It is decorative — the row it
 * sits in carries the status in its own text — so it stays out of the accessibility tree.
 */
export function MetalMorphSpinner({ className, fallback }: MetalMorphSpinnerProperties): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isIntersectingRef = useRef(false);
  const [rootNode, setRootNode] = useState<HTMLSpanElement>();
  const [hasFrame, setHasFrame] = useState(false);
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const isDocumentHidden = useDocumentHidden();
  const isIntersecting = useIsIntersecting(rootNode);

  const attachRoot = useCallback<RefCallback<HTMLSpanElement>>((node) => {
    setRootNode(node ?? undefined);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const service = getMetalMorphSpinnerService();
    // The service reads visibility synchronously while it paints, so it comes from a ref the effect below
    // keeps current rather than from the render that observed the change.
    const unsubscribe = service.subscribe({
      canvas,
      getSize: () => {
        const rect = canvas.getBoundingClientRect();
        return {
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
          pixelRatio: Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio),
        };
      },
      isIntersecting: () => isIntersectingRef.current,
      onFirstFrame: () => {
        setHasFrame(true);
      },
    });
    const observer = new ResizeObserver(() => {
      service.refresh();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    isIntersectingRef.current = isIntersecting;
    getMetalMorphSpinnerService().refresh();
  }, [isIntersecting]);

  useEffect(() => {
    getMetalMorphSpinnerService().setTheme(theme === 'dark' ? 'dark' : 'light');
  }, [theme]);

  useEffect(() => {
    getMetalMorphSpinnerService().setMotionAllowed(!reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    getMetalMorphSpinnerService().setDocumentHidden(isDocumentHidden);
  }, [isDocumentHidden]);

  return (
    <span
      ref={attachRoot}
      aria-hidden='true'
      data-state={hasFrame ? 'ready' : 'pending'}
      className={cn('relative inline-block overflow-hidden', className)}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'block size-full transition-opacity duration-300 ease-out',
          hasFrame ? 'opacity-100' : 'opacity-0',
        )}
      />
      {hasFrame ? null : <span className='absolute inset-0 flex items-center justify-center'>{fallback}</span>}
    </span>
  );
}
