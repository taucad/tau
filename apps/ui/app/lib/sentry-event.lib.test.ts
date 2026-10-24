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

describe('decorateForStaleBuild', () => {
  it.each(['superseded', 'current', 'undecided'] as const)(
    'should give an event sent without the SDK the same tag, level and fingerprint as beforeSend for %s',
    async (tag) => {
      const { createBeforeSend } = await import('#lib/sentry.lib.js');
      const failure = new TypeError('Importing a module script failed.');
      const viaSdk = await createBeforeSend(async () => tag)(
        {
          type: undefined,
          level: 'error',
          tags: {},
          exception: { values: [{ type: 'TypeError', value: failure.message }] },
        },
        { originalException: failure },
      );
      const bodies: string[] = [];
      vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
        bodies.push(typeof init.body === 'string' ? init.body : '');
        return new Response('{}');
      });
      // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
      await sendSentryEventDirectly(failure, { stale_build: tag });
      const direct = JSON.parse(bodies[0]?.split('\n')[2] ?? '{}') as {
        readonly tags?: Record<string, string>;
        readonly level?: string;
        readonly fingerprint?: string[];
      };

      expect(direct.tags?.['stale_build']).toBe(viaSdk?.tags?.['stale_build']);
      expect(direct.level).toBe(viaSdk?.level);
      expect(direct.fingerprint).toStrictEqual(viaSdk?.fingerprint);
    },
  );

  it('should skip a value the SDK already captured', async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(init.body);
      return new Response('{}');
    });
    const failure = new Error('captured by the SDK');
    Object.defineProperty(failure, '__sentry_captured__', { value: true });

    await sendSentryEventDirectly(failure, {});

    expect(bodies).toHaveLength(0);
  });
});
