/**
 * T-B28.2 (B28, R12): the web build's inline boot watchdog, evaluated in a document as the server-rendered page runs it.
 * P12-F1b: when the strip appears, one report of what was still loading goes through the Sentry tunnel.
 */
/* eslint-disable @typescript-eslint/naming-convention -- Sentry event, tag and `window.ENV` wire names. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  bootReloadCleanupLimit,
  bootStallReportPath,
  bootWatchdogDeadline,
  bootWatchdogStripHtml,
  bootWorkerCachePattern,
  buildBootWatchdogScript,
} from '#lib/boot-watchdog.js';
import { sentryTunnelPath } from '#lib/sentry-event.lib.js';
import { isWorkerCache } from '#offline/pwa-caches.js';
import { isEnvelopeForDsn } from '#routes/api.monitoring/route.js';

/**
 * Run an inline script in the document's own global, as the page does. jsdom runs it in the window's script context,
 * whose global is not the test's, so the page global is written by a script too.
 */
const runInlineScript = (source: string): void => {
  const script = document.createElement('script');
  script.textContent = source;
  document.head.append(script);
  script.remove();
};

/** Put the server-rendered strip in the body and run the head script, as the document does. */
const loadDocument = (): void => {
  document.body.innerHTML = bootWatchdogStripHtml;
  const source = buildBootWatchdogScript();
  if (source === undefined) {
    throw new Error('The web build emits the watchdog script');
  }
  runInlineScript(source);
};

const strip = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('#tau-boot-strip');
  if (element === null) {
    throw new Error('The document carries the strip');
  }
  return element;
};

