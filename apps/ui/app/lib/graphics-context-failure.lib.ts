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
    ? { ...event, level: 'warning', fingerprint: [...graphicsContextUnavailableFingerprint] }
    : event;
