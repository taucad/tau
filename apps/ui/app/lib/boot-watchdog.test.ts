/**
 * T-B28.2 (B28, R12): the web build's inline boot watchdog, evaluated in a document as the server-rendered page runs it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootWatchdogStripHtml, buildBootWatchdogScript } from '#lib/boot-watchdog.js';

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

  it('should unregister a controlling worker and delete only its caches when Reload is pressed (PL7 FP5)', async () => {
    const order: string[] = [];
    const unregister = vi.fn(async () => {
      order.push('unregister');
      return true;
    });
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {}, getRegistrations: async () => [{ unregister }] },
    });
    vi.stubGlobal('caches', {
      keys: async () => ['tau-precache-v3', 'tau-assets', 'tau-offline-shell-1', 'tau-precache-v2-x', 'other'],
      delete: async (name: string) => {
        order.push(`delete ${name}`);
        return true;
      },
    });
    // Run in this realm, whose `caches` and `navigator` are the doubles; the strip's wiring is the same script.
    document.body.innerHTML = bootWatchdogStripHtml;
    // oxlint-disable-next-line no-new-func, typescript/no-unsafe-call -- Evaluates the inline script, as the page does.
    new Function(buildBootWatchdogScript() ?? '')();
    vi.advanceTimersByTime(20_000);

    strip().querySelector('button')?.click();
    // The jsdom page has no reload; what matters is that the worker and its caches are gone before it is asked for.
    await vi.waitFor(() => {
      expect(order).toHaveLength(5);
    });
    expect(order[0]).toBe('unregister');
    expect(order.slice(1).toSorted()).toStrictEqual([
      'delete tau-assets',
      'delete tau-offline-shell-1',
      'delete tau-precache-v2-x',
      'delete tau-precache-v3',
    ]);
    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the jsdom test double.
    delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
    vi.unstubAllGlobals();
  });

  it('should emit no script on the desktop target', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    expect(buildBootWatchdogScript()).toBeUndefined();
  });
});
