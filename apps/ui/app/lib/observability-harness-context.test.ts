import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV } from '#environment.config.js';
import { isObservabilityHarnessDirect, observabilityHarnessTags } from '#lib/observability-harness-context.js';
import { scrubSentryEvent } from '#lib/sentry-event.lib.js';

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Runtime environment names.
  ENV: { TAU_DEBUG: true, SENTRY_ENVIRONMENT: 'staging' },
}));

beforeEach(() => {
  vi.stubEnv('TAU_OBSERVABILITY_HARNESS', 'enabled');
  globalThis.history.replaceState(null, '', '/__debug/observability?e2e_run=run-123&trigger=direct');
});
afterEach(() => {
  vi.unstubAllEnvs();
  ENV.SENTRY_ENVIRONMENT = 'staging';
});

describe('observability harness correlation', () => {
  it('should attach the bounded run tag while still stripping query data', () => {
    expect(scrubSentryEvent({ type: undefined, request: { url: globalThis.location.href } })).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry query tag contract.
      tags: { e2e_run: 'run-123' },
      request: { url: `${globalThis.location.origin}/__debug/observability` },
    });
    expect(isObservabilityHarnessDirect()).toBe(true);
  });
  it('should leave ordinary routes and invalid run ids untagged', () => {
    globalThis.history.replaceState(null, '', '/projects?e2e_run=run-123&trigger=direct');
    expect(observabilityHarnessTags()).toEqual({});
    expect(isObservabilityHarnessDirect()).toBe(false);
    globalThis.history.replaceState(null, '', '/__debug/observability?e2e_run=private%20text');
    expect(observabilityHarnessTags()).toEqual({});
  });
  it('should refuse harness behavior when production serves a staging artifact', () => {
    ENV.SENTRY_ENVIRONMENT = 'production';
    expect(observabilityHarnessTags()).toEqual({});
    expect(isObservabilityHarnessDirect()).toBe(false);
  });
  it('should refuse harness behavior when stripped at build time', () => {
    vi.stubEnv('TAU_OBSERVABILITY_HARNESS', 'disabled');
    expect(observabilityHarnessTags()).toEqual({});
    expect(isObservabilityHarnessDirect()).toBe(false);
  });
});
