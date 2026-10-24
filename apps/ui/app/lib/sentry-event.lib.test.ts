// @vitest-environment jsdom
import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSentryEventDirectly } from '#lib/sentry-event.lib.js';

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendSentryEventDirectly', () => {
  it('should leave the error marked so the SDK, started later on the page, never sends it again', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}'));
    const failure = new TypeError('Failed to fetch dynamically imported module: /assets/a-1.js');
    await sendSentryEventDirectly(failure, {});

    const sent: unknown[] = [];
    Sentry.init({
      dsn: 'https://public@o0.ingest.sentry.io/42',
      defaultIntegrations: false,
      transport: () => ({
        send: async (envelope) => {
          sent.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
    });
    try {
      // As Vite rethrowing the same failure into a global handler would.
      Sentry.captureException(failure);
      Sentry.captureException(new Error('another error'));
      await Sentry.flush(1000);

      expect(sent).toHaveLength(1);
    } finally {
      await Sentry.close();
    }
  });
});
