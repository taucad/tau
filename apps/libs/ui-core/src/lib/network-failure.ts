import type { ErrorEvent } from '@sentry/react';

/**
 * The messages browsers give a `fetch` that never reached a server: Chromium, Firefox, WebKit and React Native in
 * turn. Sentry's fetch instrumentation appends the request's host, as in `Failed to fetch (taucad.dev)`.
 */
const networkFailureMessage =
  /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed|Network request failed)(?: \([^)]*\))?$/u;

/** Fingerprint shared by transient network failures, so they group apart from errors in Tau's own code. */
const transientNetworkFailureFingerprint = ['transient-network-failure'] as const;

/**
 * Whether a value is a `fetch` that failed in the network, before any response: a dropped connection, a blip while
 * switching networks, or an offline device (TAU-UI-E). Only the browser's own `TypeError` counts; a module load
 * failure (`Failed to fetch dynamically imported module`) belongs to the stale-build recovery and never matches.
 *
 * @param error - The thrown or rejected value.
 * @returns `true` for a transient network failure.
 * @public
 */
export const isTransientNetworkFailure = (error: unknown): boolean =>
  error instanceof TypeError && networkFailureMessage.test(error.message);

/**
 * Decorate an event for a transient network failure, as every path to Sentry does (the SDK's `beforeSend` and an
 * event sent without it): it still reports, as one `warning` group of its own, so a connection blip is counted
 * without reading as a fault in Tau. Any other event is returned unchanged.
 *
 * @param event - The event about to be sent.
 * @param error - The reported value.
 * @returns The decorated event.
 * @public
 */
export const decorateForNetworkFailure = (event: ErrorEvent, error: unknown): ErrorEvent =>
  isTransientNetworkFailure(error)
    ? { ...event, level: 'warning', fingerprint: [...transientNetworkFailureFingerprint] }
    : event;
