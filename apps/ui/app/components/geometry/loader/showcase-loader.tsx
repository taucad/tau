import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ref, RefCallback, RefObject } from 'react';
import {
  probeWebGpuSupport,
  readGraphicsBackendQueryOverride,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import {
  useDocumentHidden,
  useIsIntersecting,
  useReducedMotion,
} from '#components/geometry/loader/metal-morph-playback-gates.js';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { useTheme } from '#hooks/use-theme.js';

/**
 * The React lifecycle every showcase loader shares: resolve a backend, build a controller on the canvas,
 * size it from the root box, steer theme, speed and playback through the controller, and hold a still frame
 * whenever the surface is offscreen, hidden, paused, or the visitor prefers reduced motion.
 */

export type ShowcaseLoaderStatus = 'pending' | 'ready' | 'failed';

export type ShowcaseLoaderTheme = 'dark' | 'light';

/** What a controller has to offer for the hook to drive it. */
export type ShowcaseController = Readonly<{
  ready: Promise<void>;
  play: () => void;
  pause: () => void;
  renderOnce: () => void;
  setSize: (size: { readonly width: number; readonly height: number; readonly pixelRatio: number }) => void;
  setTheme: (theme: ShowcaseLoaderTheme) => void;
  setSpeed: (speed: number) => void;
  dispose: () => void;
}>;

export type ShowcaseLoaderInput = Readonly<{
  canvas: HTMLCanvasElement;
  backend: ResolvedGraphicsBackend;
  theme: ShowcaseLoaderTheme;
}>;

export type UseShowcaseLoaderOptions<Controller extends ShowcaseController> = Readonly<{
  /**
   * Builds the controller. Its identity decides when the renderer is rebuilt, so a caller memoises it on
   * the inputs that need a new renderer and steers everything else through the controller.
   */
  create: (input: ShowcaseLoaderInput) => Controller;
  /** Name for the console when initialisation fails. */
  name: string;
  speed: number;
  isPaused: boolean;
  /** Upper bound for the device pixel ratio the canvas renders at. */
  maxPixelRatio: number;
  onReady?: (controller: Controller) => void;
  onStatusChange?: (status: ShowcaseLoaderStatus) => void;
}>;

export type ShowcaseLoaderBinding<Controller extends ShowcaseController> = Readonly<{
  status: ShowcaseLoaderStatus;
  /** True while the loop is meant to run; the root exposes it as `data-playing`. */
  shouldPlay: boolean;
  /** Callback ref for the element the canvas fills and the observers watch. */
  attachRoot: RefCallback<HTMLDivElement>;
  /** Ref for the canvas the controller draws on. */
  canvasRef: Ref<HTMLCanvasElement>;
  controllerRef: RefObject<Controller | undefined>;
}>;

export const defaultShowcaseMaxPixelRatio = 2;

/** A ref that always holds the latest value, for callbacks a controller keeps beyond one render. */
export const useLatestRef = <Value,>(value: Value): RefObject<Value> => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

/** Drive one showcase controller from React; see the module description. */
export const useShowcaseLoader = <Controller extends ShowcaseController>(
  options: UseShowcaseLoaderOptions<Controller>,
): ShowcaseLoaderBinding<Controller> => {
  const { create, name, speed, isPaused, maxPixelRatio, onReady, onStatusChange } = options;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<Controller | undefined>(undefined);
  const onReadyRef = useRef(onReady);
  const onStatusChangeRef = useRef(onStatusChange);
  const [status, setStatus] = useState<ShowcaseLoaderStatus>('pending');
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const isDocumentHidden = useDocumentHidden();
  const [rootNode, setRootNode] = useState<HTMLDivElement>();
  const isVisible = useIsIntersecting(rootNode);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStatusChangeRef.current = onStatusChange;
  }, [onReady, onStatusChange]);

  // A callback ref as well as the ref object: the observer hooks need the element on the commit that made it.
  const attachRoot = useCallback<RefCallback<HTMLDivElement>>((node) => {
    rootRef.current = node;
    setRootNode(node ?? undefined);
  }, []);

  const publishStatus = useCallback((next: ShowcaseLoaderStatus): void => {
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
    let controller: Controller | undefined;

    const readSize = (): { width: number; height: number; pixelRatio: number } => {
      const rect = root.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        pixelRatio: Math.min(globalThis.devicePixelRatio || 1, maxPixelRatio),
      };
    };

    const start = async (): Promise<void> => {
      const override = readGraphicsBackendQueryOverride();
      const gpuAvailable = await probeWebGpuSupport();
      if (isCancelled()) {
        return;
      }
      // A showcase surface runs on the node renderer: WebGPU whenever an adapter exists, otherwise Three's
      // WebGL 2 backend. The public viewport keeps its own WebGL baseline; see the graphics policy.
      const backend =
        override === undefined
          ? resolveGraphicsBackendPreference('webgpu', gpuAvailable)
          : resolveGraphicsBackendPreference(override, gpuAvailable);
      controller = create({ canvas, backend, theme: theme === 'dark' ? 'dark' : 'light' });
      controllerRef.current = controller;
      controller.setSize(readSize());
      await controller.ready;
      if (isCancelled()) {
        return;
      }
      publishStatus('ready');
      onReadyRef.current?.(controller);
    };

    const boot = async (): Promise<void> => {
      try {
        await start();
      } catch (error) {
        console.error(`${name} failed to initialise`, { error });
        if (!isCancelled()) {
          publishStatus('failed');
        }
      }
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
    // Theme, speed and playback are steered through the controller by the effects below; only `create` and
    // the pixel-ratio bound rebuild the renderer.
  }, [create, maxPixelRatio, name, publishStatus]);

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

  return { status, shouldPlay, attachRoot, canvasRef, controllerRef };
};
