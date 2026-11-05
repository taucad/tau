// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerVerdict } from '#filesystem/build-skew.js';

const skew = vi.hoisted(() => ({
  verdict: 'live' as ServerVerdict,
  hidden: false,
  listeners: new Set<() => void>(),
  queryLiveBuild: vi.fn(async () => undefined),
}));
vi.mock('#filesystem/build-skew.js', () => ({
  buildId: 1_793_602_644_446,
  queryLiveBuild: skew.queryLiveBuild,
  readServerVerdict: () => skew.verdict,
  subscribeServerVerdict: (listener: () => void) => {
    skew.listeners.add(listener);
    return () => skew.listeners.delete(listener);
  },
}));
vi.mock('#lib/page-visibility.js', () => ({ isPageHidden: () => skew.hidden }));

const { documentHrefFor, hiddenRecheckAfter, installStaleBuildNavigation, visiblePollInterval } =
  await import('#lib/stale-build-navigation.js');

/** The server's verdict changes, as `build-skew` announces it. */
const setVerdict = (verdict: ServerVerdict): void => {
  skew.verdict = verdict;
  for (const listener of skew.listeners) {
    listener();
  }
};

const setHidden = (hidden: boolean): void => {
  skew.hidden = hidden;
  document.dispatchEvent(new Event('visibilitychange'));
};

const routerNavigate = vi.fn(async () => undefined);
const router: { navigate: (to: unknown, options?: Record<string, unknown>) => Promise<void> } = {
  navigate: routerNavigate,
};
const assign = vi.fn();
const replace = vi.fn();
let uninstall: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  skew.verdict = 'live';
  skew.hidden = false;
  skew.queryLiveBuild.mockClear();
  routerNavigate.mockClear();
  router.navigate = routerNavigate;
  vi.stubGlobal('__reactRouterDataRouter', router);
  vi.stubGlobal('location', { ...globalThis.location, pathname: '/w/home/cube', search: '', assign, replace });
  assign.mockClear();
  replace.mockClear();
  uninstall = installStaleBuildNavigation();
});

afterEach(() => {
  uninstall?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('documentHrefFor', () => {
  const here = new URL('https://taucad.dev/w/home/cube') as unknown as Location;

  it('loads an absolute in-app path to another page', () => {
    expect(documentHrefFor('/projects', undefined, here)).toBe('/projects');
    expect(documentHrefFor({ pathname: '/projects', search: '?q=1' }, undefined, here)).toBe('/projects?q=1');
  });

  it('leaves relative, numeric, same-page, protocol-relative and submitting navigations to the router', () => {
    expect(documentHrefFor('projects', undefined, here)).toBeUndefined();
    expect(documentHrefFor(-1, undefined, here)).toBeUndefined();
    expect(documentHrefFor('/w/home/cube#files', undefined, here)).toBeUndefined();
    expect(documentHrefFor('//example.com/x', undefined, here)).toBeUndefined();
    expect(documentHrefFor('/projects', { formData: new FormData() }, here)).toBeUndefined();
  });
});

describe('installStaleBuildNavigation', () => {
  it('leaves navigations to the router while the server names this build', async () => {
    await router.navigate('/projects');
    expect(routerNavigate).toHaveBeenCalledWith('/projects');
    expect(assign).not.toHaveBeenCalled();
  });

  it('loads an in-app destination as a document once the server names another build, and stops when it no longer does', async () => {
    setVerdict('replaced');
    void router.navigate('/projects');
    void router.navigate('/projects/new', { replace: true });
    expect(assign).toHaveBeenCalledWith('/projects');
    expect(replace).toHaveBeenCalledWith('/projects/new');
    expect(routerNavigate).not.toHaveBeenCalled();

    await router.navigate('projects');
    expect(routerNavigate).toHaveBeenCalledWith('projects', undefined);

    setVerdict('live');
    expect(router.navigate).toBe(routerNavigate);
  });

  it('asks the server when a tab is shown again after a long absence, not after a short one', () => {
    setHidden(true);
    vi.advanceTimersByTime(hiddenRecheckAfter - 1);
    setHidden(false);
    expect(skew.queryLiveBuild).not.toHaveBeenCalled();

    setHidden(true);
    vi.advanceTimersByTime(hiddenRecheckAfter);
    setHidden(false);
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);
  });

  it('asks the server on a timer only while visible', () => {
    vi.advanceTimersByTime(visiblePollInterval);
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);

    skew.hidden = true;
    vi.advanceTimersByTime(visiblePollInterval);
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);
  });

  it('asks the server when the page comes back from the back/forward cache', () => {
    globalThis.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(skew.queryLiveBuild).toHaveBeenCalledTimes(1);
  });
});
