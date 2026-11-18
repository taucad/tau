// @vitest-environment node
/**
 * The route-class registry (progressive loading P1) and the static-shell routing it generates (PL3).
 *
 * The deployed site routes a request in Netlify's order: edge functions, then functions (the React Router function at
 * `/*` minus its `excludedPaths`, `preferStatic`), then redirects and rewrites in file order, then static files. This
 * file models that chain from the generated configuration and checks it against every `/w/…` shape the app or a
 * visitor can send, and against the URLs that must never reach a shell. A wrong rewrite would serve the wrong document
 * to every project URL, so the table is exhaustive by shape, not a sample.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { matchPath } from 'react-router';
import { describe, expect, it } from 'vitest';
import { metaConfig } from '#constants/meta.constants.js';
import {
  appStartUrl,
  classesOwningRoute,
  homeAppEntry,
  edgeShellClasses,
  routeClassOfRouteId,
  isStaticShellPath,
  netlifyFunctionExcludedPaths,
  netlifyShellRedirects,
  prerenderedFiles,
  renderNetlifyShellRouting,
  rewriteShellClasses,
  routeClasses,
  shellDocumentFile,
  shellSentinel,
  shellSkewCookie,
  staticShellClasses,
  staticShellFor,
  workerRouteClasses,
} from '#lib/route-classes.js';
import { skewProtectionCookie, skewProtectionCookieName } from '#lib/skew-protection.server.js';
import { listSitemapPaths, listStaticPrerenderPaths } from '#lib/static-paths.js';
/* oxlint-disable eslint/no-restricted-imports -- Netlify bundles every file in edge-functions/, outside the app alias root. */
import {
  homeShellDocument,
  config as marketingEdge,
  selectDelivery,
  shellSkewCookie as marketingShellSkewCookie,
} from '../../netlify/edge-functions/marketing.js';
import { config as marketingEventsEdge } from '../../netlify/edge-functions/marketing-events.js';
import { config as posthogEdge } from '../../netlify/edge-functions/posthog.js';
import { config as staticShellEdge, shellSkewCookieExpiry } from '../../netlify/edge-functions/static-shell.js';
/* oxlint-enable eslint/no-restricted-imports */

const appRoot = resolve(import.meta.dirname, '..');
const uiRoot = resolve(appRoot, '..');
const routesRoot = join(appRoot, 'routes');
const toml = readFileSync(join(uiRoot, 'netlify.toml'), 'utf8');

/** Every `app/routes` entry `flatRoutes` turns into a route: a directory with a `route` module, or a route file. */
const routeEntries = readdirSync(routesRoot, { withFileTypes: true })
  .filter((entry) =>
    entry.isDirectory()
      ? ['tsx', 'ts'].some((extension) => existsSync(join(routesRoot, entry.name, `route.${extension}`)))
      : /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec)\.tsx?$/u.test(entry.name),
  )
  .map((entry) => entry.name);

/**
 * Netlify's compiled form of one `excludedPath`: the URLPattern, plus the optional trailing slash
 * `@netlify/zip-it-and-ship-it` (`getRoutes`) appends to every expression.
 */
const excludedByFunction = (pathname: string): boolean =>
  netlifyFunctionExcludedPaths().some((path) => {
    const pattern = new URLPattern({ pathname: path });
    return pattern.test({ pathname }) || (pathname.endsWith('/') && pattern.test({ pathname: pathname.slice(0, -1) }));
  });

/** Netlify's redirect `from` matching: literal segments, `:name` for one segment, a trailing `*` for the rest. */
const redirectMatches = (from: string, url: URL): boolean => {
  const isHostRule = /^https?:\/\//u.test(from);
  const fromUrl = isHostRule ? new URL(from.replace('/*', '/__splat__')) : undefined;
  if (fromUrl !== undefined && fromUrl.host !== url.host) {
    return false;
  }
  const pattern = (fromUrl === undefined ? from : fromUrl.pathname.replace('/__splat__', '/*')).split('/');
  const segments = url.pathname.split('/');
  for (const [index, part] of pattern.entries()) {
    if (part === '*') {
      return true;
    }
    const segment = segments[index];
    if (segment === undefined || (part.startsWith(':') ? segment === '' : segment !== part)) {
      return false;
    }
  }
  return segments.length === pattern.length;
};