describe('web boot watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runInlineScript('delete globalThis.__tauBoot');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    document.body.innerHTML = '';
    runInlineScript('delete globalThis.__tauBoot');
  });

  /* The report reads the page global's `window.ENV`, written by a script, and posts with `navigator.sendBeacon`; the
   * navigator object is the same one the test sees. */
  const dsn = 'https://public@o4500000000000000.ingest.us.sentry.io/4512297038446593';

  const sendBeacon = vi.fn<(url: string, body: string) => boolean>(() => true);

  const beacons = (): ReadonlyArray<readonly [string, string]> => sendBeacon.mock.calls;

  /** The envelope's three lines: its header, the item header and the event. */
  const envelopeOf = (body: string): [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>] => {
    const [header, item, event] = body.split('\n');
    return [JSON.parse(header ?? ''), JSON.parse(item ?? ''), JSON.parse(event ?? '')] as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
  };

  /** The event of the first report sent. */
  const firstEvent = (): Record<string, unknown> => envelopeOf(beacons()[0]?.[1] ?? '')[2];

  /** A resource the document declares, as the server-rendered head carries it. */
  const declare = (markup: string): Element => {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const element = template.content.firstElementChild;
    if (element === null) {
      throw new Error('The markup declares an element');
    }
    document.head.append(element);
    return element;
  };

  describe('stall report', () => {
    beforeEach(() => {
      sendBeacon.mockClear();
      Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true, writable: true });
      runInlineScript(
        `globalThis.ENV = ${JSON.stringify({ SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production', TAU_BUILD_ID: '1763600000000' })};`,
      );
    });

    afterEach(() => {
      runInlineScript('delete globalThis.ENV');
      Reflect.deleteProperty(navigator, 'sendBeacon');
      document.head.innerHTML = '';
    });

    it('should post to the same-origin Sentry tunnel', () => {
      expect(bootStallReportPath).toBe(sentryTunnelPath);
    });

    it('should send one report naming the declared same-origin resources still loading when the strip appears', () => {
      loadDocument();
      /* Declared after the script ran, as `<Links />` and `<Scripts />` follow it in the document. */
      const loaded = declare('<link rel="modulepreload" href="/assets/entry.client-AAA.js">');
      declare('<link rel="modulepreload" href="/assets/preload-helper-BBB.js?v=1#frag">');
      declare('<link rel="preload" as="font" href="/fonts/Geist-Variable.woff2" crossorigin>');
      declare('<link rel="stylesheet" href="/assets/root-CCC.css">');
      declare('<script type="module" src="https://cdn.example.com/other.js"></script>');
      const failed = declare('<link rel="modulepreload" href="/assets/failed-DDD.js">');
      loaded.dispatchEvent(new Event('load'));
      failed.dispatchEvent(new Event('error'));

      vi.advanceTimersByTime(19_999);
      expect(beacons()).toHaveLength(0);
      vi.advanceTimersByTime(1);

      expect(strip().hidden).toBe(false);
      expect(beacons()).toHaveLength(1);
      const [url, body] = beacons()[0] ?? ['', ''];
      expect(url).toBe('/api/monitoring');
      expect(isEnvelopeForDsn(body, dsn)).toBe(true);
      const [header, item, event] = envelopeOf(body);
      expect(header).toMatchObject({ dsn });
      expect(header['event_id']).toMatch(/^[\da-f]{32}$/u);
      expect(header['event_id']).toBe(event['event_id']);
      expect(item).toStrictEqual({ type: 'event' });
      expect(event).toMatchObject({
        platform: 'javascript',
        logger: 'boot-watchdog',
        level: 'warning',
        message: 'Boot watchdog: shell not mounted (resource-pending)',
        fingerprint: ['boot-watchdog', 'resource-pending'],
        environment: 'staging',
        release: 'tau-ui@1763600000000',
        tags: {
          tau_event: 'boot-watchdog',
          stall: 'resource-pending',
          hydration_started: 'false',
          online: 'true',
          effective_type: 'unknown',
          ready_state: 'complete',
        },
        contexts: {
          boot_watchdog: {
            pending: ['/assets/preload-helper-BBB.js', '/fonts/Geist-Variable.woff2', '/assets/root-CCC.css'],
            pending_count: 3,
            declared: 5,
            home_ready: false,
            route_modules: 0,
          },
        },
        request: { url: 'http://localhost:3000/' },
      });
      const context = (event['contexts'] as Record<string, Record<string, unknown>>)['boot_watchdog'];
      expect(context?.['elapsed_ms']).toEqual(expect.any(Number));
      expect(body).not.toContain('cdn.example.com');
      expect(body).not.toContain('?v=1');
      expect(body).not.toContain('frag');

      vi.advanceTimersByTime(120_000);
      expect(beacons()).toHaveLength(1);
    });

    it('should send nothing when the shell mounts in time', () => {
      loadDocument();
      declare('<link rel="modulepreload" href="/assets/entry.client-AAA.js">');
      runInlineScript('globalThis.__tauBoot.shellMounted = true');

      vi.advanceTimersByTime(120_000);

      expect(beacons()).toHaveLength(0);
    });

    it('should report a stall with nothing declared still loading as an app hang, at error level', () => {
      loadDocument();
      declare('<link rel="modulepreload" href="/assets/entry.client-AAA.js">').dispatchEvent(new Event('load'));
      runInlineScript(
        'globalThis.__reactRouterRouteModules = { root: {}, "routes/home": {} };' +
          'document.__reactContainer$test = {}; globalThis.__tauBoot.homeReady = false;',
      );

      vi.advanceTimersByTime(20_000);

      expect(beacons()).toHaveLength(1);
      expect(firstEvent()).toMatchObject({
        level: 'error',
        fingerprint: ['boot-watchdog', 'none-pending'],
        tags: { stall: 'none-pending', hydration_started: 'true' },
        contexts: { boot_watchdog: { pending: [], pending_count: 0, declared: 1, route_modules: 2 } },
      });
      runInlineScript('delete globalThis.__reactRouterRouteModules; delete document.__reactContainer$test;');
    });

    it('should file a browser under automation in the e2e environment', () => {
      Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
      loadDocument();

      vi.advanceTimersByTime(20_000);

      expect(firstEvent()['environment']).toBe('staging-e2e');
      Reflect.deleteProperty(navigator, 'webdriver');
    });

    it('should carry no cookie, storage or query string', () => {
      runInlineScript(
        "document.cookie = 'session=cookie-secret'; localStorage.setItem('k', 'storage-secret');" +
          "history.replaceState(null, '', '/invitations/invite-secret?token=query-secret#hash-secret');",
      );
      loadDocument();

      vi.advanceTimersByTime(20_000);

      const body = beacons()[0]?.[1] ?? '';
      expect(envelopeOf(body)[2]['request']).toMatchObject({ url: 'http://localhost:3000/invitations/[redacted]' });
      for (const secret of ['cookie-secret', 'storage-secret', 'invite-secret', 'query-secret', 'hash-secret']) {
        expect(body).not.toContain(secret);
      }
      runInlineScript(
        "document.cookie = 'session=; max-age=0'; localStorage.clear(); history.replaceState(null, '', '/');",
      );
    });

    it('should send nothing without a Sentry DSN', () => {
      runInlineScript('globalThis.ENV = {}');
      loadDocument();

      vi.advanceTimersByTime(20_000);

      expect(strip().hidden).toBe(false);
      expect(beacons()).toHaveLength(0);
    });
  });

  it('should reveal the strip with Reload and a safe-mode link at 20 000 ms without the shell', () => {
    loadDocument();
    expect(strip().hidden).toBe(true);

    vi.advanceTimersByTime(19_999);
    expect(strip().hidden).toBe(true);

    vi.advanceTimersByTime(1);
    expect(strip().hidden).toBe(false);
    expect(strip().querySelector('button')).toHaveTextContent('Reload');
    const link = strip().querySelector('a');
    expect(link).toHaveTextContent('Open in safe mode');
    expect(link).toHaveAttribute('href', '/?safe=1');
  });

  it('should keep the strip hidden when the shell reported shell-mounted first', () => {
    loadDocument();
    /* What `reportBootStage('shell-mounted')` writes on the page global. */
    runInlineScript('globalThis.__tauBoot.shellMounted = true');

    vi.advanceTimersByTime(60_000);

    expect(strip().hidden).toBe(true);
  });

  it('should keep the hidden strip out of layout even when no stylesheet loaded', () => {
    loadDocument();
    /* An inline display on the element that carries `hidden` would override it and show the strip at once. */
    expect(strip().style.display).toBe('');
    expect(getComputedStyle(strip()).display).toBe('none');
  });

  it('should reveal the strip when it reaches the document only after the deadline', () => {
    const source = buildBootWatchdogScript();
    if (source === undefined) {
      throw new Error('The web build emits the watchdog script');
    }
    /* The head script runs while the body is still streaming. */
    runInlineScript(source);
    vi.advanceTimersByTime(20_000);
    document.body.innerHTML = bootWatchdogStripHtml;
    vi.advanceTimersByTime(1000);
    expect(strip().hidden).toBe(false);
  });

  it('should emit no script on the desktop target', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    expect(buildBootWatchdogScript()).toBeUndefined();
  });
});

