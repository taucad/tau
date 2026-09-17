import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { Loader } from '#components/ui/loader.js';
import { useTheme } from '#hooks/use-theme.js';

export type MetalMorphLoaderStatus = 'pending' | 'ready' | 'failed';

export type MetalMorphLoaderProperties = Readonly<{
  className?: string;
  /** Accessible name. The default names the loading state it stands for. */
  label?: string;
  /**
   * `status` announces a busy state, the default for a real loading indicator; `img` describes a showcase;
   * `presentation` hides the loader from assistive technology, for a row that already carries its own status.
   */
  semantic?: 'status' | 'img' | 'presentation';
  /** Stands in until the first frame is on the canvas; the default suits a surface of at least 24 px. */
  fallback?: React.ReactNode;
  /** Cost tier: `balanced` for spinners and mid-size surfaces, `high` for hero surfaces. */
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
  /**
   * Render this many times finer than the display, and let the browser downsample on present. A glyph-size
   * surface has too few device pixels to resolve the body's creases against its bright rim, so it reads as a
   * pale blob with a light fringe; supersampling spends pixels rather than lighting to sharpen it.
   */
  supersample?: number;
  /**
   * Share one warm renderer, and one running sequence, under this key across mounts.
   *
   * Without it every mount builds a renderer, compiles the shader and starts the walk again, so a row that
   * comes and goes shows its stand-in each time and always replays the same opening. A pooled loader survives
   * unmount paused on its last pose: the next mount adopts it before the browser paints and the walk carries
   * on. The key stands for one configuration, so callers that pass the same key must pass the same tier,
   * seed and sampling; a second mount asking for a held key gets a private renderer instead.
   */
  poolKey?: string;
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

/** A warm renderer kept past unmount, so the next mount has a body on its first painted frame. */
type PooledLoader = Readonly<{
  canvas: HTMLCanvasElement;
  controller: MetalMorphLoaderController;
  /** The current holder's sequence listener, so events follow the mount rather than whoever built the entry. */
  sequence: { publish?: (state: MetalMorphSequenceState) => void };
  /** Whether a mounted loader holds it: one canvas is never in two places. */
  holder: { isHeld: boolean };
}>;

/** What a pooled loader is built with; see {@link MetalMorphLoaderProperties.poolKey}. */
export type MetalMorphLoaderPoolRequest = Readonly<{
  poolKey: string;
  theme: 'dark' | 'light';
  quality?: MetalMorphLoaderQuality;
  seed?: number;
  speed?: number;
  initialShape?: MetalMorphShapeId;
}>;

const loaderPool = new Map<string, PooledLoader>();
const loadersInFlight = new Map<string, Promise<PooledLoader>>();
/** Canvas side, in pixels, a pooled loader warms at before a holder resizes it to its own box. */
const warmCanvasSide = 96;

const resolveLoaderBackend = async (): Promise<ResolvedGraphicsBackend> => {
  const override = readGraphicsBackendQueryOverride();
  const gpuAvailable = await probeWebGpuSupport();
  // The loader is a showcase surface on the node renderer: WebGPU whenever an adapter exists, otherwise
  // Three's WebGL 2 backend. The public viewport keeps its own WebGL baseline; see the graphics policy.
  return override === undefined
    ? resolveGraphicsBackendPreference('webgpu', gpuAvailable)
    : resolveGraphicsBackendPreference(override, gpuAvailable);
};

/**
 * Every renderer draws into a canvas of its own making, pooled or not, and that canvas joins the page only
 * once it holds a frame, which is why it needs no reveal of its own: the stand-in covers the wait and the
 * body is there in the frame the canvas arrives. A canvas React rendered could not be handed between mounts.
 */
const createLoaderCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.className = 'block size-full';
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
};

const buildPooledLoader = async (request: MetalMorphLoaderPoolRequest): Promise<PooledLoader> => {
  const canvas = createLoaderCanvas();
  const sequence: PooledLoader['sequence'] = {};
  const controller = createMetalMorphLoader({
    canvas,
    backend: await resolveLoaderBackend(),
    theme: request.theme,
    quality: request.quality,
    seed: request.seed,
    speed: request.speed,
    initialShape: request.initialShape,
    onSequenceChange: (state) => {
      sequence.publish?.(state);
    },
  });
  // Warm through the first frame: the shader compile and the environment are what a cold mount waits for.
  controller.setSize({ width: warmCanvasSide, height: warmCanvasSide, pixelRatio: 1 });
  await controller.ready;
  const entry: PooledLoader = { canvas, controller, sequence, holder: { isHeld: false } };
  loaderPool.set(request.poolKey, entry);
  return entry;
};

