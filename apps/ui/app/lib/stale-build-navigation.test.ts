// @vitest-environment jsdom
import { createMemoryRouter } from 'react-router';
import type { DataRouter, MiddlewareFunction } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerVerdict } from '#filesystem/build-skew.js';

const skew = vi.hoisted(() => ({
  verdict: 'live' as ServerVerdict,
  hidden: false,
  queryLiveBuild: vi.fn(async () => undefined),
}));
vi.mock('#filesystem/build-skew.js', () => ({
  buildId: 1_793_602_644_446,
  queryLiveBuild: skew.queryLiveBuild,
  readServerVerdict: () => skew.verdict,
}));
vi.mock('@taucad/ui-core/lib/page-visibility', () => ({ isPageHidden: () => skew.hidden }));

const { documentHrefFor, hiddenRecheckAfter, installLiveBuildChecks, staleBuildMiddleware, visiblePollInterval } =
  await import('#lib/stale-build-navigation.js');

/** The origin of a memory router's requests, which the page's location matches here as a browser router's does. */
const origin = 'http://localhost';
const assign = vi.fn();
const replace = vi.fn();
/** What the root's client middleware saw on each call, beside the real one. */
const initiators: unknown[] = [];
const recordInitiator: MiddlewareFunction = (args) => {
  initiators.push((args as { readonly unstable_initiator?: unknown }).unstable_initiator);
};
const action = vi.fn(() => ({ saved: true }));
const loader = vi.fn(() => null);

/** The router React Router builds in the browser, as far as middleware goes: the root carries Tau's client middleware. */
const createRouter = (): DataRouter =>
  createMemoryRouter(
    [
      {
        id: 'root',
        path: '/',
        middleware: [recordInitiator, staleBuildMiddleware as MiddlewareFunction],
        loader,
        children: [{ id: 'page', path: '*', loader, action }],
      },
    ],
    { initialEntries: ['/w/home/cube'] },
  );

let router: DataRouter | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  skew.verdict = 'live';
  skew.hidden = false;
  skew.queryLiveBuild.mockClear();
  assign.mockClear();
  replace.mockClear();
  action.mockClear();
  initiators.length = 0;
  vi.stubGlobal('location', {
    ...new URL(`${origin}/w/home/cube`),
    origin,
    pathname: '/w/home/cube',
    search: '',
    hash: '',
    assign,
    replace,
  });
});

afterEach(() => {
  router?.dispose();
  router = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The server's verdict changes, as `build-skew` holds it. */
const setVerdict = (verdict: ServerVerdict): void => {
  skew.verdict = verdict;
};

/** Start the router and let its first load settle. */
const startRouter = async (): Promise<DataRouter> => {
  router = createRouter();
  router.initialize();
  await vi.waitFor(() => {
    expect(router?.state.initialized).toBe(true);
  });
  return router;
};

describe('documentHrefFor', () => {
  const here = new URL(`${origin}/w/home/cube`) as unknown as Location;
  const at = (path: string, init?: RequestInit): [Request, URL] => [
    new Request(new URL(path, origin), init),
    new URL(path, origin),
  ];

  it('loads a GET of another page of this origin, hash included', () => {
    expect(documentHrefFor(...at('/projects'), here)).toBe('/projects');
    expect(documentHrefFor(...at('/projects?q=a%20b#files'), here)).toBe('/projects?q=a%20b#files');
  });

  it('leaves submissions, other origins and the same page (back/forward included) to the router', () => {
    expect(documentHrefFor(...at('/projects', { method: 'POST', body: '' }), here)).toBeUndefined();
    expect(
      documentHrefFor(new Request('https://example.com/x'), new URL('https://example.com/x'), here),
    ).toBeUndefined();
    expect(documentHrefFor(...at('/w/home/cube#files'), here)).toBeUndefined();
  });
});

describe('staleBuildMiddleware on the root route', () => {
  it('leaves navigations to the router while the server names this build', async () => {
    const live = await startRouter();
    await live.navigate('/projects');
    expect(live.state.location.pathname).toBe('/projects');
    expect(assign).not.toHaveBeenCalled();
  });

  it('loads another page as a document once the server names another build, keeping replace', async () => {
    const live = await startRouter();
    setVerdict('replaced');

    await live.navigate('/projects');
    expect(assign).toHaveBeenCalledWith('/projects');

    await live.navigate('/projects/new?from=cube#top', { replace: true });
    expect(replace).toHaveBeenCalledWith('/projects/new?from=cube#top');

    // A relative destination is resolved by the router before the middleware sees it.
    await live.navigate('files', { relative: 'path' });
    expect(assign).toHaveBeenLastCalledWith('/w/home/cube/files');
    expect(live.state.location.pathname).toBe('/w/home/cube');
    expect(initiators).toContain('navigation');
  });

  it('leaves the same page, fetchers and revalidations to the router', async () => {
    const live = await startRouter();
    setVerdict('replaced');

    await live.navigate('/w/home/cube?');
    await live.fetch('fetcher', 'root', '/projects');
    await vi.waitFor(() => {
      expect(live.getFetcher('fetcher').state).toBe('idle');
    });
    await live.revalidate();

    expect(initiators).toEqual(expect.arrayContaining(['fetcher', 'revalidation']));
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('lets a submission’s action run and its page load in the router', async () => {
    const live = await startRouter();
    setVerdict('replaced');
    const formData = new FormData();
    formData.set('name', 'cube');

    await live.navigate('/projects', { formMethod: 'post', formData });

    expect(action).toHaveBeenCalledTimes(1);
    expect(live.state.location.pathname).toBe('/projects');
    expect(live.state.actionData).toEqual({ page: { saved: true } });
    expect(assign).not.toHaveBeenCalled();

    // The next navigation is a plain one again.
    await live.navigate('/files');
    expect(assign).toHaveBeenCalledWith('/files');
  });

  it('stops loading documents when the server names this build again', async () => {
    const live = await startRouter();
    setVerdict('replaced');
    setVerdict('live');
    await live.navigate('/projects');
    expect(live.state.location.pathname).toBe('/projects');
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('installLiveBuildChecks', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    uninstall = installLiveBuildChecks();
  });

  afterEach(() => {
    uninstall?.();
  });

  const setHidden = (hidden: boolean): void => {
    skew.hidden = hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  };

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
