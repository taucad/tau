// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- environment keys and Sentry option names are external contracts. */
import { describe, expect, it, vi } from 'vitest';
import type * as SentryReact from '@sentry/react';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type { StaleBuildOutcome, StaleBuildTag } from '#lib/stale-build-recovery.js';

const mocks = vi.hoisted(() => {
  /** A mutable stand-in for the injected environment. */
  const env: Record<string, string> = {
    SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
    SENTRY_ENVIRONMENT: 'staging',
    NODE_ENV: 'production',
    TAU_API_URL: 'https://api.taucad.dev',
  };
  return {
    init: vi.fn(),
    addEventProcessor: vi.fn(),
    addBreadcrumb: vi.fn(),
    recoverFromStaleBuild: vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'reloading'),
    classifyStaleBuildFailure: vi.fn(async (_failure: unknown): Promise<StaleBuildTag> => 'superseded'),
    env,
  };
});

vi.mock('@sentry/react', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryReact>()),
  init: mocks.init,
  addEventProcessor: mocks.addEventProcessor,
  addBreadcrumb: mocks.addBreadcrumb,
}));
vi.mock('#environment.config.js', () => ({ ENV: mocks.env }));
vi.mock('#lib/stale-build-recovery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StaleBuildRecovery>()),
  recoverFromStaleBuild: mocks.recoverFromStaleBuild,
  classifyStaleBuildFailure: mocks.classifyStaleBuildFailure,
}));

const { initSentry, createBeforeSend, stopSentry } = await import('#lib/sentry.lib.js');
const { recordActivityBreadcrumb } = await import('#lib/activity-breadcrumbs.js');

type BeforeSend = ReturnType<typeof createBeforeSend>;

describe('initSentry', () => {
  it('should tag an expected skew event by classifying it, never by starting a recovery', async () => {
    initSentry();
    const [options] = mocks.init.mock.calls[0] as [{ readonly beforeSend: BeforeSend }];
    const { beforeSend } = options;
    const failure = new TypeError('Importing a module script failed.');

    await expect(beforeSend({ type: undefined }, { originalException: failure })).resolves.toMatchObject({
      tags: { stale_build: 'superseded' },
    });

    expect(mocks.classifyStaleBuildFailure).toHaveBeenCalledWith(failure);
    expect(mocks.recoverFromStaleBuild).not.toHaveBeenCalled();
  });

  it('should send through the same-origin tunnel without default PII or replay, tracing staging to the API only', () => {
    mocks.init.mockClear();
    initSentry();
    const [options] = mocks.init.mock.calls[0] as [Record<string, unknown>];

    expect(options).toMatchObject({ tunnel: '/api/monitoring', sendDefaultPii: false, tracesSampleRate: 1 });
    expect(options['tracePropagationTargets']).toStrictEqual([/^https:\/\/api\.taucad\.dev(?:\/|$)/u]);
    expect(options['beforeSendTransaction']).toBeTypeOf('function');
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
  });

  it('should not trace production until the staging cost is measured (SB17)', () => {
    mocks.init.mockClear();
    mocks.env['SENTRY_ENVIRONMENT'] = 'production';
    try {
      initSentry();
    } finally {
      mocks.env['SENTRY_ENVIRONMENT'] = 'staging';
    }
    const [options] = mocks.init.mock.calls[0] as [Record<string, unknown>];

    expect(options).not.toHaveProperty('tracesSampleRate');
    expect(options).not.toHaveProperty('tracePropagationTargets');
    expect(options).not.toHaveProperty('beforeSendTransaction');
  });

  it('should post to the DSN directly on desktop', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    mocks.init.mockClear();
    try {
      initSentry();
    } finally {
      vi.unstubAllEnvs();
    }
    const [options] = mocks.init.mock.calls[0] as [Record<string, unknown>];

    expect(options).not.toHaveProperty('tunnel');
  });

  it('should add the Tau context to error events only', () => {
    mocks.addEventProcessor.mockClear();
    initSentry();
    const [processor] = mocks.addEventProcessor.mock.calls[0] as [
      (event: Record<string, unknown>) => { tags?: Record<string, string> },
    ];

    expect(processor({ type: undefined }).tags?.['device_class']).toMatch(/^(constrained|standard)$/u);
    expect(processor({ type: 'transaction' })).toStrictEqual({ type: 'transaction' });
  });

  it('should forward activity breadcrumbs as tau.activity while the SDK runs, and stop after', () => {
    mocks.addBreadcrumb.mockClear();
    initSentry();
    recordActivityBreadcrumb('render');

    expect(mocks.addBreadcrumb).toHaveBeenCalledWith({ category: 'tau.activity', message: 'render', level: 'info' });
    stopSentry();
    recordActivityBreadcrumb('export');
    expect(mocks.addBreadcrumb).toHaveBeenCalledOnce();
  });
});