const requestPooledLoader = async (request: MetalMorphLoaderPoolRequest): Promise<PooledLoader> => {
  const warm = loaderPool.get(request.poolKey);
  if (warm) {
    return warm;
  }
  const inFlight = loadersInFlight.get(request.poolKey);
  if (inFlight) {
    return inFlight;
  }
  const building = (async () => {
    try {
      return await buildPooledLoader(request);
    } finally {
      loadersInFlight.delete(request.poolKey);
    }
  })();
  loadersInFlight.set(request.poolKey, building);
  return building;
};

/** Claim the shared renderer for a key, building it when it does not exist yet; `undefined` when held. */
const claimOrBuildPooledLoader = async (request: MetalMorphLoaderPoolRequest): Promise<PooledLoader | undefined> => {
  const entry = await requestPooledLoader(request);
  if (entry.holder.isHeld) {
    return undefined;
  }
  entry.holder.isHeld = true;
  return entry;
};

/** A renderer of this mount's own, drawn into the canvas React rendered for it and disposed with it. */
const buildOwnedLoader = async (
  options: Readonly<{
    canvas: HTMLCanvasElement;
    request: Omit<MetalMorphLoaderPoolRequest, 'poolKey'>;
    size: () => { width: number; height: number; pixelRatio: number };
    publishSequence: (state: MetalMorphSequenceState) => void;
    onCreated: (controller: MetalMorphLoaderController) => void;
  }>,
): Promise<MetalMorphLoaderController> => {
  const controller = createMetalMorphLoader({
    canvas: options.canvas,
    backend: await resolveLoaderBackend(),
    theme: options.request.theme,
    quality: options.request.quality,
    seed: options.request.seed,
    speed: options.request.speed,
    initialShape: options.request.initialShape,
    onSequenceChange: options.publishSequence,
  });
  // Registered before the first frame, so a resize while it warms up still reaches it.
  options.onCreated(controller);
  controller.setSize(options.size());
  await controller.ready;
  return controller;
};

/** Canvas box and device pixel ratio a host element asks its renderer for. */
const readHostSize = (
  root: HTMLElement,
  maxPixelRatio: number,
  supersample: number,
): { width: number; height: number; pixelRatio: number } => {
  const rect = root.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    pixelRatio: Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio) * supersample,
  };
};

/** Hand a pooled renderer back, paused on its pose, which is where the next mount picks the walk up. */
const releasePooledLoader = (entry: PooledLoader): void => {
  entry.sequence.publish = undefined;
  entry.controller.pause();
  entry.canvas.remove();
  entry.holder.isHeld = false;
};

/** Claim a warm, free entry without yielding, so the adopting mount can paint the body in the same frame. */
const claimPooledLoader = (poolKey: string): PooledLoader | undefined => {
  const entry = loaderPool.get(poolKey);
  if (!entry || entry.holder.isHeld) {
    return undefined;
  }
  entry.holder.isHeld = true;
  return entry;
};

/**
 * Build a pooled loader now, so the mount that needs it has nothing to wait for. A renderer, its studio
 * environment and the compiled shader take a few hundred milliseconds to come up; warm the key as soon as the
 * surface that will show it becomes likely, not when it appears.
 */
export const warmMetalMorphLoader = async (request: MetalMorphLoaderPoolRequest): Promise<void> => {
  if (typeof document === 'undefined') {
    return;
  }
  try {
    await requestPooledLoader(request);
  } catch (error) {
    console.error('Metal morph loader failed to warm', { error });
  }
};

/**
 * Tau's loading indicator: one chrome body that flows between five geometric forms, rendered with the
 * WebGPU node renderer (WebGL 2 fallback) and paused whenever it is offscreen, hidden, held, or the visitor
 * prefers reduced motion, in which case a single still frame stands in.
 */