type Routed =
  | Readonly<{ kind: 'function' }>
  | Readonly<{ kind: 'rewrite'; to: string }>
  | Readonly<{ kind: 'redirect'; to: string; status: number }>
  | Readonly<{ kind: 'not found' }>;

/** Where the deployed site sends a request, from the generated function exclusions and redirect rules. */
const route = (href: string): Routed => {
  const url = new URL(href, `https://${metaConfig.appDomain}`);
  if (!excludedByFunction(url.pathname)) {
    return { kind: 'function' };
  }
  const rule = netlifyShellRedirects(metaConfig.appDomain).find((candidate) => redirectMatches(candidate.from, url));
  if (rule === undefined) {
    return { kind: 'not found' };
  }
  if (rule.status === 200) {
    return { kind: 'rewrite', to: rule.to };
  }
  const splat = url.pathname.split('/').slice(2).join('/');
  return { kind: 'redirect', status: rule.status, to: rule.to.replace(':splat', splat) };
};

const projectClass = staticShellClasses.find((routeClass) => routeClass.id === 'project');
const projectShell = projectClass === undefined ? '' : `/${shellDocumentFile(projectClass)}`;
const homeClass = staticShellClasses.find((routeClass) => routeClass.id === 'home');

describe('route-class registry', () => {
  it('should give every route module exactly one class', () => {
    expect(routeEntries.length).toBeGreaterThan(40);
    const unclassed = routeEntries.filter((entry) => classesOwningRoute(entry).length !== 1);
    expect(unclassed, 'a route must state how its documents are delivered').toStrictEqual([]);
  });

  it('should name only routes that exist', () => {
    for (const routeClass of routeClasses) {
      for (const owned of routeClass.routes) {
        const claimed = owned.endsWith('*')
          ? routeEntries.some((entry) => entry.startsWith(owned.slice(0, -1)))
          : routeEntries.includes(owned);
        expect(claimed, `${routeClass.id} names ${owned}`).toBe(true);
      }
    }
  });

  it('should keep each class id unique', () => {
    const ids = routeClasses.map((routeClass) => routeClass.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(staticShellClasses)('should serve the $label shell from one route whose pattern is its match', (shell) => {
    expect(shell.routes).toHaveLength(1);
    const [entry] = shell.routes;
    // `flatRoutes`: dots separate segments, `$name` is a parameter, `_index` is the parent's index route.
    const pattern = `/${(entry ?? '')
      .split('.')
      .filter((segment) => segment !== '_index')
      .map((segment) => segment.replace(/^\$/u, ':'))
      .join('/')}`;
    expect(pattern).toBe(shell.match);
    expect(shell.shellPath).toBe(shell.match.replaceAll(/:\w+/gu, shellSentinel));
    expect(isStaticShellPath(shell.shellPath)).toBe(true);
    expect(isStaticShellPath(`${shell.shellPath}/`)).toBe(true);
  });

  it('should prerender every shell and advertise none in the sitemap', () => {
    for (const shell of staticShellClasses) {
      expect(listStaticPrerenderPaths()).toContain(shell.shellPath);
      expect(listSitemapPaths()).not.toContain(shell.shellPath);
    }
  });
});

describe('static-shell routing on Netlify (PL3)', () => {
  it('should exclude from the function only one-segment parameters that hold no dot', () => {
    expect(netlifyFunctionExcludedPaths()).toStrictEqual([String.raw`/w/:workspace([^\/.]+)/:project([^\/.]+)`]);
  });

  it.each([
    ['a slug pair', '/w/home/bracket-v2'],
    ['a trailing slash', '/w/home/bracket-v2/'],
    ['ids', '/w/ws_01jx4k8m2n/proj_01jx4k9a7b'],
    ['percent-escaped Unicode slugs', '/w/%E2%9C%93-lab/%C3%A9t%C3%A9'],
    ['upper case (slugs fold case)', '/w/Home/Bracket-V2'],
    ['a query', '/w/home/bracket-v2?chat=chat_01&utm_source=mail'],
    ['a hash-free deep link with digits', '/w/home/project-1'],
    ['the shell itself', '/w/__shell/__shell'],
  ])('should rewrite %s to the project shell', (_shape, href) => {
    expect(route(href)).toStrictEqual({ kind: 'rewrite', to: projectShell });
    expect(staticShellFor(new URL(href, 'https://tau.new').pathname)?.id).toBe('project');
    // The prerendered route is the one React Router matches at the real URL, so params resolve to it on hydration.
    expect(matchPath('/w/:workspace/:project', new URL(href, 'https://tau.new').pathname)).not.toBeNull();
  });

  it.each([
    ['the project preview', '/w/home/bracket-v2/preview'],
    ['the project preview with a trailing slash', '/w/home/bracket-v2/preview/'],
    ['a deeper path', '/w/home/bracket-v2/files/main.ts'],
    ["a project document's data request", '/w/home/bracket-v2.data'],
    ['a data request with its routes', '/w/home/bracket-v2.data?_routes=root'],
    ["the preview's data request", '/w/home/bracket-v2/preview.data'],
    ['a dotted segment', '/w/home/bracket.v2'],
    ['a workspace alone', '/w/home'],
    ['a workspace with a trailing slash', '/w/home/'],
    ['a workspace data request', '/w/home.data'],
    ['an empty project segment', '/w/home//'],
    ['an empty workspace segment', '/w//bracket-v2'],
    ['the prefix alone', '/w'],
    ['the prefix with a slash', '/w/'],
    ['a look-alike prefix', '/wx/home/bracket-v2'],
    ['a look-alike file', '/w.data'],
    ['Home', '/'],
    ["Home's data request", '/_root.data'],
    ["Home's trailing-slash data request", '/_.data'],
    ["a project's trailing-slash data request", '/w/home/bracket-v2/_.data'],
    ["a workspace's trailing-slash data request", '/w/home/_.data'],
    ['the library', '/projects'],
    ['a new project', '/projects/new'],
    ['a publication', '/s/abc123'],
    ['the offline shell', '/usage'],
    ['settings', '/settings/billing'],
    ['the API proxy', '/api/ph/e/'],
    ['a health endpoint', '/health/build'],
    ['a hashed asset', '/assets/route-Dq3Xc9.js'],
    ['an import link', '/import/https%3A%2F%2Fexample.com%2Fa.ts'],
    ['a marketing page', '/pricing'],
  ])('should leave %s to the function and its own static files', (_shape, href) => {
    expect(route(href)).toStrictEqual({ kind: 'function' });
    expect(staticShellFor(new URL(href, 'https://tau.new').pathname)).toBeUndefined();
  });

  it('should redirect a project URL on the www alias to the apex, as the root loader does, path and query kept', () => {
    expect(route('https://www.tau.new/w/home/bracket-v2?chat=chat_01')).toStrictEqual({
      kind: 'redirect',
      status: 301,
      to: 'https://tau.new/w/home/bracket-v2',
    });
    // Netlify passes the query string through a redirect that does not match on it.
    expect(netlifyShellRedirects(metaConfig.appDomain)[0]).toStrictEqual({
      from: 'https://www.tau.new/w/*',
      to: 'https://tau.new/w/:splat',
      status: 301,
      force: true,
    });
  });

  it('should never exclude a URL that no rewrite serves', () => {
    const shapes = [
      '/w/a/b',
      '/w/a/b/',
      '/w/A-1/b_2',
      '/w/%20/x',
      '/w/a/b/c',
      '/w/a.b/c',
      '/w/a/b.c',
      '/w/a//',
      '/w//',
    ];
    for (const pathname of shapes) {
      expect(route(pathname).kind, pathname).not.toBe('not found');
      expect(excludedByFunction(pathname), pathname).toBe(staticShellFor(pathname) !== undefined);
    }
  });

  it('should keep the shell URLs out of every edge function but the static shell one', () => {
    const shellUrls = ['/w/home/bracket-v2', '/w/home/bracket-v2/', '/w/__shell/__shell'];
    const edgePaths = [marketingEdge.path, marketingEventsEdge.path, posthogEdge.path].flat();
    for (const edgePath of edgePaths) {
      const pattern = new URLPattern({ pathname: edgePath });
      for (const pathname of shellUrls) {
        expect(pattern.test({ pathname }), `${edgePath} would run before ${pathname}`).toBe(false);
      }
    }
  });

  it('should run the static shell edge function on exactly the URLs the function excludes', () => {
    expect(staticShellEdge.path).toStrictEqual(netlifyFunctionExcludedPaths());
    // `@netlify/edge-bundler` compiles an edge path as `getRoutes` does an excluded one: with an optional trailing slash.
    const runsEdge = (pathname: string): boolean =>
      staticShellEdge.path.some((path) => {
        const pattern = new URLPattern({ pathname: path });
        return (
          pattern.test({ pathname }) || (pathname.endsWith('/') && pattern.test({ pathname: pathname.slice(0, -1) }))
        );
      });
    const shapes = [
      '/w/home/bracket-v2',
      '/w/home/bracket-v2/',
      '/w/__shell/__shell',
      '/w/home/bracket-v2.data',
      '/w/home/bracket-v2/preview',
      '/w/home/bracket-v2/preview.data',
      '/w/home',
      '/w/a//',
      '/',
    ];
    for (const pathname of shapes) {
      expect(runsEdge(pathname), pathname).toBe(staticShellFor(pathname) !== undefined);
    }
  });
});

describe('the Home shell behind the marketing edge function (PL4)', () => {
  it('should be the static shell of the index route, prerendered at `/`', () => {
    expect(homeClass).toMatchObject({ delivery: 'static-shell', via: 'edge', match: '/', shellPath: '/' });
    expect(classesOwningRoute('_index').map((routeClass) => routeClass.id)).toStrictEqual(['home']);
    expect(isStaticShellPath('/')).toBe(true);
  });

  it('should be the file the marketing edge function rewrites `/` to', () => {
    expect(homeClass === undefined ? undefined : `/${shellDocumentFile(homeClass)}`).toBe(homeShellDocument);
    expect(marketingEdge.path).toContain('/');
  });

  it("should expire the skew cookie as the project shell's static header does", () => {
    expect(marketingShellSkewCookie).toBe(shellSkewCookie(skewProtectionCookieName));
  });

  it('should add no function exclusion, rewrite or header rule: the edge function alone chooses it', () => {
    expect(netlifyFunctionExcludedPaths()).toHaveLength(rewriteShellClasses.length);
    for (const rule of netlifyShellRedirects(metaConfig.appDomain)) {
      expect(redirectMatches(rule.from, new URL('https://tau.new/')), rule.from).toBe(false);
      expect(redirectMatches(rule.from, new URL('https://www.tau.new/')), rule.from).toBe(false);
    }
    // `/`, the root data request by either name and `/?…` reach the function as before whenever the edge function
    // passes them on.
    for (const href of [
      '/',
      '/?app',
      '/_root.data',
      '/_root.data?_routes=root,routes/_index',
      '/_.data',
      '/_.data?_routes=root,routes/_index',
      '/index.html',
    ]) {
      expect(route(href), href).toStrictEqual({ kind: 'function' });
    }
    expect(staticShellFor('/')).toBeUndefined();
  });
});

describe('generated Netlify configuration', () => {
  it('should hold the generated routing block verbatim', () => {
    const block = /# BEGIN static shell routing\n([\s\S]*?)# END static shell routing\n/u.exec(toml)?.[1];
    expect(block).toBe(
      `${renderNetlifyShellRouting({ canonicalHost: metaConfig.appDomain, skewCookieName: skewProtectionCookieName })}`,
    );
  });

  it('should hand the function its exclusions in the Netlify build', () => {
    const viteConfig = readFileSync(join(uiRoot, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('netlifyReactRouter({ excludedPaths: netlifyFunctionExcludedPaths() })');
  });

  it('should rewrite to the file the prerender pass writes', () => {
    expect(rewriteShellClasses.length).toBeGreaterThan(0);
    for (const shell of rewriteShellClasses) {
      expect(shellDocumentFile(shell)).toBe(`${shell.shellPath.slice(1)}/index.html`);
      expect(shellDocumentFile(shell)).toBe(prerenderedFiles(shell.shellPath).document);
    }
  });

  it("should serve an edge shell from a file of its own, away from its URL's static path", () => {
    expect(edgeShellClasses.map((shell) => shell.id)).toStrictEqual(['home']);
    for (const shell of edgeShellClasses) {
      expect(shellDocumentFile(shell)).toBe(`${shellSentinel}/${shell.id}/index.html`);
      expect(shellDocumentFile(shell)).not.toBe(prerenderedFiles(shell.shellPath).document);
    }
  });

  it('should name the files the React Router prerender writes for a path', () => {
    expect(prerenderedFiles('/')).toStrictEqual({ document: 'index.html', data: ['_root.data', '_.data'] });
    expect(prerenderedFiles('/w/__shell/__shell')).toStrictEqual({
      document: 'w/__shell/__shell/index.html',
      data: ['w/__shell/__shell.data'],
    });
  });
});

describe('skew protection on a shell response', () => {
  /** A cookie's attributes, lower-cased, without its value. */
  const attributes = (cookie: string): string[] =>
    cookie
      .split(';')
      .slice(1)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => !part.startsWith('max-age'))
      .toSorted();

  it("should expire the function document's cookie, so no older deploy's token pins the shell's assets", () => {
    const functionCookie = skewProtectionCookie('deploy-token');
    const shellCookie = shellSkewCookie(skewProtectionCookieName);
    expect(functionCookie).toBeDefined();
    expect(shellCookie.startsWith(`${skewProtectionCookieName}=;`)).toBe(true);
    expect(shellCookie).toContain('Max-Age=0');
    // Same name, path and flags, so the browser replaces the function's cookie instead of adding a second one.
    expect(attributes(shellCookie)).toStrictEqual(attributes(functionCookie ?? ''));
  });

  it('should send it on the shell URLs, which Netlify headers reach, and not on function responses', () => {
    expect(toml).toContain(
      `[[headers]]\nfor = "/w/*"\n[headers.values]\nSet-Cookie = "${shellSkewCookie(skewProtectionCookieName)}"\n`,
    );
    // `netlify.toml` header rules do not apply to function responses, so `.data` and `/preview` keep their pin.
    expect(route('/w/home/bracket-v2.data')).toStrictEqual({ kind: 'function' });
  });

  it('should expire it from the edge function too, since the edge cache serves the file without the header rule', () => {
    expect(shellSkewCookieExpiry).toBe(shellSkewCookie(skewProtectionCookieName));
  });
});

describe('routeClassOfRouteId (RR7)', () => {
  it.each([
    { routeId: 'routes/w.$workspace.$project', classId: 'project' },
    { routeId: 'routes/_index', classId: 'home' },
    { routeId: 'routes/projects_.new', classId: 'app-page' },
    { routeId: 'routes/health.live', classId: 'resource' },
    { routeId: 'routes/manifest[.webmanifest]', classId: 'public-file' },
    { routeId: 'routes/[__e2e].geospec-runner', classId: 'fixture' },
    { routeId: 'root', classId: undefined },
    { routeId: 'routes/not-a-route', classId: undefined },
  ])('should name $routeId as $classId, a file route by its name without the extension', ({ routeId, classId }) => {
    expect(routeClassOfRouteId(routeId)?.id).toBe(classId);
  });
});

describe('the service worker’s classes (PL7)', () => {
  it('should answer the two static shells cache-first and the usage page network-first, from their built files', () => {
    expect(
      workerRouteClasses().map(({ routeClass, delivery, document }) => [routeClass.id, delivery, document]),
    ).toStrictEqual([
      ['project', 'cache-first', '/w/__shell/__shell/index.html'],
      ['home', 'cache-first', homeShellDocument],
      ['offline-shell', 'network-first', '/usage/index.html'],
    ]);
    expect(listStaticPrerenderPaths()).toContain('/usage');
  });

  it('should match exactly the URLs Netlify serves each shell for', () => {
    const [project, home] = workerRouteClasses();
    for (const path of ['/w/home/bracket-v2', '/w/home/bracket-v2/', '/w/a/b.data', '/w/a/b/preview', '/w/a', '/']) {
      expect(project?.matches(path), path).toBe(staticShellFor(path)?.id === 'project');
    }
    expect(home?.matches('/')).toBe(true);
    expect(home?.matches('/projects')).toBe(false);
  });

  /* The worker answers `/` with the Home shell exactly when the marketing edge function would. */
  it.each([
    ['/', undefined],
    ['/', 'app'],
    ['/', 'website'],
    ['/?website', 'app'],
    ['/?website=1', undefined],
    ['/?utm_source=x&ref=hn', undefined],
    ['/?utm_source=x', 'app'],
    ['/?app', undefined],
    ['/?code=abc&state=x', undefined],
    [appStartUrl, undefined],
    [appStartUrl, 'website'],
  ])('should agree with the marketing edge function on whether %s with tau-entry %s is Home', (href, tauEntry) => {
    const url = new URL(href, 'https://tau.new');
    const request = new Request(url, { headers: tauEntry === undefined ? {} : { cookie: `tau-entry=${tauEntry}` } });
    const delivery = selectDelivery(request, url, 'https://marketing.example');
    expect(homeAppEntry(url.searchParams, tauEntry)).toBe(delivery.kind !== 'marketing');
  });
});
