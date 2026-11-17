import { describe, expect, it, vi } from 'vitest';
import type { ReportingConsent } from '@taucad/telemetry/client';
import { createRevisionLoadReporter } from '#machines/revision-load-telemetry.js';

const names = ['observability.projectOpen', 'observability.lfsFetch'] as const;

const reporter = (
  overrides: Partial<{
    consent: ReportingConsent | undefined;
    apiBaseUrl: string | undefined;
    isDesktop: boolean;
  }> = {},
) => {
  const state = {
    consent: 'granted' as ReportingConsent | undefined,
    apiBaseUrl: 'https://api.test',
    isDesktop: false,
  };
  Object.assign(state, overrides);
  const report = vi.fn();
  const reportLoad = createRevisionLoadReporter({
    apiBaseUrl: () => state.apiBaseUrl,
    telemetryConsent: () => state.consent,
    isDesktop: () => state.isDesktop,
    report,
  });
  return { state, report, reportLoad };
};

/* Runtime observability PR-7 follow-up (AR-W6-02): the worker's project load entries follow the one consent rule. */
describe('createRevisionLoadReporter', () => {
  it.each(names)('should report %s to the ingest API when the page consent is granted', (name) => {
    const { report, reportLoad } = reporter();
    reportLoad(name, 120, { transport: 'catalogue' });
    expect(report).toHaveBeenCalledExactlyOnceWith({
      reportUrl: 'https://api.test/v1/telemetry/ingest',
      name,
      duration: 120,
      detail: { transport: 'catalogue' },
    });
  });

  /* `denied` is what the page resolves for telemetry off and for Global Privacy Control. */
  it.each([
    ['denied (telemetry off or Global Privacy Control)', 'denied'],
    ['unknown', 'unknown'],
    ['never said', undefined],
  ] as const)('should send nothing while the page consent is %s', (_label, consent) => {
    const { report, reportLoad } = reporter({ consent });
    for (const name of names) {
      reportLoad(name, 120, {});
    }
    expect(report).not.toHaveBeenCalled();
  });

  it('should read the consent per entry, so a withdrawal stops the next entry and a grant lets it through', () => {
    const { state, report, reportLoad } = reporter();
    reportLoad('observability.projectOpen', 1, {});
    state.consent = 'denied';
    reportLoad('observability.lfsFetch', 2, {});
    state.consent = 'granted';
    reportLoad('observability.lfsFetch', 3, {});
    expect(report.mock.calls.map(([entry]) => (entry as { duration: number }).duration)).toEqual([1, 3]);
  });

  it('should send nothing without an API origin or from the desktop build, whose disk host reports its own', () => {
    const signedOut = reporter({ apiBaseUrl: undefined });
    signedOut.reportLoad('observability.projectOpen', 1, {});
    const desktop = reporter({ isDesktop: true });
    desktop.reportLoad('observability.projectOpen', 1, {});
    expect(signedOut.report).not.toHaveBeenCalled();
    expect(desktop.report).not.toHaveBeenCalled();
  });
});
