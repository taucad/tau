import {
  probeWebGpuSupport,
  readGraphicsBackendQueryOverride,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import { createMetalMorphLoader } from '#components/geometry/loader/metal-morph-controller.js';
import type {
  MetalMorphBackendInUse,
  MetalMorphLoaderController,
  MetalMorphLoaderTheme,
} from '#components/geometry/loader/metal-morph-controller.js';

/**
 * One liquid-metal renderer for every inline spinner on the page.
 *
 * A browser allows a page sixteen live WebGL 2 contexts and evicts the oldest without warning, so a chat
 * history that mounted one renderer per working row would lose canvases mid-turn. Every spinner also draws
 * the same animation, which makes a second render pure waste. This service therefore runs a single
 * inline-tier controller against a detached canvas and copies each finished frame into the plain 2D canvas
 * each spinner owns: one context, one environment bake and one shader compile per page, and one `drawImage`
 * per visible spinner per frame.
 *
 * Playback follows the same gates as a dedicated loader — it runs only while at least one spinner is on
 * screen with the document visible and motion allowed — and the renderer is released once the page has gone
 * without spinners for {@link idleDisposeDelay}.
 */
export type MetalMorphSpinnerTarget = Readonly<{
  /** The spinner's own canvas; the service owns its backing store size and its pixels. */
  canvas: HTMLCanvasElement;
  /** Current CSS box and device pixel ratio of that canvas. */
  getSize: () => { readonly width: number; readonly height: number; readonly pixelRatio: number };
  /** Whether the spinner is in the viewport; a spinner that is not gets no frames and holds no loop open. */
  isIntersecting: () => boolean;
  /** Called once, after the first frame reaches this canvas, so the host can drop its stand-in. */
  onFirstFrame?: () => void;
}>;

export type MetalMorphSpinnerDiagnostics = Readonly<{
  subscriberCount: number;
  /** Subscribers currently on screen; the loop runs while this is above zero and motion is allowed. */
  activeCount: number;
  /** Zero or one. The invariant this service exists to hold. */
  rendererCount: 0 | 1;
  isLooping: boolean;
  /** Side length, in device pixels, of the shared source canvas. */
  sourceSize: number;
  backend: MetalMorphBackendInUse | undefined;
}>;

export type MetalMorphSpinnerService = Readonly<{
  subscribe: (target: MetalMorphSpinnerTarget) => () => void;
  setTheme: (theme: MetalMorphLoaderTheme) => void;
  /** False under `prefers-reduced-motion`, which holds a single still frame instead of looping. */
  setMotionAllowed: (isAllowed: boolean) => void;
  setDocumentHidden: (isHidden: boolean) => void;
  /** Re-read every subscriber's size and visibility, after a resize or an intersection change. */
  refresh: () => void;
  getDiagnostics: () => MetalMorphSpinnerDiagnostics;
}>;

/** Milliseconds a page may sit without a spinner before the renderer and its context are released. */
const idleDisposeDelay = 30_000;
/** Device-pixel bounds for the shared source; 16 px at a 3× ratio needs 48, and the inline tier stops paying above 128. */
const minimumSourceSize = 32;
const maximumSourceSize = 128;
/** Source sizes step in whole blocks so a resize by a pixel or two does not re-frame the camera. */
const sourceSizeStep = 16;

const resolveSourceSize = (targets: Iterable<MetalMorphSpinnerTarget>): number => {
  let largest = 0;
  for (const target of targets) {
    const { width, height, pixelRatio } = target.getSize();
    largest = Math.max(largest, Math.max(width, height) * pixelRatio);
  }
  const stepped = Math.ceil(largest / sourceSizeStep) * sourceSizeStep;
  return Math.min(maximumSourceSize, Math.max(minimumSourceSize, stepped));
};

type Registration = {
  target: MetalMorphSpinnerTarget;
  context: CanvasRenderingContext2D | undefined;
  hasFrame: boolean;
};

/**
 * Builds an independent service. Production code uses {@link getMetalMorphSpinnerService} so the page keeps
 * one; a test builds its own so it starts from an empty page.
 */
export const createMetalMorphSpinnerService = (): MetalMorphSpinnerService => {
  const registrations = new Set<Registration>();
  let source: HTMLCanvasElement | undefined;
  let controller: MetalMorphLoaderController | undefined;
  let creation: Promise<void> | undefined;
  let theme: MetalMorphLoaderTheme = 'dark';
  let isMotionAllowed = true;
  let isDocumentHidden = false;
  let isLooping = false;
  let sourceSize = minimumSourceSize;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const activeCount = (): number => {
    let count = 0;
    for (const registration of registrations) {
      if (registration.target.isIntersecting()) {
        count += 1;
      }
    }
    return count;
  };

  const shouldPlay = (): boolean => isMotionAllowed && !isDocumentHidden && activeCount() > 0;

  const blit = (): void => {
    if (!source) {
      return;
    }
    // Under reduced motion every spinner takes the still frame, even offscreen, so scrolling one into view
    // never reveals an empty canvas that no later frame will fill.
    const paintsOffscreenSpinners = !isMotionAllowed;
    for (const registration of registrations) {
      if (!paintsOffscreenSpinners && !registration.target.isIntersecting()) {
        continue;
      }
      registration.context ??= registration.target.canvas.getContext('2d') ?? undefined;
      const { context } = registration;
      if (!context) {
        continue;
      }
      const { canvas } = registration.target;
      const { width, height, pixelRatio } = registration.target.getSize();
      const deviceWidth = Math.max(1, Math.round(width * pixelRatio));
      const deviceHeight = Math.max(1, Math.round(height * pixelRatio));
      // Assigning either dimension clears the canvas, so only do it when the box actually changed.
      if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
        canvas.width = deviceWidth;
        canvas.height = deviceHeight;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, deviceWidth, deviceHeight);
      context.drawImage(source, 0, 0, deviceWidth, deviceHeight);
      if (!registration.hasFrame) {
        registration.hasFrame = true;
        registration.target.onFirstFrame?.();
      }
    }
  };

  const applySourceSize = (): void => {
    const next = resolveSourceSize([...registrations].map((registration) => registration.target));
    if (next === sourceSize && controller) {
      return;
    }
    sourceSize = next;
    controller?.setSize({ width: next, height: next, pixelRatio: 1 });
  };

  const refreshPlayback = (): void => {
    if (!controller) {
      return;
    }
    if (shouldPlay()) {
      isLooping = true;
      controller.play();
      return;
    }
    isLooping = false;
    controller.pause();
    // A still frame for reduced motion, and a last frame for anything that just scrolled away.
    controller.renderOnce();
  };

  const disposeController = (): void => {
    controller?.dispose();
    controller = undefined;
    creation = undefined;
    isLooping = false;
    source = undefined;
  };

  const ensureController = async (): Promise<void> => {
    if (controller !== undefined) {
      return;
    }
    if (creation !== undefined) {
      return creation;
    }
    creation = (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = sourceSize;
      canvas.height = sourceSize;
      const override = readGraphicsBackendQueryOverride();
      const isWebGpuAvailable = await probeWebGpuSupport();
      const backend =
        override === undefined
          ? resolveGraphicsBackendPreference('webgpu', isWebGpuAvailable)
          : resolveGraphicsBackendPreference(override, isWebGpuAvailable);
      if (registrations.size === 0) {
        // Everything unsubscribed while the adapter was being probed; do not open a context for nobody.
        return;
      }
      source = canvas;
      const created = createMetalMorphLoader({
        canvas,
        backend,
        theme,
        quality: 'inline',
        onFrame: blit,
      });
      controller = created;
      applySourceSize();
      await created.ready;
      if (controller !== created) {
        // Disposed while warming up.
        created.dispose();
        return;
      }
      refreshPlayback();
    })();
    try {
      await creation;
    } finally {
      creation = undefined;
    }
  };

  const clearIdleTimer = (): void => {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  return {
    subscribe: (target) => {
      const registration: Registration = { target, context: undefined, hasFrame: false };
      registrations.add(registration);
      clearIdleTimer();
      if (controller) {
        applySourceSize();
        refreshPlayback();
      } else {
        void ensureController();
      }
      return () => {
        registrations.delete(registration);
        if (registrations.size === 0) {
          isLooping = false;
          controller?.pause();
          clearIdleTimer();
          idleTimer = setTimeout(disposeController, idleDisposeDelay);
          return;
        }
        applySourceSize();
        refreshPlayback();
      };
    },
    setTheme: (next) => {
      if (next === theme) {
        return;
      }
      theme = next;
      controller?.setTheme(next);
    },
    setMotionAllowed: (isAllowed) => {
      if (isAllowed === isMotionAllowed) {
        return;
      }
      isMotionAllowed = isAllowed;
      refreshPlayback();
    },
    setDocumentHidden: (isHidden) => {
      if (isHidden === isDocumentHidden) {
        return;
      }
      isDocumentHidden = isHidden;
      refreshPlayback();
    },
    refresh: () => {
      applySourceSize();
      refreshPlayback();
    },
    getDiagnostics: () => ({
      subscriberCount: registrations.size,
      activeCount: activeCount(),
      rendererCount: controller ? 1 : 0,
      isLooping,
      sourceSize,
      backend: controller?.getStatistics().backend,
    }),
  };
};

let service: MetalMorphSpinnerService | undefined;

/** The page's one spinner service, created on first use. */
export const getMetalMorphSpinnerService = (): MetalMorphSpinnerService => {
  service ??= createMetalMorphSpinnerService();
  return service;
};
