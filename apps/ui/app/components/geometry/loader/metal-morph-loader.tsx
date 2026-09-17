import { useCallback, useRef } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { createMetalMorphLoader } from '#components/geometry/loader/metal-morph-controller.js';
import type {
  MetalMorphLoaderController,
  MetalMorphLoaderQuality,
  MetalMorphSequenceState,
} from '#components/geometry/loader/metal-morph-controller.js';
import type { MetalMorphShapeId } from '#components/geometry/loader/metal-morph-shapes.js';
import {
  defaultShowcaseMaxPixelRatio,
  useLatestRef,
  useShowcaseLoader,
} from '#components/geometry/loader/showcase-loader.js';
import type { ShowcaseLoaderInput, ShowcaseLoaderStatus } from '#components/geometry/loader/showcase-loader.js';
import { Loader } from '#components/ui/loader.js';

export type MetalMorphLoaderStatus = ShowcaseLoaderStatus;

export type MetalMorphLoaderProperties = Readonly<{
  className?: string;
  /** Accessible name. The default names the loading state it stands for. */
  label?: string;
  /** `status` announces a busy state, the default for a real loading indicator; `img` describes a showcase. */
  semantic?: 'status' | 'img';
  /** Cost tier: `inline` for spinners, `balanced` for mid-size surfaces, `high` for hero surfaces. */
  quality?: MetalMorphLoaderQuality;
  /** Deterministic sequencing seed; omit for a fresh random loop. */
  seed?: number;
  /** Playback rate multiplier. */
  speed?: number;
  initialShape?: MetalMorphShapeId;
  /** Hold the loop on its current pose; the pose still repaints on theme changes. */
  isPaused?: boolean;
  /** Upper bound for the device pixel ratio the canvas renders at. */
  maxPixelRatio?: number;
  onSequenceChange?: (state: MetalMorphSequenceState) => void;
  /** Receives the live controller once the first frame is on the canvas. */
  onReady?: (controller: MetalMorphLoaderController) => void;
  onStatusChange?: (status: MetalMorphLoaderStatus) => void;
}>;

const defaultLabel = 'Loading';

/**
 * A liquid-metal surface with a renderer of its own: one chrome body that flows between five geometric forms,
 * drawn by the WebGPU node renderer (WebGL 2 fallback) and paused whenever it is offscreen, hidden, held, or
 * the visitor prefers reduced motion, in which case a single still frame stands in.
 *
 * This owns a GPU context, so it suits a surface large enough to justify one — the showcase stage, a hero.
 * An inline spinner uses {@link import('./metal-morph-spinner.js').MetalMorphSpinner} instead, which shares
 * one renderer across every spinner on the page.
 */
export function MetalMorphLoader({
  className,
  label = defaultLabel,
  semantic = 'status',
  quality = 'high',
  seed,
  speed = 1,
  initialShape,
  isPaused = false,
  maxPixelRatio = defaultShowcaseMaxPixelRatio,
  onSequenceChange,
  onReady,
  onStatusChange,
}: MetalMorphLoaderProperties): React.JSX.Element {
  const onSequenceChangeRef = useLatestRef(onSequenceChange);
  // Speed only seeds the controller; later changes reach it through `setSpeed` without a rebuild.
  const initialSpeedRef = useRef(speed);

  // Only identity inputs rebuild the renderer; theme, speed and playback are steered through the controller.
  const create = useCallback(
    ({ canvas, backend, theme }: ShowcaseLoaderInput): MetalMorphLoaderController =>
      createMetalMorphLoader({
        canvas,
        backend,
        theme,
        quality,
        seed,
        speed: initialSpeedRef.current,
        initialShape,
        onSequenceChange: (state) => {
          onSequenceChangeRef.current?.(state);
        },
      }),
    [initialShape, onSequenceChangeRef, quality, seed],
  );

  const { status, shouldPlay, attachRoot, canvasRef } = useShowcaseLoader({
    create,
    name: 'Metal morph loader',
    speed,
    isPaused,
    maxPixelRatio,
    onReady,
    onStatusChange,
  });

  return (
    <div
      ref={attachRoot}
      role={semantic}
      aria-label={label}
      aria-busy={semantic === 'status' ? true : undefined}
      data-state={status}
      data-playing={shouldPlay ? 'true' : 'false'}
      className={cn('relative overflow-hidden', className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden='true'
        className={cn(
          'block size-full transition-opacity duration-300 ease-out',
          status === 'ready' ? 'opacity-100' : 'opacity-0',
        )}
      />
      {status === 'ready' ? null : (
        <div className='absolute inset-0 flex items-center justify-center'>
          <Loader className='size-6 text-muted-foreground' />
        </div>
      )}
    </div>
  );
}
