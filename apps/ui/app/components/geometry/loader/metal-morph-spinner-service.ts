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
  MetalMorphTuningPatch,
} from '#components/geometry/loader/metal-morph-controller.js';

/**
 * One liquid-metal renderer for every inline spinner on the page.
 *
 * A browser allows a page sixteen live WebGL 2 contexts and evicts the oldest without warning, so a chat
 * history that mounted one renderer per working row would lose canvases mid-turn. Every spinner also draws
 * the same animation, which makes a second render pure waste. This service therefore runs a single
 * balanced-tier controller against a detached canvas and copies each finished frame into the plain 2D canvas
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
  /** Frames the renderer has drawn since the service opened it. */
  frameCount: number;
  /**
   * Spinners that were due the latest frame and did not receive it. Zero is the unison the service exists
   * for; anything else names a canvas whose paint failed.
   */
  missedFrameCount: number;
  /** Paints that threw since the service opened its renderer; each one dropped that canvas's context for a retry. */
  paintFailureCount: number;
}>;

export type MetalMorphSpinnerService = Readonly<{
  subscribe: (target: MetalMorphSpinnerTarget) => () => void;
  /**
   * Open the renderer before any spinner has mounted. Coming up costs a few hundred milliseconds of adapter
   * probe, studio environment and shader compile, which is exactly what a spinner's stand-in covers, so a
   * caller that knows a spinner is about to appear can pay it early and have the body on the first frame.
   * Repeat calls are free, and a renderer warmed for a spinner that never arrives is released on the same
   * idle delay as one whose spinners all left.
   */
  warm: (theme: MetalMorphLoaderTheme) => Promise<void>;
  setTheme: (theme: MetalMorphLoaderTheme) => void;
  /** False under `prefers-reduced-motion`, which holds a single still frame instead of looping. */
  setMotionAllowed: (isAllowed: boolean) => void;
  setDocumentHidden: (isHidden: boolean) => void;
  /** Re-read every subscriber's size and visibility, after a resize or an intersection change. */
  refresh: () => void;
  /** Tune the shared renderer; remembered, so a renderer opened later starts with it. */
  tune: (patch: MetalMorphTuningPatch) => void;
  getDiagnostics: () => MetalMorphSpinnerDiagnostics;
}>;

/** Milliseconds a page may sit without a spinner before the renderer and its context are released. */
const idleDisposeDelay = 30_000;
/**
 * Render the shared source this many times finer than the largest spinner's own device box, and let each
 * `drawImage` downsample. A glyph-size surface has too few device pixels to resolve the body's creases against
 * its bright rim, so it reads as a pale blob with a light fringe. A dedicated loader spends its own pixels on
 * that; here the cost is paid once, on the one surface every spinner copies.
 */
const sourceSupersample = 2;
/** Device-pixel bounds for the shared source; a 12 px slot at a 2× ratio and this supersample asks for 48. */
const minimumSourceSize = 64;
const maximumSourceSize = 256;
/** Source sizes step in whole blocks so a resize by a pixel or two does not re-frame the camera. */
const sourceSizeStep = 32;

const resolveSourceSize = (targets: Iterable<MetalMorphSpinnerTarget>): number => {
  let largest = 0;
  for (const target of targets) {
    const { width, height, pixelRatio } = target.getSize();
    largest = Math.max(largest, Math.max(width, height) * pixelRatio);
  }
  const stepped = Math.ceil((largest * sourceSupersample) / sourceSizeStep) * sourceSizeStep;
  return Math.min(maximumSourceSize, Math.max(minimumSourceSize, stepped));
};

type Registration = {
  target: MetalMorphSpinnerTarget;
  context: CanvasRenderingContext2D | undefined;
  hasFrame: boolean;
  /** The frame this canvas last received; compared with the frame count to find a spinner that fell behind. */
  lastFrame: number;
};

/**
 * Builds an independent service. Production code uses {@link getMetalMorphSpinnerService} so the page keeps
 * one; a test builds its own so it starts from an empty page.
 */
