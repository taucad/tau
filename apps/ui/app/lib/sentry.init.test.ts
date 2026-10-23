// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- environment keys and Sentry option names are external contracts. */
import { describe, expect, it, vi } from 'vitest';
import type * as SentryReact from '@sentry/react';
import type * as StaleBuildRecovery from '#lib/stale-build-recovery.js';
import type { StaleBuildOutcome } from '#lib/stale-build-recovery.js';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  recoverFromStaleBuild: vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'reloading'),
  classifyStaleBuildFailure: vi.fn(async (_failure: unknown): Promise<StaleBuildOutcome> => 'superseded'),
}));

vi.mock('@sentry/react', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryReact>()),
  init: mocks.init,
}));
vi.mock('#environment.config.js', () => ({
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0', SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' },
}));
vi.mock('#lib/stale-build-recovery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof StaleBuildRecovery>()),
  recoverFromStaleBuild: mocks.recoverFromStaleBuild,
  classifyStaleBuildFailure: mocks.classifyStaleBuildFailure,
}));

const { initSentry, createBeforeSend } = await import('#lib/sentry.lib.js');

type BeforeSend = ReturnType<typeof createBeforeSend>;

describe('initSentry', () => {
  it('should drop an expected skew event by classifying it, never by starting a recovery', async () => {
    initSentry();
    const [options] = mocks.init.mock.calls[0] as [{ readonly beforeSend: BeforeSend }];
    const { beforeSend } = options;
    const failure = new TypeError('Importing a module script failed.');

    await expect(beforeSend({ type: undefined }, { originalException: failure })).resolves.toBeNull();

    expect(mocks.classifyStaleBuildFailure).toHaveBeenCalledWith(failure);
    expect(mocks.recoverFromStaleBuild).not.toHaveBeenCalled();
  });
});
