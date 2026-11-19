/**
 * The route-class registry (progressive loading primitive P1, Brain `research/progressive-loading-architecture.md`).
 *
 * Every route module under `app/routes` belongs to exactly one class, and the class states how its documents are
 * delivered and, for the guarded classes, what they load on every open. It is the one source for:
 *
 * - the prerender list (`static-paths.ts`, read by `react-router.config.ts`);
 * - the Netlify routing of static shells: the React Router function's `excludedPaths` (`vite.config.ts`) and the
 *   rewrite, redirect and header rules of `netlify.toml`, which {@link renderNetlifyShellRouting} generates and
 *   `route-classes.test.ts` holds equal to the checked-in file, and the Home shell's file, which the marketing edge
 *   function names and the build moves into place (`scripts/place-static-shells.ts`);
 * - the interactive roots the critical-path guards measure (`scripts/critical-path.mts`), and the warm manifest the
 *   build writes from them (`scripts/write-warm-manifest.ts`, read by `warm-next-step.ts` and the marketing site);
 * - the shell invariants checked on the build output (`scripts/check-static-shells.mts`);
 * - the web app's one service worker (progressive loading PL7, `app/offline/service-worker.ts`): which documents it
 *   precaches and answers, and how ({@link WorkerDelivery}); the build generates its precache list from the same
 *   classes (`scripts/build-service-worker.ts`).
 *
 * The file imports nothing, so build configuration and native Node scripts can read it before app aliases exist.
 */

/**
 * How a class's documents reach the browser.
 *
 * - `static-shell`: one document per class, prerendered at {@link StaticShellClass.shellPath} and served by the CDN for
 *   every URL the class matches. Its bytes depend on the deploy and nothing else.
 * - `prerendered`: prerendered at its own path (the offline shell, public files).
 * - `function`: rendered per request by the server function.
 * - `cdn-ssr`: rendered by the server function and kept by the CDN.
 */
export type RouteDelivery = 'static-shell' | 'prerendered' | 'function' | 'cdn-ssr';

/**
 * How the web app's one service worker answers a document request of a class (progressive loading PL7, ruling OD3).
 * The worker precaches the class's one document with the deploy it was built by, and replays it whole, headers
 * included; it never synthesises a document.
 *
 * - `cache-first`: from the precache, so an installed visitor opens the class with no request and offline. A reload, or
 *   a newer worker installing or waiting, asks the network first instead, so a reload never lands on a replaced deploy.
 * - `network-first`: the network, answered from the precache when it fails or has not answered within the worker's
 *   bound (the offline usage page, B5).
 *
 * A class without one is never answered by the worker: its documents, data requests and everything else pass through.
 */
export type WorkerDelivery = 'cache-first' | 'network-first';

type RouteClassBase = Readonly<{
  /** Key in `critical-budget.json` and in reports. */
  id: string;
  /** Name in test titles and reports. */
  label: string;
  /**
   * The `app/routes` entries this class owns, as `flatRoutes` reads them: a directory holding a `route` module, or a
   * route file. A trailing `*` owns every entry with that prefix (the e2e fixtures).
   */
  routes: readonly string[];
  /**
   * The modules the class evaluates on every open, app-relative: the shell's entry and root, the route module, and the
   * dynamic chunks the route requests on every open (an on-demand chunk requested at mount is still paid on every open,
   * so it belongs to the interactive tier). Present on the classes the critical-path guards measure.
   */
  interactive?: readonly string[];
  /**
   * The class whose interactive tier this class's documents prefetch once idle (progressive loading PL8,
   * `warm-next-step.ts`): the step a visitor most likely takes next. It names a class with {@link interactive} roots.
   */
  warms?: string;
  /** How the service worker answers the class's documents; absent when it never does. */
  worker?: WorkerDelivery;
}>;

