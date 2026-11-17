import type { ErrorEvent } from '@sentry/react';
import { isGraphicsContextUnavailableError } from '@taucad/viewer/graphics/graphics-backend';

/** Fingerprint shared by browsers that give no WebGL 2 context, so they group apart from errors in Tau's own code. */
const graphicsContextUnavailableFingerprint = ['graphics-context-unavailable'] as const;

/**
 * Decorate an event for a browser that gave no WebGL 2 context (hardware acceleration off, a blocklisted GPU), as every
 * path to Sentry does (the SDK's `beforeSend` and an event sent without it): it still reports, as one `warning` group
 * of its own, so the browsers that cannot draw are counted without reading as a fault in Tau (TAU-UI-1M, TAU-UI-1N).
 * Any other event is returned unchanged.
 *
 * @param event - The event about to be sent.
 * @param error - The reported value.
 * @returns The decorated event.
 * @public
 */
export const decorateForGraphicsContextUnavailable = (event: ErrorEvent, error: unknown): ErrorEvent =>
  isGraphicsContextUnavailableError(error)
    ? {
        ...event,
        level: 'warning',
        fingerprint: [...graphicsContextUnavailableFingerprint],
        contexts: { ...event.contexts, 'tau.webgl': probeWebGlAvailability() },
      }
    : event;

/** Whether a fresh canvas gets a context of `type`; the context is released at once, so the probe holds none. */
const freshCanvasGets = (type: 'webgl2' | 'webgl'): boolean | 'threw' => {
  try {
    const canvas = document.createElement('canvas');
    const context = (type === 'webgl2' ? canvas.getContext('webgl2') : canvas.getContext('webgl')) ?? undefined;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return context !== undefined;
  } catch {
    return 'threw';
  }
};

/**
 * What the browser gives a fresh canvas at the moment a renderer found no WebGL 2 context. A fresh canvas that gets
 * one says the failure was the renderer's own canvas or attributes (a code fault); one that gets none says the browser
 * has no WebGL for the page (hardware acceleration off, a blocklisted GPU, or a GPU process that crashed too often,
 * which lasts until the browser restarts).
 *
 * @returns The probe's answers, for the event's `tau.webgl` context.
 * @public
 */
export const probeWebGlAvailability = (): Readonly<Record<string, unknown>> => {
  if (typeof document === 'undefined') {
    return { probed: false };
  }
  return {
    probed: true,
    freshCanvasWebGl2: freshCanvasGets('webgl2'),
    freshCanvasWebGl: freshCanvasGets('webgl'),
    webGpuApi: typeof navigator !== 'undefined' && 'gpu' in navigator,
    pageAgeSeconds: Math.round(performance.now() / 1000),
  };
};
