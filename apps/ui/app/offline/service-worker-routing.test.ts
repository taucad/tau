import { describe, expect, it } from 'vitest';
import {
  activatesWorker,
  answerNavigation,
  installMessage,
  isCachedOnFirstUse,
  isSafeModeNavigation,
  isShellInBounds,
  navigationCandidate,
  readBuildFloorMessage,
  workerClasses,
} from '#offline/service-worker-routing.js';
import {
  activateIfBuildMessageType,
  buildFloorMessageType,
  serviceWorkerMessageType,
  skipWaitingMessageType,
} from '#offline/pwa-messages.js';
import type { NavigationCandidate, RequestFacts } from '#offline/service-worker-routing.js';
import { safeModeHref } from '#lib/boot-signals.js';

const origin = 'https://tau.new';
const projectDocument = '/w/__shell/__shell/index.html';
const homeDocument = '/__shell/home/index.html';
const usageDocument = '/usage/index.html';
const precached = new Set([projectDocument, homeDocument, usageDocument]);
const isPrecached = (document: string): boolean => precached.has(document);

const navigation = (path: string, overrides: Partial<RequestFacts> = {}): RequestFacts => ({
  url: new URL(path, origin).toString(),
  method: 'GET',
  mode: 'navigate',
  cache: 'default',
  ...overrides,
});

const candidateFor = (path: string, overrides?: Partial<RequestFacts>): NavigationCandidate => {
  const candidate = navigationCandidate(navigation(path, overrides), origin, isPrecached);
  if (candidate === undefined) {
    expect.fail(`${path} has no worker class`);
  }
  return candidate;
};

describe('the worker classes', () => {
  it('should answer the project shell, the Home shell and the usage page from their built documents', () => {
    expect(
      workerClasses.map(({ routeClass, delivery, document }) => ({ id: routeClass.id, delivery, document })),
    ).toStrictEqual([
      { id: 'project', delivery: 'cache-first', document: projectDocument },
      { id: 'home', delivery: 'cache-first', document: homeDocument },
      { id: 'offline-shell', delivery: 'network-first', document: usageDocument },
    ]);
  });
});

describe('navigationCandidate', () => {
  it.each([
    ['/w/home/bracket-v2', 'project'],
    ['/w/home/bracket-v2/', 'project'],
    ['/w/acme/proj_01HZ%20x', 'project'],
    ['/', 'home'],
    ['/?source=pwa', 'home'],
    ['/usage', 'offline-shell'],
    ['/usage/', 'offline-shell'],
  ])('should take the navigation to %s for the %s class', (path, id) => {
    expect(candidateFor(path).workerClass.routeClass.id).toBe(id);
  });

  it.each([
    // React Router's data requests, the project preview and every other `/w/…` shape stay on the function.
    '/w/home/bracket-v2.data',
    '/w/home/bracket-v2/_.data',
    '/_.data',
    '/_root.data',
    '/w/home/bracket-v2/preview',
    '/w/home',
    // Marketing, API, auth, resource and other app pages have no worker class.
    '/pricing',
    '/product/cad',
    '/api/v1/projects',
    '/auth/sign-in',
    '/health/build',
    '/projects',
    '/settings',
    '/s/published-model',
    '/manifest.webmanifest',
  ])('should leave the navigation to %s to the browser', (path) => {
    expect(navigationCandidate(navigation(path), origin, isPrecached)).toBeUndefined();
  });

  it('should leave a request alone unless it is a same-origin GET navigation', () => {
    expect(navigationCandidate(navigation('/w/a/b', { method: 'POST' }), origin, isPrecached)).toBeUndefined();
    expect(navigationCandidate(navigation('/w/a/b', { mode: 'cors' }), origin, isPrecached)).toBeUndefined();
    expect(
      navigationCandidate({ ...navigation('/'), url: 'https://www.tau.new/w/a/b' }, origin, isPrecached),
    ).toBeUndefined();
  });

  it('should leave a class to the browser when its document is not in this worker’s precache', () => {
    // A self-host build has no `/usage` route, so its worker precaches no usage document.
    expect(navigationCandidate(navigation('/usage'), origin, (document) => document !== usageDocument)).toBeUndefined();
  });
});

