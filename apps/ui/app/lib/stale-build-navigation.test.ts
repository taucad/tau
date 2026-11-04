// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerVerdict } from '#filesystem/build-skew.js';

const skew = vi.hoisted(() => ({
  verdict: 'live' as ServerVerdict,
  queryLiveBuild: vi.fn(async () => undefined),
}));
vi.mock('#filesystem/build-skew.js', () => ({
  queryLiveBuild: skew.queryLiveBuild,
  readServerVerdict: () => skew.verdict,
}));

const { hiddenRecheckAfter, installStaleBuildNavigation, visiblePollInterval } =
  await import('#lib/stale-build-navigation.js');

const setVisibility = (state: DocumentVisibilityState): void => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

/** Click a link to `href`, as `init` says; `true` when the click reached the page (React's root listens there). */
const clickLink = (href: string, init: MouseEventInit = {}, attributes: Record<string, string> = {}): boolean => {
  const anchor = document.createElement('a');
  anchor.href = href;
  for (const [name, value] of Object.entries(attributes)) {
    anchor.setAttribute(name, value);
  }
  const label = document.createElement('span');
  anchor.append(label);
  document.body.append(anchor);
  let reached = false;
  const onBody = (event: Event): void => {
    reached = true;
    // No navigation in jsdom: keep it from trying.
    event.preventDefault();
  };
  document.body.addEventListener('click', onBody);
  label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  document.body.removeEventListener('click', onBody);
  anchor.remove();
  return reached;
};

let uninstall: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  skew.verdict = 'live';
  skew.queryLiveBuild.mockClear();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  uninstall = installStaleBuildNavigation();
});

afterEach(() => {
  uninstall?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('installStaleBuildNavigation', () => {
  it('leaves clicks to the router while the server names this build', () => {
    expect(clickLink('/projects')).toBe(true);
  });

  it('keeps an in-app link click from the router once the server names another build', () => {
    skew.verdict = 'replaced';
    expect(clickLink('/projects')).toBe(false);
  });

  it('leaves clicks the browser would not load in this tab, and hash jumps, to the page', () => {
    skew.verdict = 'replaced';
    expect(clickLink('/projects', { metaKey: true })).toBe(true);
    expect(clickLink('/projects', {}, { target: '_blank' })).toBe(true);
    expect(clickLink('/projects', {}, { download: '' })).toBe(true);
    expect(clickLink('https://example.com/projects')).toBe(true);
    expect(clickLink(`${globalThis.location.pathname}#section`)).toBe(true);
  });

  it('asks the server when a tab turns visible after a long absence, not after a short one', () => {
    setVisibility('hidden');
    vi.advanceTimersByTime(hiddenRecheckAfter - 1);
    setVisibility('visible');
    expect(skew.queryLiveBuild).not.toHaveBeenCalled();

    setVisibility('hidden');
    vi.advanceTimersByTime(hiddenRecheckAfter);
    setVisibility('visible');
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);
  });

  it('asks the server on a timer only while visible', () => {
    vi.advanceTimersByTime(visiblePollInterval);
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.advanceTimersByTime(visiblePollInterval);
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);
  });
});
