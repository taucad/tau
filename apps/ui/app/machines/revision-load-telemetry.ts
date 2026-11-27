/**
 * The file-manager worker's project load reporters (`observability.projectOpen`, `observability.lfsFetch`) under the
 * one consent rule (runtime observability PR-7 follow-up, AR-W6-02).
 *
 * The worker cannot resolve consent itself: the page says its resolved consent on each project's revision port
 * (`telemetryConsent` frame), and the registry hands the port's builder a reader of the last value. Only `granted`
 * reports; `denied` (telemetry off, or Global Privacy Control), `unknown` and never said send nothing. The desktop's
 * disk host reports its own loads, so a desktop build sends nothing from here either.
 *
 * @module
 */

import type { ReportingConsent } from '@taucad/telemetry/client';
import { reportToApi } from '#runtime/observability/report-to-api.js';

/** One project's load entry names. */
export type RevisionLoadEntryName = 'observability.projectOpen' | 'observability.lfsFetch';

/** What one project's load reporter reads per entry. */
export type RevisionLoadReporterOptions = Readonly<{
  /** The API origin the page last sent for this project; absent, nothing is reported. */
  apiBaseUrl: () => string | undefined;
  /** The page's last resolved consent for this project; only `granted` reports. */
  telemetryConsent: () => ReportingConsent | undefined;
  /** Whether this is the desktop build, whose disk host reports its own loads. */
  isDesktop: () => boolean;
  /** Where to send; defaults to the ingest API. */
  report?: typeof reportToApi;
}>;

/**
 * Build one project's load reporter. Every input is read per entry, so a consent change applies to the next entry.
 *
 * @param options - The project's API origin, consent and build target.
 * @returns Report one entry, or nothing when the rule refuses it.
 */
export const createRevisionLoadReporter = (
  options: RevisionLoadReporterOptions,
): ((name: RevisionLoadEntryName, duration: number, detail: Readonly<Record<string, unknown>>) => void) => {
  const report = options.report ?? reportToApi;
  return (name, duration, detail) => {
    const apiBaseUrl = options.apiBaseUrl();
    if (apiBaseUrl === undefined || options.isDesktop() || options.telemetryConsent() !== 'granted') {
      return;
    }
    report({ reportUrl: `${apiBaseUrl}/v1/telemetry/ingest`, name, duration, detail });
  };
};