/** A class served by one prerendered document for all of its URLs. */
export type StaticShellClass = RouteClassBase &
  Readonly<{
    delivery: 'static-shell';
    /**
     * The URL pattern the shell serves: literal segments and `:name` segments, each `:name` one path segment with no
     * dot ({@link shellSegment}). React Router's route for it must match the same URLs.
     */
    match: string;
    /** Where the shell is prerendered: the pattern with each `:name` replaced by {@link shellSentinel}. */
    shellPath: string;
    /**
     * What sends a request to the shell.
     *
     * - `rewrite`: Netlify, from the URL alone. The function excludes the class's URLs and a generated `netlify.toml`
     *   rule rewrites them to the shell's prerendered file.
     * - `edge`: the marketing edge function (`netlify/edge-functions/marketing.ts`), per request, because the same URL
     *   also serves marketing. The build moves the prerendered file to {@link shellDocumentFile} (`place-static-shells.ts`)
     *   so that a request the edge function passes on reaches the function as before and never a static file.
     */
    via: 'rewrite' | 'edge';
  }>;

/** A class whose documents are not a shared shell. */
export type DocumentRouteClass = RouteClassBase &
  Readonly<{
    delivery: Exclude<RouteDelivery, 'static-shell'>;
    /** The one path a `prerendered` class's document is prerendered at, when the service worker answers it. */
    path?: string;
  }>;

export type RouteClass = StaticShellClass | DocumentRouteClass;

/**
 * The placeholder a shell is prerendered with in place of each route parameter. No slug can hold it: slugs are letters,
 * digits and hyphens (`projectNameToSlug`), and ids start with their kind (`proj_`). Shell invariant 6 holds it out of
 * everything the shell renders.
 */
export const shellSentinel = '__shell';

/**
 * The one-segment grammar a shell parameter matches: any segment without a dot. Every slug and id the app writes is one
 * (percent escapes included); a dot marks React Router's `<path>.data` and `<path>/_.data` requests and file names,
 * which stay on the function. Used as the URLPattern group of the function's `excludedPaths`, so a data request is never
 * excluded. The slash is escaped because a URLPattern group, unlike a regular expression, rejects a bare one.
 */
export const shellSegment = String.raw`[^\/.]+`;

/** Modules every route's document evaluates before the route module itself. */
export const shellRoots = ['entry.client.tsx', 'root.tsx'] as const;

/**
 * The project shell: every `/w/:workspace/:project` document is the one prerendered at `/w/__shell/__shell`. The
 * project route has no server loader and the server renders no project content (it lives on the device), so the
 * function's document was already a function of the deploy only (PL2 removed the visitor). `/preview` and every other
 * `/w/…` shape stay on the function.
 */
const projectClass: StaticShellClass = {
  id: 'project',
  label: 'project route',
  delivery: 'static-shell',
  via: 'rewrite',
  worker: 'cache-first',
  match: '/w/:workspace/:project',
  shellPath: `/w/${shellSentinel}/${shellSentinel}`,
  routes: ['w.$workspace.$project'],
  /*
   * The open graph adds the deferred editor (`project-live-sessions`) and the viewport's chat interface, which holds
   * the transcript and the composer.
   */
  interactive: [
    ...shellRoots,
    'routes/w.$workspace.$project/route.tsx',
    'routes/w.$workspace.$project/project-live-sessions.tsx',
    'routes/w.$workspace.$project/chat-interface-desktop.tsx',
    'routes/w.$workspace.$project/chat-interface-mobile.tsx',
  ],
};

/**
 * The Home shell (PL4): `/` is marketing or Home by the visitor's `tau-entry` preference, so the marketing edge function
 * chooses per request and rewrites a `tau-entry=app` visit to this document. Home has no server loader and the root
 * loader reads no visitor (PL2), so the function's Home was already a function of the deploy only. Every other answer at
 * `/` (no preference, `?website`, a write, the `www` alias) and the root data request (`/_root.data` or `/_.data`) stay
 * where they were.
 */