export const createMetalMorphSpinnerService = (): MetalMorphSpinnerService => {
  const registrations = new Set<Registration>();
  let source: HTMLCanvasElement | undefined;
  /**
   * One 2D copy of the renderer's drawing buffer per frame, which every spinner then copies. Reading the
   * WebGL canvas once keeps the fan-out on the plain canvas-to-canvas path, rather than asking the browser
   * for a fresh snapshot of a GPU surface per spinner, which some engines serve stale under load.
   */
  let snapshot: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | undefined;
  let hasTriedSnapshot = false;
  let frameCount = 0;
  let missedFrameCount = 0;
  let paintFailureCount = 0;
  let controller: MetalMorphLoaderController | undefined;
  let creation: Promise<void> | undefined;
  let theme: MetalMorphLoaderTheme = 'dark';
  /** Every tuning patch so far, folded together, for a renderer opened after they were made. */
  let tuning: MetalMorphTuningPatch = {};
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

  /** The frame every spinner copies: the renderer's buffer read once, or the buffer itself where 2D is unavailable. */
  const takeSnapshot = (rendered: HTMLCanvasElement): HTMLCanvasElement => {
    if (snapshot === undefined && !hasTriedSnapshot) {
      hasTriedSnapshot = true;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d') ?? undefined;
      if (context) {
        snapshot = { canvas, context };
      }
    }
    if (snapshot === undefined) {
      return rendered;
    }
    if (snapshot.canvas.width !== rendered.width || snapshot.canvas.height !== rendered.height) {
      snapshot.canvas.width = rendered.width;
      snapshot.canvas.height = rendered.height;
    }
    snapshot.context.clearRect(0, 0, rendered.width, rendered.height);
    snapshot.context.drawImage(rendered, 0, 0);
    return snapshot.canvas;
  };

  /** Copy `frame` into one spinner's canvas; false when the paint threw, in which case its context is dropped for a retry. */
  const paint = (registration: Registration, frame: HTMLCanvasElement): boolean => {
    try {
      registration.context ??= registration.target.canvas.getContext('2d') ?? undefined;
      const { context } = registration;
      if (!context) {
        return false;
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
      context.drawImage(frame, 0, 0, deviceWidth, deviceHeight);
      return true;
    } catch {
      // A canvas whose backing store is gone is that canvas's problem: drop its context so the next frame
      // asks for a fresh one, and let the frame reach every other spinner.
      registration.context = undefined;
      paintFailureCount += 1;
      return false;
    }
  };

  const blit = (): void => {
    if (!source) {
      return;
    }
    frameCount += 1;
    const frame = takeSnapshot(source);
    // Under reduced motion every spinner takes the still frame, even offscreen, so scrolling one into view
    // never reveals an empty canvas that no later frame will fill.
    const paintsOffscreenSpinners = !isMotionAllowed;
    let missed = 0;
    for (const registration of registrations) {
      if (!paintsOffscreenSpinners && !registration.target.isIntersecting()) {
        continue;
      }
      if (!paint(registration, frame)) {
        missed += 1;
        continue;
      }
      registration.lastFrame = frameCount;
      if (!registration.hasFrame) {
        registration.hasFrame = true;
        registration.target.onFirstFrame?.();
      }
    }
    missedFrameCount = missed;
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
    snapshot = undefined;
    hasTriedSnapshot = false;
    frameCount = 0;
    missedFrameCount = 0;
    paintFailureCount = 0;
  };

  const ensureController = async (isWarming = false): Promise<void> => {
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
      if (registrations.size === 0 && !isWarming) {
        // Everything unsubscribed while the adapter was being probed; do not open a context for nobody.
        return;
      }
      source = canvas;
      const created = createMetalMorphLoader({
        canvas,
        backend,
        theme,
        quality: 'balanced',
        onFrame: blit,
      });
      controller = created;
      if (Object.keys(tuning).length > 0) {
        created.tune(tuning);
      }
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
      const registration: Registration = { target, context: undefined, hasFrame: false, lastFrame: 0 };
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
    warm: async (next) => {
      theme = next;
      controller?.setTheme(next);
      clearIdleTimer();
      await ensureController(true);
      if (registrations.size === 0) {
        // Nothing has subscribed, so nothing will release this renderer; hold it on the same idle delay.
        idleTimer = setTimeout(disposeController, idleDisposeDelay);
      }
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
    tune: (patch) => {
      tuning = {
        ...tuning,
        ...patch,
        material: { ...tuning.material, ...patch.material },
        timing: { ...tuning.timing, ...patch.timing },
        bloom: { ...tuning.bloom, ...patch.bloom },
        environment: { ...tuning.environment, ...patch.environment },
      };
      controller?.tune(patch);
    },
    getDiagnostics: () => ({
      subscriberCount: registrations.size,
      activeCount: activeCount(),
      rendererCount: controller ? 1 : 0,
      isLooping,
      sourceSize,
      backend: controller?.getStatistics().backend,
      frameCount,
      missedFrameCount,
      paintFailureCount,
    }),
  };
};

let service: MetalMorphSpinnerService | undefined;

/** The page's one spinner service, created on first use. */
export const getMetalMorphSpinnerService = (): MetalMorphSpinnerService => {
  service ??= createMetalMorphSpinnerService();
  return service;
};
