/**
 * T-B28.2 (B28, R12): the web build's inline boot watchdog, evaluated in a document as the server-rendered page runs it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  bootReloadCleanupLimit,
  bootWatchdogDeadline,
  bootWatchdogStripHtml,
  buildBootWatchdogScript,
} from '#lib/boot-watchdog.js';

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
      document: { getElementById: () => stripElement },
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
      RegExp,
      Promise,
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
});