const homeClass: StaticShellClass = {
  id: 'home',
  label: 'Home',
  delivery: 'static-shell',
  via: 'edge',
  match: '/',
  shellPath: '/',
  routes: ['_index'],
  // Only for a visit the edge function would give the app ({@link homeAppEntry}); every other `/` passes through.
  worker: 'cache-first',
  // Home's open graph adds the rich composer, which `useNewProjectComposer` requests at mount.
  interactive: [...shellRoots, 'routes/_index/route.tsx', 'components/chat/new-project-chat-composer.tsx'],
  // LB9: a project row and the composer's first send both open the project route.
  warms: 'project',
};

/** The registry. Order is report order. */
export const routeClasses: readonly RouteClass[] = [
  projectClass,
  homeClass,
  {
    id: 'offline-shell',
    label: 'offline shell',
    // The neutral account document the service worker reopens offline (B5 R2); cloud builds only, like its route.
    delivery: 'prerendered',
    path: '/usage',
    routes: ['usage'],
    worker: 'network-first',
  },
  {
    id: 'public-file',
    label: 'public files',
    delivery: 'prerendered',
    routes: ['manifest[.webmanifest].ts', 'robots[.]txt', 'sitemap[.]xml'],
  },
  {
    id: 'publication',
    label: 'publication viewer',
    delivery: 'cdn-ssr',
    routes: ['s.$slug'],
  },
  {
    id: 'app-page',
    label: 'app pages',
    delivery: 'function',
    routes: [
      '$',
      'auth.cli',
      'auth.desktop',
      'community',
      'connect.github-gist',
      'convert',
      'files',
      'github.complete',
      'import.$',
      'invitations._index',
      'loader',
      'loader_.glass',
      'machines.$hostId.$machineId',
      'machines._index',
      'parts',
      'plugins',
      'projects_',
      'projects_.new',
      'w.$workspace.$project_.preview',
      'welcome',
      'workflows',
    ],
  },
  {
    id: 'resource',
    label: 'resource routes',
    delivery: 'function',
    routes: [
      'action.migrate-theme.ts',
      'api.monitoring',
      'api.ph.$',
      'api.reports',
      'assets.$',
      'auth.$',
      'health.build.ts',
      'health.live.ts',
      'health.ready.ts',
      'health.startup.ts',
      'i.$',
      'invitations.$token',
      'settings_',
      'settings_.$',
    ],
  },
  {
    id: 'fixture',
    label: 'test fixtures',
    delivery: 'function',
    routes: ['[__e2e].*', '[__debug].*'],
  },
];

/** The classes served by a static shell. */
export const staticShellClasses: readonly StaticShellClass[] = routeClasses.filter(
  (routeClass): routeClass is StaticShellClass => routeClass.delivery === 'static-shell',
);

/** The shells Netlify's generated rules serve from the URL alone. */
export const rewriteShellClasses: readonly StaticShellClass[] = staticShellClasses.filter(
  (routeClass) => routeClass.via === 'rewrite',
);

/** The shells the marketing edge function chooses per request. */
export const edgeShellClasses: readonly StaticShellClass[] = staticShellClasses.filter(
  (routeClass) => routeClass.via === 'edge',
);

/**
 * The class that owns an `app/routes` entry.
 *
 * @param entry - A route directory or file name.
 * @returns Every class claiming it: exactly one for a registered route.
 */
export const classesOwningRoute = (entry: string): RouteClass[] =>
  routeClasses.filter((routeClass) =>
    routeClass.routes.some((owned) => (owned.endsWith('*') ? entry.startsWith(owned.slice(0, -1)) : entry === owned)),
  );

/**
 * The class that owns a React Router route id (`routes/<entry>`, a file entry named without its extension), as
 * `useMatches()` reports it: the class `tau.load` measures carry (React Router 8 migration RR7).
 *
 * @param routeId - A route id.
 * @returns The owning class, or `undefined` for the root and an unregistered id.
 */
