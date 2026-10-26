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
