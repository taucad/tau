import { useCallback, useRef } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import { createGlassPrismLoader } from '#components/geometry/loader/glass-prism-controller.js';
import type {
  GlassPrismLoaderController,
  GlassPrismLoaderQuality,
  GlassPrismSequenceState,
} from '#components/geometry/loader/glass-prism-controller.js';
import type { GlassPrismShapeId } from '#components/geometry/loader/glass-prism-shapes.js';
import {
  defaultShowcaseMaxPixelRatio,
  useLatestRef,
  useShowcaseLoader,
} from '#components/geometry/loader/showcase-loader.js';
import type { ShowcaseLoaderInput, ShowcaseLoaderStatus } from '#components/geometry/loader/showcase-loader.js';
import { Loader } from '#components/ui/loader.js';

export type GlassPrismLoaderStatus = ShowcaseLoaderStatus;

export type GlassPrismLoaderProperties = Readonly<{
  className?: string;
  /** Accessible name. The default names the loading state it stands for. */
  label?: string;
  /** `status` announces a busy state, the default for a real loading indicator; `img` describes a showcase. */
  semantic?: 'status' | 'img';
  /** Cost tier: `inline` for spinners, `balanced` for mid-size surfaces, `high` for hero surfaces. */
  quality?: GlassPrismLoaderQuality;
  /** Deterministic sequencing seed; omit for a fresh random loop. */
  seed?: number;
  /** Playback rate multiplier. */
  speed?: number;
  initialShape?: GlassPrismShapeId;
  /** Hold the loop on its current pose; the pose still repaints on theme changes. */
  isPaused?: boolean;
  /** Upper bound for the device pixel ratio the canvas renders at. */
  maxPixelRatio?: number;
  onSequenceChange?: (state: GlassPrismSequenceState) => void;
  /** Receives the live controller once the first frame is on the canvas. */
  onReady?: (controller: GlassPrismLoaderController) => void;
  onStatusChange?: (status: GlassPrismLoaderStatus) => void;
}>;

const defaultLabel = 'Loading';

/**
 * A glass surface with a renderer of its own: a white beam meets a glass body that flows between five
 * morphologies, and leaves it as a spectrum traced through the body's cross-section every frame. Drawn by the
 * WebGPU node renderer (WebGL 2 fallback) and paused whenever it is offscreen, hidden, held, or the visitor
 * prefers reduced motion, in which case a single still frame stands in.
 *
 * Like {@link import('./metal-morph-loader.js').MetalMorphLoader} this owns a GPU context, so it suits a
 * surface large enough to justify one.
 */
export function GlassPrismLoader({
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
}: GlassPrismLoaderProperties): React.JSX.Element {
  const onSequenceChangeRef = useLatestRef(onSequenceChange);
  // Speed only seeds the controller; later changes reach it through `setSpeed` without a rebuild.
  const initialSpeedRef = useRef(speed);

  // Only identity inputs rebuild the renderer; theme, speed and playback are steered through the controller.
  const create = useCallback(
    ({ canvas, backend, theme }: ShowcaseLoaderInput): GlassPrismLoaderController =>
      createGlassPrismLoader({
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
    name: 'Glass prism loader',
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