export const routeClassOfRouteId = (routeId: string): RouteClass | undefined => {
  if (!routeId.startsWith('routes/')) {
    return undefined;
  }
  const entry = routeId.slice('routes/'.length);
  return routeClasses.find((routeClass) =>
    routeClass.routes.some((owned) =>
      owned.endsWith('*') ? entry.startsWith(owned.slice(0, -1)) : owned.replace(/\.tsx?$/u, '') === entry,
    ),
  );
};

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/**
 * The regular expression a shell class's URLs match, the way Netlify matches them: the pattern's segments, each
 * `:name` one {@link shellSegment}, and an optional trailing slash.
 *
 * @param routeClass - A static-shell class.
 * @returns The anchored expression.
 */
export const shellPathExpression = (routeClass: StaticShellClass): RegExp =>
  new RegExp(
    `^${routeClass.match
      .split('/')
      .map((segment) => (segment.startsWith(':') ? `(${shellSegment})` : escapeRegExp(segment)))
      .join('/')}/?$`,
    'u',
  );

/**
 * The static shell Netlify serves for a pathname, if any: the routing the deployed site performs after its edge
 * functions, for tests and local servers that stand in for it. An edge shell (Home) depends on the request's cookies, so
 * none is named here; `netlify/edge-functions/marketing.ts` chooses it.
 *
 * @param pathname - A URL pathname, as sent (percent escapes kept).
 * @returns The class whose shell answers it, or `undefined` when the function does.
 */
export const staticShellFor = (pathname: string): StaticShellClass | undefined =>
  rewriteShellClasses.find((routeClass) => shellPathExpression(routeClass).test(pathname));

/**
 * Whether a pathname is a shell's own prerender path: the prerender pass renders it, and the root loader then renders
 * for every visitor of the class rather than for one URL.
 *
 * @param pathname - A URL pathname, with or without a trailing slash.
 * @returns `true` for a {@link StaticShellClass.shellPath}.
 */
export const isStaticShellPath = (pathname: string): boolean => {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return staticShellClasses.some((routeClass) => routeClass.shellPath === normalized);
};

/** The paths the build prerenders a shell at. */
export const staticShellPrerenderPaths = (): string[] => staticShellClasses.map((routeClass) => routeClass.shellPath);

/** The files React Router's prerender pass writes for one path, relative to the client output directory. */
export type PrerenderedFiles = Readonly<{ document: string; data: readonly string[] }>;

/**
 * The files the prerender pass writes for a path (`@react-router/dev` `prerenderRoute` and `prerenderData`): the
 * document at `<path>/index.html`, and the root loader's data at `<path>.data`. For `/` the data file is `_.data` under
 * the trailing-slash-aware data requests the app builds with (React Router 8's default), and `_root.data` without them,
 * so both are named.
 *
 * @param path - A prerender path.
 * @returns The document file and the candidate data files.
 */
export const prerenderedFiles = (path: string): PrerenderedFiles => {
  const relative = path.replaceAll(/^\/+|\/+$/gu, '');
  return relative === ''
    ? { document: 'index.html', data: ['_root.data', '_.data'] }
    : { document: `${relative}/index.html`, data: [`${relative}.data`] };
};

/**
 * The file a shell is served from, relative to the client output directory. A rewrite shell is served from the file the
 * prerender writes; an edge shell is moved to `__shell/<id>/index.html`, a path no route or rewrite answers, so that its
 * URL's own static path stays empty.
 *
 * @param routeClass - A static-shell class.
 * @returns The `index.html` path.
 */
export const shellDocumentFile = (routeClass: StaticShellClass): string =>
  routeClass.via === 'edge'
    ? `${shellSentinel}/${routeClass.id}/index.html`
    : prerenderedFiles(routeClass.shellPath).document;

