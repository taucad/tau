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

  it('should emit no script on the desktop target', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');

    expect(buildBootWatchdogScript()).toBeUndefined();
  });
});
