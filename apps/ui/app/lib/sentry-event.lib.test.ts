// @vitest-environment jsdom
import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  keepaliveBudget,
  sendSentryEventDirectly,
  sendSentryEventsAtPageExit,
  undeliveredAtPageExitFingerprint,
  undeliveredAtPageExitMessage,
} from '#lib/sentry-event.lib.js';

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Bytes of a body as the browser counts them against the keepalive quota. */
const byteSize = (body: string): number => new TextEncoder().encode(body).length;

/** The message of the event an envelope carries. */
const messageOf = (body: string): string | undefined =>
  (JSON.parse(body.split('\n')[2] ?? '{}') as PostedEvent).exception?.values[0]?.value;

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

/** The part of a posted event these tests read. */
type PostedEvent = {
  readonly tags?: Record<string, string>;
  readonly fingerprint?: string[];
  readonly exception?: { readonly values: ReadonlyArray<{ readonly value: string }> };
};

/** The events posted through a stubbed `fetch`, parsed from their envelopes. */
const recordEvents = (): Array<{ readonly keepalive: boolean; readonly event: PostedEvent }> => {
  const events: Array<{ readonly keepalive: boolean; readonly event: PostedEvent }> = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const body = typeof init.body === 'string' ? init.body : '';
    events.push({ keepalive: init.keepalive === true, event: JSON.parse(body.split('\n')[2] ?? '{}') as PostedEvent });
    return new Response('{}');
  });
  return events;
};

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

  it('should leave a stale_build tag that is no known decision undecorated, as it was given', async () => {
    const events = recordEvents();

    // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
    await sendSentryEventDirectly(new Error('tagged by someone else'), { stale_build: 'other', area: 'chat' });

    // eslint-disable-next-line @typescript-eslint/naming-convention -- A Sentry tag name.
    expect(events[0]?.event.tags).toMatchObject({ stale_build: 'other', area: 'chat', delivery: 'without-sdk' });
  });

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

describe('sendSentryEventsAtPageExit', () => {
  it('should mark what it sends as captured, so the SDK started later never sends it again', () => {
    const events = recordEvents();
    const failure = new Error('sent as the page went');

    sendSentryEventsAtPageExit([{ error: failure, tags: {} }]);
    sendSentryEventsAtPageExit([{ error: failure, tags: {} }]);

    expect(events).toHaveLength(1);
    expect((failure as { __sentry_captured__?: unknown }).__sentry_captured__).toBe(true);
  });

  it('should group every summary of undelivered errors as one issue, whatever the count', () => {
    const events = recordEvents();
    const large = (index: number): Error => {
      const error = new Error(`large ${String(index)} ${'x'.repeat(1500)}`);
      error.stack = 'y'.repeat(50_000);
      return error;
    };

    sendSentryEventsAtPageExit(Array.from({ length: 40 }, (_, index) => ({ error: large(index), tags: {} })));

    const summary = events.at(-1)?.event;
    expect(summary?.exception?.values[0]?.value).toMatch(/^\d+ further UI errors/u);
    expect(summary?.fingerprint).toStrictEqual([...undeliveredAtPageExitFingerprint]);
    expect(events.every((posted) => posted.keepalive)).toBe(true);
    expect(undeliveredAtPageExitMessage(3)).toContain('3');
  });

  it('should count what the browser refused to queue (its keepalive quota is shared) in the summary, unmarked', () => {
    const queued: string[] = [];
    // The page's other requests (the SDK, analytics) left room for one error and a summary.
    vi.stubGlobal('navigator', {
      sendBeacon: (_url: string, body: string) => {
        if (queued.length > 0 && byteSize(body) > 1200) {
          return false;
        }
        queued.push(body);
        return true;
      },
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch: keepalive request quota exceeded');
    });
    const report = (message: string): { readonly error: Error; readonly tags: Record<string, string> } => {
      const error = new Error(message);
      error.stack = 'y'.repeat(1500);
      return { error, tags: {} };
    };
    const older = report('older');
    const newer = report('newer');

    sendSentryEventsAtPageExit([older, newer]);

    expect(queued.map((body) => messageOf(body))).toStrictEqual(['newer', undeliveredAtPageExitMessage(1)]);
    expect((newer.error as { __sentry_captured__?: unknown }).__sentry_captured__).toBe(true);
    expect((older.error as { __sentry_captured__?: unknown }).__sentry_captured__).toBeUndefined();
  });

  it('should send the very summary it kept room for, however its timestamp is written', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(typeof init.body === 'string' ? init.body : '');
      return new Response('{}');
    });
    let clockReads = 0;
    // The first event is stamped on a whole second, every later one with three decimals.
    vi.spyOn(Date, 'now').mockImplementation(() => (clockReads++ === 0 ? 1_792_726_000_000 : 1_792_726_000_125));
    const exit = async (pad: number): Promise<readonly string[]> => {
      bodies.length = 0;
      clockReads = 0;
      const reports = Array.from({ length: 40 }, (_, index) => {
        // The newest grows by exactly `pad` bytes.
        const error = new Error(index === 39 ? `${'€'.repeat(Math.floor(pad / 3))}${'a'.repeat(pad % 3)}` : 'older');
        error.stack = '€'.repeat(1500);
        return { error, tags: {} };
      });
      sendSentryEventsAtPageExit(reports);
      // Let every request settle, so the next page exit starts with nothing in flight.
      for (let round = 0; round < 5; round += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Each round lets the previous one's promises settle.
        await Promise.resolve();
      }
      return [...bodies];
    };
    const probe = await exit(0);
    const errorBytes = probe.slice(0, -1).reduce((total, body) => total + byteSize(body), 0);
    const room = keepaliveBudget.bytes - errorBytes - byteSize(probe.at(-1) ?? '');

    // Around the newest error leaving exactly the summary's room, whichever summary was measured.
    for (let pad = room - 8; pad <= room + 8; pad += 1) {
      // oxlint-disable-next-line no-await-in-loop -- One page exit after another.
      const sent = await exit(pad);
      expect(messageOf(sent.at(-1) ?? ''), `pad ${String(pad)}`).toMatch(/further UI errors were not delivered/u);
      expect(sent.reduce((total, body) => total + byteSize(body), 0)).toBeLessThanOrEqual(keepaliveBudget.bytes);
    }
  });
});