/**
 * The React Router function's `excludedPaths` (`@netlify/vite-plugin-react-router`): each shell pattern in URLPattern
 * syntax, every parameter restricted to {@link shellSegment}. Netlify compiles each to a regular expression with an
 * optional trailing slash (`@netlify/zip-it-and-ship-it` `getRoutes`), so the function keeps exactly the URLs
 * {@link staticShellFor} does not claim, `.data` requests included.
 *
 * @returns The excluded paths.
 */
export const netlifyFunctionExcludedPaths = (): string[] =>
  rewriteShellClasses.map((routeClass) =>
    routeClass.match
      .split('/')
      .map((segment) => (segment.startsWith(':') ? `${segment}(${shellSegment})` : segment))
      .join('/'),
  );

/**
 * A shell class's first literal segment (`/w`): every URL of the class starts with it.
 *
 * @param routeClass - A static-shell class.
 * @returns The prefix, with its leading slash.
 */
const shellPrefix = (routeClass: StaticShellClass): string => `/${routeClass.match.split('/')[1] ?? ''}`;

/** One `[[redirects]]` rule of `netlify.toml`. */
export type NetlifyRedirect = Readonly<{ from: string; to: string; status: number; force: boolean }>;

/**
 * The redirect rules that serve each shell, in the order Netlify must evaluate them (first match wins). They are
 * reached only by the URLs the function excludes, since Netlify runs functions before redirects.
 *
 * 1. On the canonical production host's `www` alias, a permanent redirect to the apex, as the root loader's
 *    `throwRedirectIfSubdomain` answers a function document (path and query kept). Only the URLs the function
 *    excludes reach it, so it changes nothing the function still serves.
 * 2. A 200 rewrite to the shell, with and without the trailing slash the function's route also accepts.
 *
 * @param canonicalHost - The production hostname (`metaConfig.appDomain`).
 * @returns The rules.
 */
export const netlifyShellRedirects = (canonicalHost: string): NetlifyRedirect[] =>
  rewriteShellClasses.flatMap((routeClass) => {
    const placeholders = routeClass.match;
    const prefix = shellPrefix(routeClass);
    const shellFile = `/${shellDocumentFile(routeClass)}`;
    return [
      {
        from: `https://www.${canonicalHost}${prefix}/*`,
        to: `https://${canonicalHost}${prefix}/:splat`,
        status: 301,
        force: true,
      },
      { from: placeholders, to: shellFile, status: 200, force: false },
      { from: `${placeholders}/`, to: shellFile, status: 200, force: false },
    ];
  });

/**
 * The `Set-Cookie` a shell response sends (from `netlify.toml` for a rewrite shell, from the marketing edge function for
 * the Home shell): it expires the skew protection cookie (`tau_skew`) an earlier function
 * document set. A static shell cannot name its own deploy's token (OD7 waits on Netlify confirming the token is not a
 * secret), and a token left from an older deploy would pin the shell's asset requests to that deploy, which does not
 * hold this build's chunks. Unpinned, the shell's requests go to the live deploy, which serves this build and keeps the
 * previous builds' assets (`retain-previous-assets.mts`); the build-skew guard covers tabs older than that.
 * The attributes match the function's cookie, so the browser replaces that cookie and does not add a second one.
 * Netlify's edge cache answers a hit without this header rule's `Set-Cookie`, so the static shell edge function
 * (`netlify/edge-functions/static-shell.ts`) sets the same value on every shell response.
 *
 * @param cookieName - The skew protection cookie's name (`skewProtectionCookieName`).
 * @returns The header value.
 */