/**
 * FP5 (Brain `research/pl7-service-worker-staging-defects-blueprint.md`): the strip's Reload under a service worker.
 * The script runs in a context of its own, whose `location`, `navigator.serviceWorker` and `caches` the test owns
 * (jsdom's `location.reload` cannot be observed).
 */
describe('web boot watchdog Reload under a service worker (FP5)', () => {
  type Listener = () => void;
  const runWatchdog = (
    worker: 'controlled' | 'uncontrolled' | 'none',
    cleanup: 'settles' | 'hangs' = 'settles',
  ): { calls: string[]; click: () => void; advance: (milliseconds: number) => Promise<void> } => {
    const calls: string[] = [];
    let click: Listener = () => undefined;
    const timers: Array<{ at: number; run: Listener }> = [];
    let now = 0;
    const pending = async <T>(value: T): Promise<T> =>
      cleanup === 'settles'
        ? Promise.resolve(value)
        : new Promise<T>(() => {
            // Never settles: the cleanup hangs.
          });
    const button = {
      addEventListener: (_type: string, listener: Listener) => {
        click = listener;
      },
    };
    const stripElement = { hidden: true, querySelector: () => button };
    const context = {
      document: {
        getElementById: () => stripElement,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      location: {
        reload: () => {
          calls.push('reload');
        },
      },
      setTimeout: (run: Listener, timerDelay: number) => {
        timers.push({ at: now + timerDelay, run });
      },
      navigator:
        worker === 'none'
          ? {}
          : {
              serviceWorker: {
                controller: worker === 'controlled' ? {} : null,
                getRegistrations: async () =>
                  pending([
                    {
                      unregister: async () => {
                        calls.push('unregister');
                        return true;
                      },
                    },
                  ]),
              },
            },
      caches: {
        keys: async () => pending(['tau-precache-v3-https://taucad.dev/', 'tau-assets', 'another-app']),
        delete: async (name: string) => {
          calls.push(`delete ${name}`);
          return true;
        },
      },
    };
    runInNewContext(buildBootWatchdogScript() ?? '', context);
    const advance = async (milliseconds: number): Promise<void> => {
      now += milliseconds;
      for (const timer of timers.filter(({ at }) => at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
      for (let turn = 0; turn < 10; turn += 1) {
        // oxlint-disable-next-line no-await-in-loop -- drain the cleanup's promise chain.
        await Promise.resolve();
      }
    };
    return {
      calls,
      click: () => {
        click();
      },
      advance,
    };
  };

  it('should unregister the worker and delete its caches, then reload, when a worker controls the page', async () => {
    const { calls, click, advance } = runWatchdog('controlled');
    await advance(bootWatchdogDeadline);
    click();
    await advance(0);

    expect(calls).toStrictEqual([
      'unregister',
      'delete tau-precache-v3-https://taucad.dev/',
      'delete tau-assets',
      'reload',
    ]);
    await advance(bootReloadCleanupLimit);
    expect(calls.filter((call) => call === 'reload')).toHaveLength(1);
  });

  it('should reload at once when no worker controls the page', async () => {
    for (const worker of ['uncontrolled', 'none'] as const) {
      const { calls, click, advance } = runWatchdog(worker);
      // oxlint-disable-next-line no-await-in-loop -- one page at a time.
      await advance(bootWatchdogDeadline);
      click();
      expect(calls, worker).toStrictEqual(['reload']);
    }
  });

  it('should reload after the cleanup limit when the cleanup never settles', async () => {
    const { calls, click, advance } = runWatchdog('controlled', 'hangs');
    await advance(bootWatchdogDeadline);
    click();
    await advance(bootReloadCleanupLimit - 1);
    expect(calls).toStrictEqual([]);

    await advance(1);
    expect(calls).toStrictEqual(['reload']);
  });

  it('should match exactly the caches isWorkerCache owns', () => {
    const pattern = new RegExp(bootWorkerCachePattern, 'u');
    for (const name of [
      'tau-precache-v2-https://tau.new/',
      'tau-precache-v3-https://tau.new/',
      'tau-runtime-https://tau.new/',
      'tau-assets',
      'tau-assets-v3',
      'tau-offline-shell-3f9a2c1d0b7e',
      'taunt',
      'tau-billing',
      'tau-assets-old',
      'workbox-precache-v2',
      'tau-offline',
      'another-app-cache',
    ]) {
      expect(pattern.test(name), name).toBe(isWorkerCache(name));
    }
  });
});
