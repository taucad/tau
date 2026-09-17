import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@taucad/ui/utils/cn';
import {
  probeWebGpuSupport,
  readGraphicsBackendQueryOverride,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import { createMetalMorphLoader } from '#components/geometry/loader/metal-morph-controller.js';
import type {
  MetalMorphLoaderController,
  MetalMorphLoaderQuality,
  MetalMorphSequenceState,
} from '#components/geometry/loader/metal-morph-controller.js';
import type { MetalMorphShapeId } from '#components/geometry/loader/metal-morph-shapes.js';
import { Loader } from '#components/ui/loader.js';
import { useTheme } from '#hooks/use-theme.js';

export type MetalMorphLoaderStatus = 'pending' | 'ready' | 'failed';

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

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (callback: () => void): (() => void) => {
  const query = globalThis.matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => {
    query.removeEventListener('change', callback);
  };
};
const getMotion = (): boolean => globalThis.matchMedia(motionQuery).matches;
const serverMotion = (): boolean => true;

const subscribeDocumentVisibility = (callback: () => void): (() => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => {
    document.removeEventListener('visibilitychange', callback);
  };
};
const getDocumentHidden = (): boolean => document.hidden;
const serverDocumentHidden = (): boolean => false;

const defaultLabel = 'Loading';
const defaultMaxPixelRatio = 2;

/**
 * Tau's loading indicator: one chrome body that flows between five geometric forms, rendered with the
 * WebGPU node renderer (WebGL 2 fallback) and paused whenever it is offscreen, hidden, held, or the visitor
 * prefers reduced motion, in which case a single still frame stands in.
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
  maxPixelRatio = defaultMaxPixelRatio,
  onSequenceChange,
  onReady,
  onStatusChange,
}: MetalMorphLoaderProperties): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<MetalMorphLoaderController | undefined>(undefined);
  const onSequenceChangeRef = useRef(onSequenceChange);
  const onReadyRef = useRef(onReady);
  const onStatusChangeRef = useRef(onStatusChange);
  const [status, setStatus] = useState<MetalMorphLoaderStatus>('pending');
  const [isVisible, setIsVisible] = useState(false);
  const { theme } = useTheme();
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotion, serverMotion);
  const isDocumentHidden = useSyncExternalStore(subscribeDocumentVisibility, getDocumentHidden, serverDocumentHidden);

  useEffect(() => {
    onSequenceChangeRef.current = onSequenceChange;
    onReadyRef.current = onReady;
    onStatusChangeRef.current = onStatusChange;
  }, [onReady, onSequenceChange, onStatusChange]);

  const publishStatus = useCallback((next: MetalMorphLoaderStatus): void => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) {
      return;
    }
    // Read through a function so a cleanup that ran during an `await` is observed rather than narrowed away.
    const lifecycle = { cancelled: false };
    const isCancelled = (): boolean => lifecycle.cancelled;
    let controller: MetalMorphLoaderController | undefined;

    const readSize = (): { width: number; height: number; pixelRatio: number } => {
      const rect = root.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        pixelRatio: Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio),
      };
    };

    const boot = async (): Promise<void> => {
      try {
        await start();
      } catch (error) {
        console.error('Metal morph loader failed to initialise', { error });
        if (!isCancelled()) {
          publishStatus('failed');
        }
      }
    };

    const start = async (): Promise<void> => {
      const override = readGraphicsBackendQueryOverride();
      const gpuAvailable = await probeWebGpuSupport();
      if (isCancelled()) {
        return;
      }
      // The loader is a showcase surface on the node renderer: WebGPU whenever an adapter exists, otherwise
      // Three's WebGL 2 backend. The public viewport keeps its own WebGL baseline; see the graphics policy.
      const backend =
        override === undefined
          ? resolveGraphicsBackendPreference('webgpu', gpuAvailable)
          : resolveGraphicsBackendPreference(override, gpuAvailable);
      controller = createMetalMorphLoader({
        canvas,
        backend,
        theme: theme === 'dark' ? 'dark' : 'light',
        quality,
        seed,
        speed,
        initialShape,
        onSequenceChange: (state) => {
          onSequenceChangeRef.current?.(state);
        },
      });
      controllerRef.current = controller;
      controller.setSize(readSize());
      await controller.ready;
      if (isCancelled()) {
        return;
      }
      publishStatus('ready');
      onReadyRef.current?.(controller);
    };

    const observer = new ResizeObserver(() => {
      controller?.setSize(readSize());
    });
    observer.observe(root);

    void boot();

    return () => {
      lifecycle.cancelled = true;
      observer.disconnect();
      controllerRef.current = undefined;
      controller?.dispose();
    };
    // Theme, speed and playback are steered through the controller by the effects below; only identity inputs
    // rebuild the renderer.
  }, [initialShape, maxPixelRatio, publishStatus, quality, seed]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    controllerRef.current?.setTheme(theme === 'dark' ? 'dark' : 'light');
  }, [status, theme]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    controllerRef.current?.setSpeed(speed);
  }, [speed, status]);

  const shouldPlay = status === 'ready' && isVisible && !isDocumentHidden && !isPaused && !reducedMotion;

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || status !== 'ready') {
      return;
    }
    if (shouldPlay) {
      controller.play();
      return;
    }
    controller.pause();
    controller.renderOnce();
  }, [shouldPlay, status]);

  return (
    <div
      ref={rootRef}
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