export const shellSkewCookie = (cookieName: string): string =>
  `${cookieName}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;

const tomlString = (value: string): string => JSON.stringify(value);

/**
 * The generated block of `netlify.toml`: each shell's redirect rules and the header rule for its URLs.
 *
 * @param options - The canonical production host and the skew protection cookie's name.
 * @returns The TOML text, without the surrounding marker comments.
 */
export const renderNetlifyShellRouting = ({
  canonicalHost,
  skewCookieName,
}: Readonly<{ canonicalHost: string; skewCookieName: string }>): string => {
  const redirects = netlifyShellRedirects(canonicalHost).map(
    (rule) =>
      `[[redirects]]\nfrom = ${tomlString(rule.from)}\nto = ${tomlString(rule.to)}\nstatus = ${String(rule.status)}\nforce = ${String(rule.force)}\n`,
  );
  const prefixes = [...new Set(rewriteShellClasses.map((routeClass) => `${shellPrefix(routeClass)}/*`))];
  const headers = prefixes.map(
    (prefix) =>
      `[[headers]]\nfor = ${tomlString(prefix)}\n[headers.values]\nSet-Cookie = ${tomlString(shellSkewCookie(skewCookieName))}\n`,
  );
  return [...redirects, ...headers].join('\n');
};

/**
 * The installed web app's start URL (`manifest.webmanifest`): `/` with a query the marketing edge function leaves to the
 * app (`resolveMarketingUrl`), so a launch opens Home whether or not the visitor's `tau-entry` preference is set, and
 * the service worker answers it from the Home shell.
 */
export const appStartUrl = '/?source=pwa';

/** A class the service worker answers, with the document it precaches for it. */
export type WorkerRouteClass = Readonly<{
  routeClass: RouteClass;
  delivery: WorkerDelivery;
  /** The document's root-relative URL in the client output: the file the precache stores and replays. */
  document: string;
  /** The URLs whose navigations the class's document answers. */
  matches: (pathname: string) => boolean;
}>;

/**
 * The classes the service worker answers, each with its precached document: a static shell's served file
 * ({@link shellDocumentFile}), or a prerendered class's own document at {@link DocumentRouteClass.path}.
 *
 * @returns The worker's classes, in registry order.
 */
export const workerRouteClasses = (): WorkerRouteClass[] =>
  routeClasses.flatMap((routeClass): WorkerRouteClass[] => {
    if (routeClass.worker === undefined) {
      return [];
    }
    if (routeClass.delivery === 'static-shell') {
      const expression = shellPathExpression(routeClass);
      return [
        {
          routeClass,
          delivery: routeClass.worker,
          document: `/${shellDocumentFile(routeClass)}`,
          matches: (pathname) => expression.test(pathname),
        },
      ];
    }
    const { path } = routeClass;
    if (routeClass.delivery !== 'prerendered' || path === undefined) {
      throw new Error(`${routeClass.label}: only a static shell or a prerendered path can be answered by the worker`);
    }
    return [
      {
        routeClass,
        delivery: routeClass.worker,
        document: `/${prerenderedFiles(path).document}`,
        matches: (pathname) => pathname === path || pathname === `${path}/`,
      },
    ];
  });

/** The parameters a link to `/` may carry and still get marketing from the edge function (`campaignParameters`). */
const marketingQueryParameters = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
]);

/**
 * Whether a document request for `/` is one the deployed site answers with Home, the way the marketing edge function
 * decides it (`selectDelivery` and `resolveMarketingUrl` in `netlify/edge-functions/marketing.ts`): the `tau-entry=app`
 * preference without `?website`, or a query the edge function leaves to the app ({@link appStartUrl}). Any other `/` is
 * marketing, which the service worker never answers.
 *
 * @param search - The request's query.
 * @param tauEntry - The `tau-entry` cookie's value, or `undefined` when unset or unreadable.
 * @returns `true` when the Home shell is the document for this request.
 */
export const homeAppEntry = (search: URLSearchParams, tauEntry: string | undefined): boolean => {
  if (search.has('website')) {
    return false;
  }
  if (tauEntry === 'app') {
    return true;
  }
  return [...search.keys()].some((name) => !marketingQueryParameters.has(name));
};
