// @vitest-environment jsdom
/**
 * Error reporting with the real SDK (`#lib/sentry.lib`) whose start throws part-way, after the
 * client is bound and its global handlers are installed: one failure must still reach Sentry once.
 */
import type * as SentryReact from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const transported = vi.hoisted(() => [] as unknown[]);

vi.mock('#environment.config.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- The environment's own names.
  ENV: { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42', NODE_ENV: 'test' },
}));
// The real SDK, with an integration that throws during setup (after the global handlers) and a recording transport.
vi.mock('@sentry/react', async (importOriginal) => {
  const actual = await importOriginal<typeof SentryReact>();
  return {
    ...actual,
    init: (options: SentryReact.BrowserOptions) =>
      actual.init({
        ...options,
        transport: () => ({
          send: async (envelope) => {
            transported.push(envelope);
            return {};
          },
          flush: async () => true,
        }),
        integrations: (defaults) => [
          ...(typeof options.integrations === 'function' ? options.integrations(defaults) : defaults),
          {
            name: 'ThrowsDuringSetup',
            setupOnce: () => {
              throw new Error('integration setup failed');
            },
          },
        ],
      }),
  };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const sentrySdk = await import('@sentry/react');
  await sentrySdk.close();
});

describe('error reporting when the SDK throws as it starts', () => {
  it('should send an unhandled module load failure exactly once', async () => {
    const posted: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.startsWith('/health/build')) {
        return new Response('not found', { status: 404 });
      }
      posted.push(typeof init?.body === 'string' ? init.body : '');
      return new Response('{}');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startErrorReporting, isErrorTrackerListening } = await import('#lib/error-reporting.js');
    const { installStaleBuildRecovery } = await import('#lib/stale-build-recovery.js');
    const onLoadFailure = vi.fn();
    await startErrorReporting(onLoadFailure);
    const uninstall = installStaleBuildRecovery();
    expect(isErrorTrackerListening()).toBe(false);
    expect(onLoadFailure).not.toHaveBeenCalled();

    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(event, { reason: new TypeError('Importing a module script failed.'), promise: Promise.resolve() });
    globalThis.dispatchEvent(event);
    // The jsdom window fires listeners but not the `onunhandledrejection` property a browser also calls, where the SDK listens.
    const onRejection: unknown = Reflect.get(globalThis, 'onunhandledrejection');
    expect(onRejection).toBeTypeOf('function');
    if (typeof onRejection === 'function') {
      Reflect.apply(onRejection, globalThis, [event]);
    }

    await vi.waitFor(
      () => {
        expect(posted.length + transported.length).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    uninstall();

    // Exactly one event: sent without the SDK, which is turned off and captures nothing.
    expect(transported).toHaveLength(0);
    expect(posted).toHaveLength(1);
  }, 20_000);
});