export function MetalMorphLoader({
  className,
  label = defaultLabel,
  semantic = 'status',
  fallback,
  quality = 'high',
  seed,
  speed = 1,
  initialShape,
  isPaused = false,
  maxPixelRatio = defaultMaxPixelRatio,
  supersample = 1,
  poolKey,
  onSequenceChange,
  onReady,
  onStatusChange,
}: MetalMorphLoaderProperties): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
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

  // A layout effect, so a pooled loader that is already warm is adopted before the browser paints and the row
  // shows the body on its first frame rather than the stand-in.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    // Read through a function so a cleanup that ran during an `await` is observed rather than narrowed away.
    const lifecycle = { cancelled: false };
    const isCancelled = (): boolean => lifecycle.cancelled;
    let pooled: PooledLoader | undefined;
    let owned: { controller: MetalMorphLoaderController; canvas: HTMLCanvasElement } | undefined;
    const resolvedTheme: MetalMorphLoaderPoolRequest['theme'] = theme === 'dark' ? 'dark' : 'light';

    const readSize = (): { width: number; height: number; pixelRatio: number } =>
      readHostSize(root, maxPixelRatio, supersample);

    const start = (controller: MetalMorphLoaderController): void => {
      controllerRef.current = controller;
      controller.setSize(readSize());
      publishStatus('ready');
      onReadyRef.current?.(controller);
    };

    const adopt = (entry: PooledLoader): void => {
      pooled = entry;
      entry.sequence.publish = (state) => {
        onSequenceChangeRef.current?.(state);
      };
      root.append(entry.canvas);
      // The pose may have been drawn under the other theme while the entry sat idle; both calls are cheap when
      // nothing changed, and they land before the paint that shows the adopted canvas.
      entry.controller.setTheme(resolvedTheme);
      entry.controller.renderOnce();
      start(entry.controller);
    };

    const boot = async (): Promise<void> => {
      try {
        const request = { theme: resolvedTheme, quality, seed, speed, initialShape };
        const entry = poolKey === undefined ? undefined : await claimOrBuildPooledLoader({ poolKey, ...request });
        if (entry) {
          if (isCancelled()) {
            releasePooledLoader(entry);
            return;
          }
          adopt(entry);
          return;
        }
        // Either no pool was asked for, or another mount holds its renderer; this one gets its own.
        const canvas = createLoaderCanvas();
        const controller = await buildOwnedLoader({
          canvas,
          request,
          size: readSize,
          publishSequence: (state) => {
            onSequenceChangeRef.current?.(state);
          },
          onCreated: (created) => {
            controllerRef.current = created;
          },
        });
        if (isCancelled()) {
          controller.dispose();
          return;
        }
        owned = { controller, canvas };
        root.append(canvas);
        start(controller);
      } catch (error) {
        console.error('Metal morph loader failed to initialise', { error });
        if (!isCancelled()) {
          publishStatus('failed');
        }
      }
    };

    const warm = poolKey === undefined ? undefined : claimPooledLoader(poolKey);
    if (warm) {
      adopt(warm);
    } else {
      void boot();
    }

    const observer = new ResizeObserver(() => {
      controllerRef.current?.setSize(readSize());
    });
    observer.observe(root);

    return () => {
      lifecycle.cancelled = true;
      observer.disconnect();
      controllerRef.current = undefined;
      if (pooled) {
        releasePooledLoader(pooled);
        return;
      }
      owned?.canvas.remove();
      owned?.controller.dispose();
    };
    // Theme, speed and playback are steered through the controller by the effects below; only identity inputs
    // rebuild the renderer.
  }, [initialShape, maxPixelRatio, poolKey, publishStatus, quality, seed, supersample]);

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

  const isDecorative = semantic === 'presentation';

  return (
    <div
      ref={rootRef}
      role={isDecorative ? undefined : semantic}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : label}
      aria-busy={semantic === 'status' ? true : undefined}
      data-state={status}
      data-playing={shouldPlay ? 'true' : 'false'}
      className={cn('relative overflow-hidden', className)}
    >
      {status === 'ready' ? undefined : (
        <div className='absolute inset-0 flex items-center justify-center'>
          {fallback ?? <Loader className='size-6 text-muted-foreground' />}
        </div>
      )}
    </div>
  );
}