describe('answerNavigation', () => {
  const answer = (
    path: string,
    facts: Partial<{ tauEntry: string; updatePending: boolean; cache: string; shellInBounds: boolean }> = {},
  ): ReturnType<typeof answerNavigation> =>
    answerNavigation({
      candidate: candidateFor(path),
      request: navigation(path, facts.cache === undefined ? {} : { cache: facts.cache }),
      tauEntry: facts.tauEntry,
      updatePending: facts.updatePending ?? false,
      shellInBounds: facts.shellInBounds ?? true,
    });

  it('should ask the network first for a cache-first class while its shells are out of bounds (FP2)', () => {
    expect(answer('/w/home/bracket-v2', { shellInBounds: false })).toStrictEqual({
      kind: 'network-first',
      document: projectDocument,
    });
    expect(answer('/', { tauEntry: 'app', shellInBounds: false })).toStrictEqual({
      kind: 'network-first',
      document: homeDocument,
    });
  });

  it('should open a project from the precached shell, cache-first', () => {
    expect(answer('/w/home/bracket-v2')).toStrictEqual({ kind: 'cache-first', document: projectDocument });
  });

  it.each(['no-cache', 'reload', 'no-store'])(
    'should ask the network first on a reload (cache mode %s), so a reload never lands on a replaced deploy',
    (cache) => {
      expect(answer('/w/home/bracket-v2', { cache })).toStrictEqual({
        kind: 'network-first',
        document: projectDocument,
      });
    },
  );

  it('should ask the network first while a newer worker is installing or waiting (ruling OD3)', () => {
    expect(answer('/w/home/bracket-v2', { updatePending: true })).toStrictEqual({
      kind: 'network-first',
      document: projectDocument,
    });
  });

  it('should open Home from the Home shell only for a visit the deployed site gives the app', () => {
    expect(answer('/', { tauEntry: 'app' })).toStrictEqual({ kind: 'cache-first', document: homeDocument });
    expect(answer('/?source=pwa')).toStrictEqual({ kind: 'cache-first', document: homeDocument });
    // Marketing: no preference, the website preference, `?website`, or only campaign parameters.
    expect(answer('/')).toStrictEqual({ kind: 'network' });
    expect(answer('/', { tauEntry: 'website' })).toStrictEqual({ kind: 'network' });
    expect(answer('/?website', { tauEntry: 'app' })).toStrictEqual({ kind: 'network' });
    expect(answer('/?utm_source=launch&ref=hn')).toStrictEqual({ kind: 'network' });
  });

  it('should answer the usage page network-first, whatever the cache mode', () => {
    expect(answer('/usage')).toStrictEqual({ kind: 'network-first', document: usageDocument });
  });
});

describe('isCachedOnFirstUse', () => {
  it.each(['/assets/route-Dq3Xc9.js', '/assets/replicad_single-abc.wasm', '/csharp-language/0f3a/runtime.dll'])(
    'should cache %s on first use',
    (path) => {
      expect(isCachedOnFirstUse({ url: `${origin}${path}`, method: 'GET' }, origin)).toBe(true);
    },
  );

  it.each([
    ['GET', 'https://cdn.example.com/assets/x.js'],
    ['GET', `${origin}/fonts/Geist-Variable.woff2`],
    ['GET', `${origin}/w/home/bracket-v2.data`],
    ['GET', `${origin}/__manifest`],
    ['POST', `${origin}/assets/x.js`],
  ])('should not cache %s %s', (method, url) => {
    expect(isCachedOnFirstUse({ url, method }, origin)).toBe(false);
  });
});

