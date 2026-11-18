/**
 * The renderer's resolved runtime-telemetry consent, as desktop main keeps it (runtime observability AR-W4-03c).
 *
 * Desktop main has no consent surface of its own: the renderer is the same page as the web app and resolves the one
 * rule (GPC, the device preference and, signed in, the account's preference), then tells main on every resolved change
 * over `telemetry:consent`. Main persists the last value so a launch that has not loaded a page yet still knows it, and
 * anything other than `granted` keeps main's own producers quiet.
 *
 * @module
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The renderer's resolved consent. */
export type RendererTelemetryConsent = 'granted' | 'denied' | 'unknown';

/**
 * Whether a value is a resolved consent, as the renderer may send it.
 *
 * @param value - The IPC payload.
 * @returns Whether it is one.
 */
export const isRendererTelemetryConsent = (value: unknown): value is RendererTelemetryConsent =>
  value === 'granted' || value === 'denied' || value === 'unknown';

/**
 * The persisted consent, `unknown` when nothing (or something unreadable) was saved.
 *
 * @param path - The state file under `userData`.
 * @returns The consent.
 */
export const readRendererTelemetryConsent = (path: string): RendererTelemetryConsent => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const consent = typeof value === 'object' && value !== null && 'consent' in value ? value.consent : undefined;
    return isRendererTelemetryConsent(consent) ? consent : 'unknown';
  } catch {
    return 'unknown';
  }
};

/**
 * Persist the consent atomically (write a sibling, then rename).
 *
 * @param path - The state file under `userData`.
 * @param consent - The renderer's resolved consent.
 */
export const writeRendererTelemetryConsent = (path: string, consent: RendererTelemetryConsent): void => {
  mkdirSync(dirname(path), { recursive: true });
  const staging = `${path}.tmp`;
  writeFileSync(staging, JSON.stringify({ consent }));
  renameSync(staging, path);
};

/** The control frame that tells the services host the renderer's resolved consent. */
export type TelemetryConsentFrame = Readonly<{ type: 'telemetryConsent'; consent: RendererTelemetryConsent }>;

/** What main's consent relay needs: its state file, the services host's control post and a warning log. */
export type RendererTelemetryConsentRelayOptions = Readonly<{
  path: string;
  publish: (frame: TelemetryConsentFrame) => void;
  warn: (event: string, detail: Readonly<Record<string, unknown>>) => void;
}>;

/**
 * Relay the renderer's resolved consent to the services host, whose desktop project hosts report sync attempts only
 * under `granted` (runtime observability PR-7 follow-up, AR-W6-02). The persisted value is published at once, so a
 * launch whose page has not loaded yet keeps the last decision; every accepted change is persisted, then published.
 * The broker replays the latest control frame onto a respawned utility.
 *
 * @param options - The state file, the publish and the log.
 * @returns `accept`, for each consent the trusted renderer sends; a value that is not a resolved consent is ignored.
 */
export const createRendererTelemetryConsentRelay = (
  options: RendererTelemetryConsentRelayOptions,
): Readonly<{ accept: (consent: unknown) => void }> => {
  options.publish({ type: 'telemetryConsent', consent: readRendererTelemetryConsent(options.path) });
  return {
    accept(consent) {
      if (!isRendererTelemetryConsent(consent)) {
        return;
      }
      try {
        writeRendererTelemetryConsent(options.path, consent);
      } catch (error) {
        options.warn('telemetry-consent.write-failed', { message: String(error) });
      }
      /* Published even when persisting failed: this session still follows the renderer. */
      options.publish({ type: 'telemetryConsent', consent });
    },
  };
};
