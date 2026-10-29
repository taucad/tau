// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Sentry envelopes and environment keys are wire contracts. */
import type * as SentryReact from '@sentry/react';
import type { BrowserOptions } from '@sentry/react';
import { afterEach, expect, it, vi } from 'vitest';

const delivery = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock('#environment.config.js', () => ({
  ENV: { SENTRY_DSN: 'https://public@sentry.invalid/1', SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' },
}));
vi.mock('#lib/observability-harness-context.js', () => ({
  isObservabilityHarnessDirect: () => false,
  observabilityHarnessTags: () => ({}),
}));
// Keep the real client, event processors and beforeSend; only delivery is replaced.
vi.mock('@sentry/react', async (importOriginal) => {
  const sentry = await importOriginal<typeof SentryReact>();
  return {
    ...sentry,
    init: (options: BrowserOptions) =>
      sentry.init({
        ...options,
        transport: () => ({
          send: async ([, items]) => {
            for (const [header, payload] of items) {
              if (header.type === 'event') {
                delivery.events.push(payload);
              }
            }
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      }),
  };
});

afterEach(async () => {
  const sentry = await import('@sentry/react');
  await sentry.close();
  delivery.events.length = 0;
  vi.restoreAllMocks();
});

it('should enrich one live SDK envelope when the root reports before the component boundary', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { startErrorReporting, reportUiError } = await import('#lib/error-reporting.js');
  const { reactRootErrorHooks, reactErrorDetails } = await import('#lib/react-root-errors.js');
  const sentry = await import('@sentry/react');
  await startErrorReporting();
  const failure = new Error('Boundary envelope fixture');
  const info = { componentStack: '\n    at BoundaryFailure\n    at FloatingPanelContent' };
  // React calls the root hook before componentDidCatch in the same synchronous commit.
  reactRootErrorHooks.onCaughtError(failure, info);
  await reportUiError(failure, { ...reactErrorDetails(info), tags: { boundary: 'floating-panel' } });
  await sentry.flush(2000);
  expect(delivery.events).toHaveLength(1);
  expect(delivery.events[0]).toMatchObject({
    tags: { boundary: 'floating-panel' },
    contexts: { react: { componentStack: info.componentStack } },
    exception: { values: [{ value: 'Boundary envelope fixture' }] },
  });
});