describe('installMessage', () => {
  it('should report a completed install, a quota failure and any other failure', () => {
    expect(installMessage()).toStrictEqual({ type: serviceWorkerMessageType, status: 'ready' });
    expect(installMessage(new DOMException('full', 'QuotaExceededError'))).toMatchObject({ status: 'quota-exceeded' });
    expect(installMessage(new TypeError('Failed to fetch'))).toStrictEqual({
      type: serviceWorkerMessageType,
      status: 'failed',
      detail: 'Failed to fetch',
    });
  });
});

describe('activatesWorker (FP3)', () => {
  it('should activate on the update rule’s message whatever the build', () => {
    expect(activatesWorker({ type: skipWaitingMessageType }, 0)).toBe(true);
    expect(activatesWorker({ type: skipWaitingMessageType }, 7)).toBe(true);
  });

  it('should activate on an activate-if-build message only for this worker’s known build', () => {
    expect(activatesWorker({ type: activateIfBuildMessageType, buildId: 7 }, 7)).toBe(true);
    expect(activatesWorker({ type: activateIfBuildMessageType, buildId: 6 }, 7)).toBe(false);
    expect(activatesWorker({ type: activateIfBuildMessageType, buildId: 0 }, 0)).toBe(false);
    expect(activatesWorker({ type: activateIfBuildMessageType, buildId: '7' }, 7)).toBe(false);
  });

  it('should ignore anything else', () => {
    for (const data of [undefined, null, 'SKIP_WAITING', { type: 'other' }]) {
      expect(activatesWorker(data, 7)).toBe(false);
    }
  });
});

describe('isSafeModeNavigation (FP5)', () => {
  it('should know the safe-mode link the strip and the error document send', () => {
    expect(isSafeModeNavigation(new URL(safeModeHref, origin).href)).toBe(true);
    expect(isSafeModeNavigation(`${origin}/w/home/bracket?safe=1`)).toBe(true);
  });

  it('should leave every other navigation to the worker’s rules', () => {
    for (const url of [`${origin}/`, `${origin}/?safe=0`, `${origin}/?unsafe=1`, 'not a url']) {
      expect(isSafeModeNavigation(url), url).toBe(false);
    }
  });
});

describe('isShellInBounds (FP2)', () => {
  const buildId = 1_795_000_000_000;

  it('should hold the shells while the server has reported no floor, whatever the build', () => {
    expect(isShellInBounds({ buildId, floor: undefined })).toBe(true);
    expect(isShellInBounds({ buildId: 0, floor: undefined })).toBe(true);
  });

  it('should hold the shells of a build at or above the floor, and not those of a build below it', () => {
    expect(isShellInBounds({ buildId, floor: buildId })).toBe(true);
    expect(isShellInBounds({ buildId, floor: buildId - 1 })).toBe(true);
    expect(isShellInBounds({ buildId, floor: buildId + 1 })).toBe(false);
  });

  it('should not hold the shells of an unknown build (0) once a floor is reported', () => {
    expect(isShellInBounds({ buildId: 0, floor: 1 })).toBe(false);
  });
});

describe('readBuildFloorMessage (FP2)', () => {
  it('should read the floor a page relays from the server', () => {
    expect(readBuildFloorMessage({ type: buildFloorMessageType, minBuildId: 1_795_000_000_000 })).toStrictEqual({
      minBuildId: 1_795_000_000_000,
    });
  });

  it('should read a relayed answer that names no floor as none', () => {
    expect(readBuildFloorMessage({ type: buildFloorMessageType })).toStrictEqual({ minBuildId: undefined });
    expect(readBuildFloorMessage({ type: buildFloorMessageType, minBuildId: undefined })).toStrictEqual({
      minBuildId: undefined,
    });
  });

  it.each([
    ['another message', { type: skipWaitingMessageType }],
    ['no object', 'tau-build-floor'],
    ['a floor that is no build id', { type: buildFloorMessageType, minBuildId: -5 }],
    ['a fractional floor', { type: buildFloorMessageType, minBuildId: 1.5 }],
    ['a floor as text', { type: buildFloorMessageType, minBuildId: '1795000000000' }],
  ])('should ignore %s', (_label, data) => {
    expect(readBuildFloorMessage(data)).toBeUndefined();
  });
});
